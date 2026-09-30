import { test, expect, chromium, type Page } from '@playwright/test';

async function observeMedia(page: Page) {
  await page.addInitScript(() => {
    (window as any).__streams = []; (window as any).__pcs = [];
    const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => { const stream = await get(constraints); (window as any).__streams.push(stream); return stream; };
    const Original = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends Original { constructor(config?: RTCConfiguration) { super(config); (window as any).__pcs.push(this); } };
  });
}
async function enterPair(baseURL: string, speechFixture = false) {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const a = await browser.newPage(), b = await browser.newPage();
  await observeMedia(a); await observeMedia(b);
  if (speechFixture) await b.addInitScript(() => {
    // Explicit test-only provider: verifies event transport, not speech accuracy/service.
    class SyntheticSpeech {
      onstart?: () => void; onend?: () => void; onresult?: (e: unknown) => void;
      constructor() { (window as any).__speechFixture = this; }
      start() { this.onstart?.(); }
      stop() { this.onend?.(); }
      abort() {}
    }
    (window as any).SpeechRecognition = SyntheticSpeech;
  });
  await a.goto(baseURL); await a.getByLabel('Твоё имя').fill('Alice');
  await a.getByRole('button', { name: 'Создать комнату' }).click();
  await expect(a.getByText('Ждём собеседника', { exact: true })).toBeVisible();
  const link = await a.getByLabel('Ссылка комнаты').inputValue();
  await b.goto(link); await b.getByLabel('Твоё имя').fill('Bob');
  await b.getByRole('button', { name: 'Подключиться', exact: true }).click();
  await expect(a.getByRole('status').filter({ hasText: 'Соединение установлено' })).toBeVisible({ timeout: 35000 });
  await expect(b.getByRole('status').filter({ hasText: 'Соединение установлено' })).toBeVisible({ timeout: 35000 });
  return { browser, a, b, link };
}
async function hasInbound(page: Page, kind: string) {
  return page.evaluate(async kind => {
    const pc = (window as any).__pcs[0] as RTCPeerConnection;
    const stats = await pc.getStats();
    return [...stats.values()].some(s => s.type === 'inbound-rtp' && s.kind === kind && s.bytesReceived > 0);
  }, kind);
}
test('two clients: real WebRTC video/audio, messages, synthetic speech events, occupied room and cleanup', async ({ baseURL }) => {
  const { browser, a, b, link } = await enterPair(baseURL!, true);
  try {
    for (const page of [a, b]) {
      await expect.poll(() => page.getByLabel('Видео собеседника', { exact: true }).evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0).catch(async e => {
        console.log('VIDEO_DIAGNOSTIC', await page.evaluate(async () => ({
          videos: [...document.querySelectorAll('video')].map(v => ({ width: v.videoWidth, paused: v.paused, ready: v.readyState, tracks: (v.srcObject as MediaStream | null)?.getTracks().map(t => ({ kind: t.kind, muted: t.muted, enabled: t.enabled, state: t.readyState })) })),
          stats: [...(await (window as any).__pcs[0].getStats()).values()].filter((s: any) => ['inbound-rtp', 'outbound-rtp', 'media-source'].includes(s.type)),
          text: document.body.innerText,
        })));
        throw e;
      });
      await expect.poll(() => hasInbound(page, 'video')).toBe(true);
      await page.getByRole('button', { name: 'Включить микрофон', exact: true }).click();
    }
    await expect.poll(() => hasInbound(a, 'audio')).toBe(true);
    await expect.poll(() => hasInbound(b, 'audio')).toBe(true);
    await a.getByRole('button', { name: 'Выключить камеру', exact: true }).click();
    await expect(a.getByRole('button', { name: 'Включить камеру', exact: true })).toBeEnabled();
    expect(await a.evaluate(() => (window as any).__streams[0].getVideoTracks()[0].readyState)).toBe('ended');
    await a.getByRole('button', { name: 'Включить камеру', exact: true }).click();
    await expect(a.getByRole('button', { name: 'Выключить камеру', exact: true })).toBeEnabled();
    await a.getByLabel('Написать или исправить сообщение').fill('Synthetic transport check');
    await a.getByRole('button', { name: 'Отправить текст' }).click();
    await expect(b.locator('.conversation li')).toHaveCount(1);
    await expect(b.locator('.conversation li')).toContainText('Alice');
    await expect(a.locator('.conversation li')).toContainText('Доставлено');
    await b.getByRole('button', { name: 'Включить субтитры', exact: true }).click();
    await expect(b.getByLabel('Видео собеседника', { exact: true })).toHaveJSProperty('muted', true);
    const emit = (final: boolean) => b.evaluate(final => {
      (window as any).__speechFixture.onresult({ resultIndex: 0, results: [{ isFinal: final, 0: { transcript: final ? 'Synthetic final caption' : 'Synthetic interim' } }] });
    }, final);
    await emit(false);
    await expect(a.locator('.subtitles')).toContainText('Synthetic interim');
    await expect(a.locator('.conversation li')).toHaveCount(1);
    await emit(true); await emit(true);
    await expect(a.locator('.conversation li')).toHaveCount(2);
    await expect(b.locator('.conversation li')).toHaveCount(2);
    await expect(a.locator('.subtitles')).toContainText('Synthetic final caption');
    await b.getByRole('button', { name: 'Остановить субтитры', exact: true }).click();
    await expect(b.getByLabel('Видео собеседника', { exact: true })).toHaveJSProperty('muted', false);
    await a.getByRole('button', { name: 'Включить жесты', exact: true }).click();
    await expect(a.getByRole('status').filter({ hasText: 'Руки не видны' })).toBeVisible({ timeout: 30000 });
    await expect(a.getByRole('button', { name: 'Подтвердить и отправить' })).toBeDisabled();
    const c = await browser.newPage(); await observeMedia(c); await c.goto(link);
    await c.getByRole('button', { name: 'Подключиться', exact: true }).click();
    await expect(c.getByRole('status').filter({ hasText: 'Комната занята' })).toBeVisible();
    expect(await c.evaluate(() => (window as any).__streams.every((s: MediaStream) => s.getTracks().every(t => t.readyState === 'ended')))).toBe(true);
    await a.screenshot({ path: 'test-results/call-desktop.png', fullPage: true });
    await a.getByRole('button', { name: 'Завершить звонок' }).click();
    for (const page of [a, b]) {
      await expect(page.getByRole('heading', { name: 'История разговора' })).toBeVisible();
      await expect(page.locator('.conversation li')).toHaveCount(2);
      expect(await page.evaluate(() => (window as any).__streams.every((s: MediaStream) => s.getTracks().every(t => t.readyState === 'ended')))).toBe(true);
      expect(await page.evaluate(() => (window as any).__pcs.every((pc: RTCPeerConnection) => pc.connectionState === 'closed'))).toBe(true);
    }
  } finally { await browser.close(); }
});
test('module integration: gesture messages use real data channel and duplicate id is ignored', async ({ baseURL }) => {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const a = await browser.newPage(), b = await browser.newPage();
  try {
    await a.goto(baseURL + '/tests/parity.html'); await b.goto(baseURL + '/tests/parity.html');
    console.log('REAL_SPEECH_API', await a.evaluate(() => ({ standard: typeof (window as any).SpeechRecognition, prefixed: typeof (window as any).webkitSpeechRecognition })));
    const id = await a.evaluate(async () => (await (await fetch('/api/rooms', { method: 'POST' })).json()).roomId);
    for (const [page, name] of [[a, 'Signer'], [b, 'Listener']] as const) {
      await page.evaluate(async ({ id, name }) => {
        const { CallSession } = await import('/src/callSession.ts');
        const call = new CallSession(id, name, { status: () => {}, local: () => {}, remote: () => {}, changed: () => {}, media: () => {} });
        (window as any).__call = call; await call.start();
      }, { id, name });
    }
    for (const p of [a, b]) await expect.poll(() => p.evaluate(() => (window as any).__call.canSend)).toBe(true);
    await a.evaluate(() => { (window as any).__call.send('gesture', 'day', true, 'synthetic-confirmed-gesture'); (window as any).__call.send('gesture', 'day', true, 'synthetic-confirmed-gesture'); });
    await expect.poll(() => b.evaluate(() => (window as any).__call.conversation.entries.length)).toBe(1);
    expect(await b.evaluate(() => (window as any).__call.conversation.entries[0].kind)).toBe('gesture');
    // Losing signaling ends both clients; this is separate from the hang-up button test.
    await a.evaluate(() => (window as any).__call.socket.close());
    await expect.poll(() => b.evaluate(() => (window as any).__call.status)).toBe('ended');
  } finally { await browser.close(); }
});
test('peer tab closes: remaining client ends and releases media', async ({ baseURL }) => {
  const { browser, a, b } = await enterPair(baseURL!);
  try {
    await b.close();
    await expect(a.getByRole('heading', { name: 'История разговора' })).toBeVisible({ timeout: 10000 });
    expect(await a.evaluate(() => (window as any).__streams.every((s: MediaStream) => s.getTracks().every(t => t.readyState === 'ended')))).toBe(true);
  } finally { await browser.close(); }
});
test('call permission denied and missing speech support have clear states', async ({ page, baseURL }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
  await page.goto(baseURL!); await page.getByRole('button', { name: 'Создать комнату' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Доступ к камере закрыт' })).toBeVisible();
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  try {
    const other = await browser.newPage();
    await other.addInitScript(() => {
      (window as any).SpeechRecognition = undefined; (window as any).webkitSpeechRecognition = undefined;
      const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async constraints => {
        if (constraints?.audio) throw new DOMException('synthetic microphone denial', 'NotAllowedError');
        return get(constraints);
      };
    });
    await other.goto(baseURL!); await other.getByRole('button', { name: 'Создать комнату' }).click();
    await expect(other.getByRole('status').filter({ hasText: 'Распознавание речи недоступно' })).toBeVisible();
    await expect(other.getByRole('button', { name: 'Включить субтитры', exact: true })).toBeDisabled();
    await expect(other.getByRole('button', { name: 'Включить микрофон', exact: true })).toBeEnabled();
    await other.getByRole('button', { name: 'Включить микрофон', exact: true }).click();
    await expect(other.getByRole('alert')).toContainText('Микрофон недоступен');
    await other.setViewportSize({ width: 390, height: 844 });
    expect(await other.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await other.screenshot({ path: 'test-results/call-mobile.png', fullPage: true });
  } finally { await browser.close(); }
});

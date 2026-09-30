import { test, expect, chromium } from '@playwright/test';

test('module integration: synthetic command landmarks drive real call without gesture buttons', async ({baseURL}) => {
  const browser = await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const a = await browser.newPage(), b = await browser.newPage();
  try {
    await a.goto(baseURL!);
    // Test-only substitutions. The production app has no fixture inputs or debug globals.
    await a.evaluate(async () => {
      const moduleUrl = (name: string) => performance.getEntriesByType('resource').map(e=>e.name).findLast(url=>url.includes('/src/'+name+'.ts'))!;
      const {Tracker} = await import(moduleUrl('camera'));
      const {GestureModel} = await import(moduleUrl('model'));
      const {handPose} = await import('/tests/commandFixtures.ts');
      const w = window as any; w.__pose = null; w.__predictions = 0;
      Tracker.prototype.detect = function(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
        canvas.width=video.videoWidth; canvas.height=video.videoHeight;
        const pose = w.__pose;
        w.__detected = (w.__detected ?? 0)+1; this.fullHands = pose ? [handPose(pose === 'word' ? 'neutral' : pose, pose !== 'word').map(p => ({...p,x:p.x/(video.videoWidth/video.videoHeight)}))] : [];
        w.__hand = this.fullHands; return {hand_0:this.fullHands[0]?.filter((_:unknown,i:number) => [4,8,12,16,20].includes(i)) ?? [],hand_1:[],pose:Array.from({length:6},()=>({x:.5,y:.5,z:0,visibility:1}))};
      };
      GestureModel.prototype.predict = async function() { w.__predictions++; return this.meta.labels.map(word => word === 'day' ? .99 : .001); };
    });
    await a.getByRole('button',{name:'Создать комнату'}).click();
    await expect(a.getByText('Ждём собеседника',{exact:true})).toBeVisible();
    await b.goto(await a.getByLabel('Ссылка комнаты').inputValue());
    await b.getByRole('button',{name:'Подключиться',exact:true}).click();
    await expect(a.getByRole('status').filter({hasText:'Соединение установлено'})).toBeVisible();
    const pose = async (value: string | null) => { await a.evaluate(value => { (window as any).__pose=value; },value); };
    await pose('palm');
    await expect(a.getByRole('button',{name:'Выключить жесты',exact:true})).toBeVisible({timeout:30000});
    await pose('word');
    await expect(a.locator('.draft')).toHaveText('day',{timeout:15000});
    await pose('neutral');
    await expect(a.getByText('Слова приостановлены.',{exact:false})).toBeVisible();
    const count = await a.evaluate(() => (window as any).__predictions);
    await a.waitForTimeout(1000);
    expect(await a.evaluate(() => (window as any).__predictions)).toBe(count);
    await expect(a.locator('.draft')).toHaveText('day');
    await pose('palm');
    await expect(b.locator('.conversation li')).toHaveCount(1);
    await a.waitForTimeout(1300); await expect(b.locator('.conversation li')).toHaveCount(1);
    await pose(null); await a.waitForTimeout(1100); await pose('word');
    await a.waitForTimeout(700); expect(await a.evaluate(() => (window as any).__predictions)).toBe(count);
    await expect(a.locator('.draft')).toHaveText('day',{timeout:15000});
    await pose('fist'); await expect(a.locator('.draft')).toHaveText('Черновик пуст');
    await expect(b.locator('.conversation li')).toHaveCount(1);
    await pose('neutral'); await a.waitForTimeout(700); await pose('v');
    await expect(a.getByRole('heading',{name:'Завершить звонок?'})).toBeVisible();
    await pose('palm'); await a.waitForTimeout(1400);
    await expect(a.getByRole('heading',{name:'Завершить звонок?'})).toBeVisible();
    await pose('neutral'); await a.waitForTimeout(700); await pose('fist');
    await expect(a.getByRole('heading',{name:'Завершить звонок?'})).toHaveCount(0);
    await pose('neutral'); await a.waitForTimeout(700); await pose('v');
    await expect(a.getByRole('heading',{name:'Завершить звонок?'})).toBeVisible();
    await pose('neutral'); await a.waitForTimeout(700); await pose('palm');
    for (const page of [a,b]) await expect(page.getByRole('heading',{name:'История разговора'})).toBeVisible();
  } catch(error) { console.log('COMMAND_DIAGNOSTIC',await a.evaluate(async()=>({text:document.body.innerText,hand:(window as any).__hand,detected:(window as any).__detected,measure:(await import('/src/commands.ts')).measureHand((window as any).__hand?.[0] ?? [],4/3)}))); throw error; } finally { await browser.close(); }
});

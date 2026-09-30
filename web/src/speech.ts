export type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
export type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null; onstart: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
type RecognitionConstructor = new () => Recognition;
export function speechConstructor(): RecognitionConstructor | undefined {
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}
// Result indices are unique within a recognition run, including repeated phrases.
export class SpeechResults {
  private final = new Set<number>();
  private interim = new Map<number, string>();
  constructor(readonly runId: string) {}
  consume(event: SpeechEvent) {
    const packets: { id: string; text: string; final: boolean }[] = [];
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (this.final.has(i)) continue;
      const text = result[0].transcript.trim().slice(0, 2000);
      if (result.isFinal) { this.final.add(i); this.interim.delete(i); }
      else { if (this.interim.get(i) === text) continue; this.interim.set(i, text); }
      packets.push({ id: `${this.runId}:${i}`, text, final: result.isFinal });
    }
    return packets;
  }
}
export class SpeechInput {
  private recognition: Recognition | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(readonly emit: (id: string, text: string, final: boolean) => void,
    readonly state: (active: boolean, message: string) => void) {}
  start() {
    if (this.recognition) return;
    const Constructor = speechConstructor();
    if (!Constructor) { this.state(false, 'Распознавание речи недоступно в этом браузере. Попробуй Chrome с поддержкой Web Speech или напиши сообщение.'); return; }
    const recognition = new Constructor(); this.recognition = recognition;
    const results = new SpeechResults(crypto.randomUUID());
    recognition.lang = 'en-US'; recognition.continuous = true; recognition.interimResults = true;
    this.state(true, 'Подключение распознавания английской речи… Звук собеседника временно выключен.');
    recognition.onstart = () => this.state(true, 'Слушаю английскую речь. Звук собеседника временно выключен.');
    recognition.onresult = event => { for (const p of results.consume(event)) this.emit(p.id, p.text, p.final); };
    recognition.onerror = event => {
      const messages: Record<string, string> = {
        'not-allowed': 'Доступ к распознаванию микрофона запрещён. Проверь разрешения сайта.',
        'service-not-allowed': 'Сервис распознавания недоступен в этом браузере.',
        'audio-capture': 'Микрофон недоступен. Проверь устройство и разрешения.',
        'network': 'Сервис распознавания речи недоступен. Проверь интернет и попробуй снова.',
        'no-speech': 'Речь не обнаружена. Включи распознавание снова и говори ближе к микрофону.',
        'language-not-supported': 'Сервис не поддерживает en-US. Попробуй другой браузер.',
      };
      this.cancel(messages[event.error] ?? 'Распознавание остановлено. Попробуй включить его снова.');
    };
    recognition.onend = () => this.cancel('Распознавание остановлено. Можно включить снова.');
    try { recognition.start(); } catch { this.cancel('Не удалось начать распознавание. Проверь разрешение микрофона.'); }
  }
  stop() {
    if (!this.recognition) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.cancel('Распознавание остановлено.'), 2000);
    try { this.recognition.stop(); } catch { this.cancel('Распознавание остановлено.'); }
  }
  cancel(message = 'Распознавание выключено.') {
    clearTimeout(this.timer);
    const recognition = this.recognition; this.recognition = null;
    if (recognition) {
      recognition.onresult = recognition.onerror = recognition.onend = recognition.onstart = null;
      recognition.abort();
    }
    if (recognition) this.emit(crypto.randomUUID(), '', false);
    this.state(false, message);
  }
}

import { useEffect, useRef, useState, type RefObject } from 'react';
import { defaults, Sequence, Stability, visibilityHint, type Settings } from './core';
import { GestureModel } from './model';
import { Tracker } from './camera';

export function useGesture(video: RefObject<HTMLVideoElement | null>, canvas: RefObject<HTMLCanvasElement | null>, enabled: boolean) {
  const [settings, setSettings] = useState<Settings>(defaults);
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const gate = useRef(new Stability());
  const sequence = useRef<Sequence | null>(null);
  const revision = useRef(0);
  const [labels, setLabels] = useState<string[]>([]);
  const [draft, setDraft] = useState<string | null>(null);
  const [scores, setScores] = useState<{ word: string; score: number }[]>([]);
  const [hint, setHint] = useState('Включи распознавание жестов, когда будешь готов.');
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    fetch(`${import.meta.env.BASE_URL}model/metadata.json`, { signal: abort.signal }).then(r => r.json()).then(m => setLabels(m.labels)).catch(() => {});
    return () => abort.abort();
  }, []);
  useEffect(() => {
    if (!enabled) { setDraft(null); setScores([]); setProgress(0); gate.current.clearCandidate(); return; }
    let cancelled = false, raf = 0, lastSample = -Infinity, lastFrame = -1;
    let model: GestureModel | undefined, tracker: Tracker | undefined;
    let pending: Promise<void> = Promise.resolve();
    const reset = () => { sequence.current?.reset(); gate.current.clearCandidate(); setDraft(null); setScores([]); setProgress(0); };
    const loop = (now: number) => {
      if (cancelled) return;
      const element = video.current;
      if (document.hidden || !element || element.readyState < 2 || element.currentTime === lastFrame || now - lastSample < 1000 / 15) {
        if (now - lastSample > 350) reset();
        raf = requestAnimationFrame(loop); return;
      }
      lastSample = now; lastFrame = element.currentTime;
      pending = (async () => {
        const frame = tracker!.detect(element, canvas.current!, now);
        gate.current.tracking(frame.hand_0.length + frame.hand_1.length > 0, now);
        const issue = visibilityHint(frame);
        if (sequence.current!.lastTime !== null && now - sequence.current!.lastTime > 350) reset();
        const rows = sequence.current!.push(frame, now);
        setProgress(sequence.current!.progress);
        if (issue) { reset(); setHint(issue); return; }
        if (!rows) { if (sequence.current!.rows.length < 5) setHint('Рука видна. Покажи движение целиком: накапливаю последовательность.'); return; }
        const currentRevision = revision.current;
        const output = await model!.predict(rows);
        if (cancelled || currentRevision !== revision.current) return;
        setScores(output.map((score, i) => ({ score, word: model!.meta.labels[i] })).sort((a, b) => b.score - a.score).slice(0, 3));
        const candidate = gate.current.update(output, model!.meta.labels, settingsRef.current);
        setDraft(candidate);
        setHint(candidate ? 'Проверь черновик и подтверди слово для отправки.'
          : gate.current.candidate && gate.current.confirmed === gate.current.candidate ? 'Это слово уже отправлено. Для повтора убери руки на секунду.'
          : gate.current.candidate ? `Проверка устойчивости: ${gate.current.count}/${settingsRef.current.stableWindows} окон.`
          : 'Результат неопределён. Повтори знакомое движение из словаря, оставаясь в кадре.');
      })();
      void pending.then(() => { if (!cancelled) raf = requestAnimationFrame(loop); }).catch(error => {
        console.error(error); if (!cancelled) { reset(); setHint('Ошибка распознавания. Выключи и включи распознавание жестов.'); }
      });
    };
    pending = (async () => {
      setHint('Загрузка модели слов…'); model = await GestureModel.load(); if (cancelled) return;
      setLabels(model.meta.labels); setHint('Загрузка точек рук и тела…'); tracker = await Tracker.load(); if (cancelled) return;
      sequence.current = new Sequence(model.meta); raf = requestAnimationFrame(loop);
    })();
    void pending.catch(error => { console.error(error); if (!cancelled) setHint('Не удалось загрузить распознавание. Проверь соединение и перезагрузи страницу.'); });
    return () => {
      cancelled = true; cancelAnimationFrame(raf);
      void pending.catch(() => {}).then(async () => { tracker?.dispose(); await model?.dispose(); });
      canvas.current?.getContext('2d')?.clearRect(0, 0, canvas.current.width, canvas.current.height);
    };
  }, [enabled, video, canvas]);
  function confirm(send: (word: string) => boolean) {
    if (!draft || gate.current.candidate !== draft || gate.current.count < settingsRef.current.stableWindows || gate.current.confirmed === draft) return;
    if (send(draft) && gate.current.confirm(draft, settingsRef.current)) setDraft(null);
  }
  function clear() { revision.current++; setDraft(null); setScores([]); setProgress(0); gate.current.clearCandidate(); sequence.current?.reset(); }
  function configure(next: Settings) { settingsRef.current = next; setSettings(next); clear(); }
  return { settings, configure, labels, draft, scores, hint, progress, confirm, clear };
}

import { useEffect, useRef, useState, type RefObject } from 'react';
import { defaults, Sequence, Stability, visibilityHint, type Settings } from './core';
import { GestureModel } from './model';
import { Tracker } from './camera';
import { CommandController, CommandConversation, controlArea, measureHand, trainingHint, type Command } from './commands';

export function useGesture(video: RefObject<HTMLVideoElement | null>, canvas: RefObject<HTMLCanvasElement | null>, enabled: boolean,
  send: (word: string) => boolean, end: () => void) {
  const callbacks = useRef({send,end}); callbacks.current = {send,end};
  const [settings, setSettings] = useState<Settings>(defaults);
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const gate = useRef(new Stability()), controls = useRef(new CommandController()), conversation = useRef(new CommandConversation());
  const sequence = useRef<Sequence | null>(null), revision = useRef(0);
  const [labels, setLabels] = useState<string[]>([]), [, render] = useState(0);
  const [scores, setScores] = useState<{ word: string; score: number }[]>([]);
  const [hint, setHint] = useState('Загрузка распознавания…'), [progress, setProgress] = useState(0);
  const [control, setControl] = useState({paused:false,active:false,progress:0,hint:'После загрузки покажи ладонь в рамке, чтобы включить общение.'});
  const [training, setTraining] = useState<Command | null>(null), trainingRef = useRef(training); trainingRef.current = training;
  const [feedback, setFeedback] = useState(''), [lesson, setLesson] = useState('');
  function resetWords() { revision.current++; sequence.current?.reset(); gate.current.clearCandidate(); setScores([]); setProgress(0); }
  function perform(command: Command) {
    const word = conversation.current.draft;
    const result = conversation.current.act(command, performance.now(), callbacks.current.send, callbacks.current.end);
    if (word && !conversation.current.draft) gate.current.confirmed = word;
    resetWords(); setFeedback(result); render(v => v+1);
  }
  useEffect(() => {
    const abort = new AbortController();
    fetch(`${import.meta.env.BASE_URL}model/metadata.json`, { signal: abort.signal }).then(r => r.json()).then(m => setLabels(m.labels)).catch(() => {});
    return () => abort.abort();
  }, []);
  useEffect(() => {
    controls.current.reset(); resetWords();
    if (!enabled) { conversation.current.confirmUntil = null; setControl({paused:false,active:false,progress:0,hint:'Включи камеру для управления жестами.'}); return; }
    setControl({paused:false,active:false,progress:0,hint:'Загрузка модели и точек. Дождись появления рамки на видео.'});
    let cancelled = false, raf = 0, lastSample = -Infinity, lastFrame = -1, paused = false;
    let model: GestureModel | undefined, tracker: Tracker | undefined;
    let pending: Promise<void> = Promise.resolve();
    const loop = (now: number) => {
      if (cancelled) return;
      const wasEnding = conversation.current.confirmUntil !== null;
      conversation.current.expire(now);
      if (wasEnding && conversation.current.confirmUntil === null) setFeedback('Запрос завершения отменён: время истекло.');
      const element = video.current;
      if (document.hidden || !element || element.readyState < 2 || element.currentTime === lastFrame || now-lastSample < 1000/15) {
        if (document.hidden || now-lastSample > 350) { if (conversation.current.confirmUntil !== null) setFeedback('Запрос завершения отменён: кадры не поступают.'); conversation.current.confirmUntil = null; controls.current.reset(); resetWords(); setControl({paused:false,active:false,progress:0,hint:'Кадры не поступают. Вернись во вкладку и проверь камеру.'}); }
        raf = requestAnimationFrame(loop); return;
      }
      lastSample = now; lastFrame = element.currentTime;
      pending = (async () => {
        const frame = tracker!.detect(element, canvas.current!, now), aspect = element.videoWidth/element.videoHeight;
        const state = controls.current.tick(tracker!.fullHands,now,aspect,trainingRef.current); setControl(state);
        const ctx = canvas.current!.getContext('2d')!, w = canvas.current!.width, h = canvas.current!.height;
        ctx.fillStyle = state.paused ? '#ffd16635' : '#71efd020'; ctx.strokeStyle = state.active ? '#ffd166' : '#71efd0'; ctx.lineWidth = 4;
        ctx.fillRect(controlArea.x*w,controlArea.y*h,controlArea.width*w,controlArea.height*h);
        ctx.strokeRect(controlArea.x*w,controlArea.y*h,controlArea.width*w,controlArea.height*h);
        if (trainingRef.current) {
          const inside = tracker!.fullHands.filter(hand => measureHand(hand,aspect).inside);
          setLesson(inside.length > 1 ? 'Оставь в области управления одну руку.' : trainingHint(inside[0] ?? tracker!.fullHands[0] ?? [],trainingRef.current,aspect));
          if (state.fired === trainingRef.current) setFeedback('Упражнение выполнено. Команда не отправляется в режиме обучения.');
        } else if (state.fired) perform(state.fired);
        const pause = state.paused || !!trainingRef.current || !conversation.current.communicating || conversation.current.confirmUntil !== null;
        if (pause || paused) resetWords();
        paused = pause;
        gate.current.tracking(frame.hand_0.length+frame.hand_1.length > 0,now);
        if (pause) return;
        const issue = visibilityHint(frame);
        if (sequence.current!.lastTime !== null && now-sequence.current!.lastTime > 350) resetWords();
        const rows = sequence.current!.push(frame,now); setProgress(sequence.current!.progress);
        if (issue) { resetWords(); setHint(issue); return; }
        if (!rows) { setHint('Рука видна. Покажи движение целиком: накапливаю последовательность.'); return; }
        const currentRevision = revision.current, output = await model!.predict(rows);
        if (cancelled || currentRevision !== revision.current) return;
        setScores(output.map((score,i) => ({score,word:model!.meta.labels[i]})).sort((a,b) => b.score-a.score).slice(0,3));
        conversation.current.offer(gate.current.update(output,model!.meta.labels,settingsRef.current)); render(v => v+1);
        setHint(conversation.current.draft ? 'Черновик сохранён. Ладонь в рамке — отправить, кулак — отменить и повторить слово.'
          : gate.current.candidate === gate.current.confirmed && gate.current.confirmed ? 'Это слово уже обработано. Для повтора убери руки на секунду.'
          : 'Результат неопределён или ещё не устойчив. Повтори знакомое движение из словаря.');
      })();
      void pending.then(() => { if (!cancelled) raf = requestAnimationFrame(loop); }).catch(error => {
        console.error(error); if (!cancelled) { resetWords(); controls.current.reset(); setHint('Ошибка распознавания. Выключи и включи камеру.'); setControl({paused:false,active:false,progress:0,hint:'Распознавание остановлено. Выключи и включи камеру.'}); }
      });
    };
    pending = (async () => {
      setHint('Загрузка модели слов…'); model = await GestureModel.load(); if (cancelled) return;
      setLabels(model.meta.labels); setHint('Загрузка точек рук и тела…'); tracker = await Tracker.load(); if (cancelled) return;
      sequence.current = new Sequence(model.meta); setHint('Точки и модель готовы. Удержи ладонь в рамке, чтобы включить общение.'); raf = requestAnimationFrame(loop);
    })();
    void pending.catch(error => { console.error(error); if (!cancelled) { setHint('Не удалось загрузить распознавание. Перезагрузи страницу.'); setControl({paused:false,active:false,progress:0,hint:'Не удалось загрузить модель или точки. Перезагрузи страницу.'}); } });
    return () => {
      cancelled = true; cancelAnimationFrame(raf);
      void pending.catch(() => {}).then(async () => { tracker?.dispose(); await model?.dispose(); });
      canvas.current?.getContext('2d')?.clearRect(0,0,canvas.current.width,canvas.current.height);
    };
  }, [enabled,video,canvas]);
  function clear() { const word = conversation.current.draft; if (word) gate.current.confirmed = word; conversation.current.draft = null; resetWords(); render(v => v+1); }
  function configure(next: Settings) { settingsRef.current = next; setSettings(next); resetWords(); }
  function toggle() { conversation.current.communicating = !conversation.current.communicating; controls.current.reset(); resetWords(); render(v => v+1); }
  function train(next: Command | null) { conversation.current.confirmUntil = null; trainingRef.current = next; setTraining(next); controls.current.reset(); resetWords(); setFeedback(''); setLesson('Покажи всю кисть в рамке. Обучение не отправляет команды.'); }
  return { settings,configure,labels,draft:conversation.current.draft,scores,hint,progress,clear,confirm:() => perform('palm'),
    communicating:conversation.current.communicating,toggle,control,feedback,training,train,lesson,
    ending:conversation.current.confirmUntil !== null,cancelEnd:() => perform('fist') };
}

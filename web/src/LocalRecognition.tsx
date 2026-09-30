import { getPhrase, phraseExplanation } from './phraseMapping';
import { useEffect, useRef, useState } from 'react';
import { defaults, Sequence, Stability, visibilityHint, type Metadata, type Settings } from './core';
import { GestureModel } from './model';
import { Tracker, cameraError } from './camera';
type Run = { cancelled: boolean; raf: number; pending: Promise<void>; stream?: MediaStream; model?: GestureModel; tracker?: Tracker; sequence?: Sequence };
type Message = { word: string; time: string };

export default function LocalRecognition() {
  const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const runRef = useRef<Run | null>(null), gate = useRef(new Stability());
  const [phase, setPhase] = useState('Камера выключена');
  const [active, setActive] = useState(false), [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('Включи камеру и расположи руки и верхнюю часть тела в кадре.');
  const [error, setError] = useState(''), [labels, setLabels] = useState<string[]>([]);
  const [scores, setScores] = useState<{ word: string; value: number }[]>([]);
  const [draft, setDraft] = useState<string | null>(null), [progress, setProgress] = useState(0);
  const [history, setHistory] = useState<Message[]>([]), [settings, setSettings] = useState<Settings>(defaults);
  const settingsRef = useRef(settings); settingsRef.current = settings;

  async function release(run: Run) {
    run.cancelled = true; cancelAnimationFrame(run.raf);
    run.stream?.getTracks().forEach(track => track.stop());
    await run.pending.catch(() => {});
    run.stream?.getTracks().forEach(track => track.stop());
    run.tracker?.dispose();
    await run.model?.dispose();
  }
  async function stop() {
    const run = runRef.current;
    if (!run) return;
    runRef.current = null; setBusy(true); setActive(false);
    gate.current = new Stability(); setDraft(null); setScores([]); setProgress(0);
    setPhase('Камера выключена'); setHint('Можно включить камеру снова. История сохранена до закрытия страницы.');
    try { await release(run); } finally {
      if (video.current) video.current.srcObject = null;
      const ctx = canvas.current?.getContext('2d'); ctx?.clearRect(0, 0, canvas.current!.width, canvas.current!.height);
      setBusy(false);
    }
  }
  useEffect(() => {
    const abort = new AbortController();
    fetch(`${import.meta.env.BASE_URL}model/metadata.json`, { signal: abort.signal })
      .then(r => { if (!r.ok) throw new Error('Словарь недоступен. Выполни экспорт модели.'); return r.json(); })
      .then((m: Metadata) => setLabels(m.labels)).catch(e => { if (e.name !== 'AbortError') setError(cameraError(e)); });
    const hidden = () => { if (document.hidden) void stop(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { abort.abort(); document.removeEventListener('visibilitychange', hidden); const run = runRef.current; runRef.current = null; if (run) void release(run); };
  }, []);

  async function start() {
    if (runRef.current || busy) return;
    setBusy(true); setError(''); setScores([]); setDraft(null); setProgress(0);
    gate.current = new Stability();
    const run: Run = { cancelled: false, raf: 0, pending: Promise.resolve() };
    runRef.current = run;
    let lastSample = -Infinity, lastVideoTime = -1;
    const loop = (now: number) => {
      if (run.cancelled) return;
      if (now - lastSample < 1000 / 15 || video.current!.readyState < 2 || video.current!.currentTime === lastVideoTime) {
        if (now - lastSample > 350) {
          run.sequence!.reset(); gate.current.clearCandidate(); setDraft(null); setScores([]); setProgress(0);
          setHint('Кадры задерживаются. Проверь камеру и закрой тяжёлые вкладки.');
        }
        run.raf = requestAnimationFrame(loop); return;
      }
      lastSample = now; lastVideoTime = video.current!.currentTime;
      run.pending = (async () => {
        const frame = run.tracker!.detect(video.current!, canvas.current!, now);
        gate.current.tracking(frame.hand_0.length + frame.hand_1.length > 0, now);
        const issue = visibilityHint(frame);
        const stale = run.sequence!.lastTime !== null && now - run.sequence!.lastTime > 350;
        if (stale) { gate.current.clearCandidate(); setDraft(null); setScores([]); }
        const rows = run.sequence!.push(frame, now);
        setProgress(run.sequence!.progress);
        if (issue) {
          gate.current.clearCandidate(); setDraft(null); setScores([]); setPhase('Проверь положение в кадре'); setHint(issue); return;
        }
        if (!rows) {
          if (run.sequence!.rows.length < 5) { setPhase('Накопление последовательности'); setHint('Рука видна. Покажи движение целиком, оставаясь в кадре.'); }
          return;
        }
        const prediction = await run.model!.predict(rows);
        if (run.cancelled) return;
        const top = prediction.map((value, i) => ({ word: run.model!.meta.labels[i], value })).sort((a, b) => b.value - a.value).slice(0, 3);
        setScores(top);
        const candidate = gate.current.update(prediction, run.model!.meta.labels, settingsRef.current);
        setDraft(candidate);
        if (candidate) { setPhase('Черновик готов'); setHint('Проверь слово. Подтверждай, только если оно соответствует твоему сообщению.'); }
        else if (gate.current.candidate && gate.current.confirmed === gate.current.candidate) { setPhase('Сообщение уже подтверждено'); setHint('Для повтора убери руки из кадра на секунду, затем покажи жест снова.'); }
        else if (gate.current.candidate) { setPhase('Проверка устойчивости'); setHint(`Совпало окон: ${gate.current.count} из ${settingsRef.current.stableWindows}. Продолжай движение без выхода из кадра.`); }
        else { setPhase('Результат неопределён'); setHint('Модель не выделила устойчивый результат. Повтори знакомое движение из словаря; другие жесты могут не поддерживаться.'); }
      })();
      void run.pending.then(() => { if (!run.cancelled) run.raf = requestAnimationFrame(loop); }).catch(e => {
        if (!run.cancelled) { void stop(); setError(`Ошибка обработки: ${cameraError(e)}`); }
      });
    };
    run.pending = (async () => {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Камере нужен HTTPS или localhost. Открой приложение по защищённому адресу.');
      setPhase('Разрешение камеры');
      run.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
      if (run.cancelled) return;
      video.current!.srcObject = run.stream;
      await video.current!.play();
      run.stream.getVideoTracks()[0].addEventListener('ended', () => { if (!run.cancelled) { void stop(); setError('Камера отключена. Подключи её и включи снова.'); } });
      setPhase('Загрузка модели слов'); run.model = await GestureModel.load();
      if (run.cancelled) return;
      setLabels(run.model.meta.labels);
      setPhase('Загрузка точек рук и тела'); run.tracker = await Tracker.load();
      if (run.cancelled) return;
      run.sequence = new Sequence(run.model.meta); setBusy(false); setActive(true);
      setPhase('Накопление последовательности'); run.raf = requestAnimationFrame(loop);
    })();
    try { await run.pending; } catch (e) {
      if (!run.cancelled) { await stop(); setError(cameraError(e)); }
    }
  }
  function confirm() {
    if (draft && gate.current.confirm(draft, settingsRef.current)) {
      setHistory(h => [...h, { word: draft, time: new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) }]);
      setDraft(null);
    }
  }
  function changeSettings(next: Settings) {
    setSettings(next); gate.current.clearCandidate(); runRef.current?.sequence?.reset();
    setDraft(null); setScores([]); setProgress(0);
  }
  return <main>
    <header><a className="brand" href="./"><span className="mark">S</span>SignBridge</a><span className="badge">Браузерный прототип · 01</span></header>
    <section className="intro"><p className="eyebrow">УВИДЕТЬ. ПОНЯТЬ. ОТВЕТИТЬ.</p><h1>Твои движения.<br/><span>Слова на экране.</span></h1><p>{phraseExplanation}. Камера и обработка работают на твоём устройстве.</p></section>
    <div className="workspace">
      <section className="camera-panel" aria-label="Камера и распознавание">
        <div className="panel-heading"><h2>Твоя камера</h2><span className="status">{active ? '● Включена' : busy ? '◌ Подготовка' : '○ Выключена'}</span></div>
        <div className="viewport"><video ref={video} muted playsInline autoPlay aria-label="Видео камеры"/><canvas ref={canvas} aria-label="Точки рук и тела"/>{!active && !busy && <div className="camera-placeholder"><span>◎</span><strong>Начнём с одного движения</strong><p>Разреши доступ к камере.<br/>Микрофон не используется.</p></div>}</div>
        <div className="camera-controls"><button className="primary" disabled={busy || active} onClick={() => void start()}>Включить камеру</button><button disabled={!runRef.current} onClick={() => void stop()}>Остановить</button></div>
        <div className="feedback" role="status"><strong>{phase}</strong><p>{hint}</p><progress max={35} value={progress} aria-label="Накопление последовательности"/><small>{progress} / 35 кадров</small></div>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      <aside className="results">
        <section className="card"><p className="eyebrow">ТЕКУЩАЯ ФРАЗА · ЧЕРНОВИК</p><h2 className="phrase">{draft ? getPhrase(draft) : 'Жду движение…'}</h2><p>Слово попадёт в историю только после твоего подтверждения.</p><button className="primary" disabled={!draft} onClick={confirm}>Подтвердить слово</button><div className="ranking"><h3>Предположение модели</h3>{scores.length ? scores.map((s, i) => <div className="rank" key={s.word}><span>{i + 1}. {getPhrase(s.word)} — класс {s.word}</span><strong>{(s.value * 100).toFixed(1)}%</strong></div>) : <p>Результаты появятся после накопления кадров.</p>}</div><small>Проценты — оценка исходного класса, не вероятность правильного перевода. Высокая оценка возможна и у незнакомого жеста.</small></section>
        <section className="card"><div className="panel-heading"><h2>История</h2><button className="text-button" onClick={() => { setHistory([]); setDraft(null); gate.current.clearCandidate(); runRef.current?.sequence?.reset(); setScores([]); setProgress(0); }}>Очистить</button></div>{history.length ? <ol className="history">{history.map((m, i) => <li key={i}><span>{getPhrase(m.word)}</span><time>{m.time}</time></li>)}</ol> : <p>Здесь будут подтверждённые сообщения.</p>}<small>Только в этой вкладке. Видео не записывается.</small></section>
      </aside>
    </div>
    <section className="card vocabulary"><h2>Словарь модели</h2><div className="words">{labels.map(word => <span key={word}>{getPhrase(word)} — класс {word}</span>)}</div><p>Фразы назначены существующим движениям. Модель не обучалась настоящим жестам этих фраз; записи датасета не являются проверенной инструкцией жестового языка.</p></section>
    <details className="card"><summary>Настройки принятия результата</summary><div className="settings"><label>Порог оценки: {Math.round(settings.threshold * 100)}%<input type="range" min="0.5" max="0.99" step="0.01" value={settings.threshold} onChange={e => changeSettings({ ...settings, threshold: +e.target.value })}/></label><label>Отрыв от второго: {Math.round(settings.margin * 100)}%<input type="range" min="0.05" max="0.5" step="0.01" value={settings.margin} onChange={e => changeSettings({ ...settings, margin: +e.target.value })}/></label><label>Устойчивых окон: {settings.stableWindows}<input type="range" min="2" max="6" step="1" value={settings.stableWindows} onChange={e => changeSettings({ ...settings, stableWindows: +e.target.value })}/></label></div><p>Начальные пороги экспериментальные. Соседние окна перекрываются; устойчивость не доказывает правильность жеста.</p></details>
    <footer>SignBridge · ограниченный словарь, открытый прототип</footer>
  </main>;
}

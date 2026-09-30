import { useEffect, useRef, useState } from 'react';
import { CallSession, type CallStatus } from './callSession';
import { SpeechInput, speechConstructor } from './speech';
import { useGesture } from './useGesture';
import { commandNames, type Command } from './commands';
import type { Entry } from './conversation';

function History({ entries }: { entries: Entry[] }) {
  return entries.length ? <ol className="conversation">{entries.map(e => <li key={`${e.sender.id}:${e.id}`} data-kind={e.kind}>
    <div><strong>{e.sender.name}{e.local ? ' (ты)' : ''}</strong><span>{e.kind === 'gesture' ? 'Жест' : e.kind === 'speech' ? 'Речь' : 'Текст'} · {new Date(e.time).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</span></div>
    <p>{e.text}</p>{e.local && <small>{e.delivery === 'delivered' ? 'Доставлено' : e.delivery === 'pending' ? 'Ожидает подтверждения доставки' : 'Доставка не подтверждена'}</small>}
  </li>)}</ol> : <p>Подтверждённые сообщения появятся здесь.</p>;
}
export default function CallPage({ roomId, name, onHome }: { roomId: string; name: string; onHome: () => void }) {
  const localVideo = useRef<HTMLVideoElement>(null), remoteVideo = useRef<HTMLVideoElement>(null), overlay = useRef<HTMLCanvasElement>(null);
  const session = useRef<CallSession | null>(null), speech = useRef<SpeechInput | null>(null);
  const [status, setStatus] = useState<CallStatus>('preparing'), [detail, setDetail] = useState('Подготовка камеры…');
  const [, render] = useState(0);
  const [cameraOn, setCameraOn] = useState(false), [micOn, setMicOn] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechStatus, setSpeechStatus] = useState('Английские субтитры выключены.');
  const [error, setError] = useState(''), [copied, setCopied] = useState(false), [audioBlocked, setAudioBlocked] = useState(false);
  const [text, setText] = useState(''), [mediaBusy, setMediaBusy] = useState(false);
  const gesture = useGesture(localVideo, overlay, cameraOn && status !== 'ended',
    word => session.current?.send('gesture', word) ?? false,
    () => { speech.current?.cancel(); session.current?.end(); });
  const gestures = gesture.communicating;
  const supported = !!speechConstructor();
  const url = new URL(location.href); url.search = ''; url.searchParams.set('room', roomId);
  const shareLink = url.toString();
  useEffect(() => {
    const stt = new SpeechInput((id, words, final) => session.current?.send('speech', words, final, id), (active, message) => { setSpeaking(active); setSpeechStatus(message); });
    speech.current = stt;
    const call = new CallSession(roomId, name, {
      status: (next, message) => {
        setStatus(next); setDetail(message);
        if (next !== 'connected') stt.cancel();
        if (next === 'ended') { setCameraOn(false); setMicOn(false); }
      },
      local: stream => { if (localVideo.current) { localVideo.current.srcObject = stream; void localVideo.current.play().catch(() => {}); } },
      remote: stream => {
        if (remoteVideo.current) {
          if (remoteVideo.current.srcObject !== stream) remoteVideo.current.srcObject = stream;
          void remoteVideo.current.play().then(() => setAudioBlocked(false)).catch(error => {
            if (error.name === 'NotAllowedError') setAudioBlocked(true);
          });
        }
      },
      changed: () => render(v => v + 1),
      media: () => { setCameraOn(call.cameraOn); setMicOn(call.microphoneOn); if (!call.microphoneOn) stt.cancel(); },
    });
    session.current = call; void call.start();
    const leaving = () => { stt.cancel(); call.end(); };
    window.addEventListener('pagehide', leaving);
    return () => { window.removeEventListener('pagehide', leaving); stt.cancel(); call.end(); session.current = null; };
  }, [roomId, name]);
  const call = session.current;
  const entries = call?.conversation.entries ?? [];
  const remoteInterim = call?.peer ? call.conversation.interim.get(call.peer.id) : undefined;
  const localInterim = call?.conversation.interim.get(call.self.id);
  const lastRemote = [...entries].reverse().find(e => !e.local);
  const connected = status === 'connected';
  async function media(kind: 'audio' | 'video') {
    setError(''); setMediaBusy(true);
    if (kind === 'audio') speech.current?.cancel();
    if (kind === 'video') gesture.clear();
    try { await call?.toggleMedia(kind); }
    catch { setError(kind === 'audio' ? 'Микрофон недоступен. Разреши доступ в настройках сайта и проверь устройство.' : 'Камера недоступна. Проверь разрешения и закрой другие приложения с камерой.'); }
    finally { setMediaBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(shareLink); setCopied(true); }
    catch { setError('Не удалось скопировать автоматически. Выдели ссылку и скопируй её вручную.'); }
  }
  function sendText() {
    if (text.trim() && call?.send('text', text.trim())) setText('');
    else setError('Сообщение не отправлено. Дождись восстановления соединения.');
  }
  if (status === 'ended') return <main><header><a className="brand" href="./"><span className="mark">S</span>SignBridge</a></header><section className="intro"><p className="eyebrow">РАЗГОВОР ЗАВЕРШЁН</p><h1>История разговора</h1><p role="status">{detail}</p></section><section className="card"><History entries={entries}/><p>История хранится только в этой вкладке и исчезнет при выходе на главную или перезагрузке.</p><button className="primary" onClick={onHome}>На главную</button></section></main>;
  return <main className="call-page">
    <header><span className="brand"><span className="mark">S</span>SignBridge</span><span className="badge" role="status">{detail}</span></header>
    <div className="share-row"><input aria-label="Ссылка комнаты" value={shareLink} readOnly onFocus={e => e.target.select()}/><button onClick={() => void copy()}>{copied ? 'Ссылка скопирована' : 'Копировать ссылку'}</button></div>
    <div className="call-grid"><section className="call-stage">
      <div className="remote-viewport"><video ref={remoteVideo} autoPlay playsInline muted={speaking} aria-label="Видео собеседника"/>
        {!connected && <div className="waiting"><span>◎</span><h2>{status === 'waiting' ? 'Ждём собеседника' : 'Устанавливаем связь'}</h2><p>{detail}</p></div>}
        <div className="peer-label">{call?.peer?.name ?? 'Собеседник'}</div>
        <div className="self-viewport"><video ref={localVideo} muted autoPlay playsInline aria-label="Твоё видео"/><canvas ref={overlay} aria-label="Точки распознавания"/>{!cameraOn && <span>Камера выключена</span>}<small>{name} · ты · рамка вверху справа: команды</small></div>
        {cameraOn && <div className="gesture-hud">
          <strong>{gesture.ending ? 'Завершить? Ладонь — да, кулак — нет' : gesture.training ? `Обучение: ${commandNames[gesture.training]}` : gesture.draft ? `Черновик: ${gesture.draft}` : gestures ? 'Покажи слово вне рамки' : 'Ладонь в рамке — включить общение'}</strong>
          <p>{gesture.training ? gesture.lesson : gesture.control.hint}</p>
          {gesture.ending && <small>Сначала нейтральное положение 0,5 с</small>}
          <progress max={1} value={gesture.control.progress} aria-label="Удержание на видео"/>
        </div>}
        <div className="subtitles" aria-live="polite"><small>{remoteInterim ? `${call?.peer?.name} · распознаётся…` : lastRemote ? `${lastRemote.sender.name} · ${lastRemote.kind === 'speech' ? 'Речь' : lastRemote.kind === 'gesture' ? 'Жест' : 'Текст'}` : 'Субтитры собеседника'}</small><p className={remoteInterim ? 'interim' : ''}>{remoteInterim?.text ?? lastRemote?.text ?? 'Сообщения появятся здесь'}</p></div>
      </div>
      {audioBlocked && <button onClick={() => { void remoteVideo.current?.play().then(() => setAudioBlocked(false)).catch(() => setError('Браузер не включил звук. Проверь разрешение воспроизведения звука для сайта.')); }}>Включить звук собеседника</button>}
      <div className="call-controls"><button disabled={mediaBusy || status === 'preparing'} onClick={() => void media('video')}>{cameraOn ? 'Выключить камеру' : 'Включить камеру'}</button><button disabled={mediaBusy || status === 'preparing'} onClick={() => void media('audio')}>{micOn ? 'Выключить микрофон' : 'Включить микрофон'}</button><button className="danger" onClick={() => { speech.current?.cancel(); call?.end(); }}>Завершить звонок</button></div>
      {error && <p className="error" role="alert">{error}</p>}
      <section className="card command-panel" aria-label="Условные команды">
        <h2>Управление без мыши</h2>
        <p>Это условные команды интерфейса, не перевод жестового языка. Переведи центр ладони в рамку вверху справа на своём видео: вход 0,7 с, затем удержание команды 1 с. Вне рамки распознаются слова.</p>
        <p><strong>Ладонь</strong> — {gestures ? 'отправить черновик' : 'включить общение'} · <strong>Кулак</strong> — отменить черновик · <strong>V</strong> — запросить выход.</p>
        <p role="status">{gesture.control.hint}</p>
        <progress max={1} value={gesture.control.progress} aria-label="Удержание команды"/>
        {gesture.feedback && <p aria-live="polite">{gesture.feedback}</p>}
        {gesture.control.paused && <p>Слова приостановлены. Черновик зафиксирован. Для возврата убери руку из рамки на 0,5 с.</p>}
        {gesture.ending && <section className="end-confirm" role="alert"><h3>Завершить звонок?</h3><p>Сначала нейтральное положение 0,5 с. Затем ладонь — выйти, кулак — продолжить. Без подтверждения запрос отменится через 12 с.</p><button onClick={gesture.confirm}>Да, выйти</button><button onClick={gesture.cancelEnd}>Продолжить разговор</button></section>}
        <details><summary>Обучение командам и исправление ошибок</summary><p>Выбери намерение: подсказки относятся только к выбранной команде. Во время обучения слова и действия приостановлены.</p>
          <div className="training-controls">{(Object.keys(commandNames) as Command[]).map(command => <button key={command} aria-pressed={gesture.training === command} onClick={() => gesture.train(command)}>{commandNames[command]}</button>)}<button onClick={() => gesture.train(null)}>Вернуться к общению</button></div>
          {gesture.training && <p role="status">Обучение: {commandNames[gesture.training]}. {gesture.lesson}</p>}
        </details>
      </section>
      <div className="input-grid"><section className="card"><div className="panel-heading"><h2>Жест → сообщение</h2><button disabled={!cameraOn} onClick={gesture.toggle}>{gestures ? 'Выключить жесты' : 'Включить жесты'}</button></div><p className="draft" aria-live="polite">{gesture.draft ?? 'Черновик пуст'}</p><button className="primary" disabled={!gesture.draft || !connected || !!gesture.training || gesture.ending} onClick={gesture.confirm}>Подтвердить и отправить</button><button disabled={!gesture.draft || !!gesture.training || gesture.ending} onClick={gesture.clear}>Отменить черновик</button><p role="status">{gesture.hint}</p>{gestures && <progress max={35} value={gesture.progress} aria-label="Кадры для распознавания"/>}</section>
      <section className="card"><h2>Речь → субтитры</h2><p>English · звук может отправляться сервису браузера. Во время диктовки звук собеседника выключается; используй наушники.</p><button className="primary" disabled={!supported || !micOn || !connected} onClick={() => speaking ? speech.current?.stop() : speech.current?.start()}>{speaking ? 'Остановить субтитры' : 'Включить субтитры'}</button><p role="status">{!supported ? 'Распознавание речи недоступно в этом браузере. Попробуй Chrome с поддержкой Web Speech или напиши сообщение.' : !micOn ? 'Сначала включи микрофон.' : speechStatus}</p>{localInterim && <p className="interim">Ты: {localInterim.text}</p>}</section></div>
    </section><aside className="card call-history"><h2>Разговор</h2><History entries={entries}/><form onSubmit={e => { e.preventDefault(); sendText(); }}><label className="field">Написать или исправить сообщение<textarea value={text} maxLength={2000} onChange={e => setText(e.target.value)} placeholder="Текст сообщения"/></label><button disabled={!connected || !text.trim()} type="submit">Отправить текст</button></form><small>История сохраняется до закрытия этой вкладки.</small></aside></div>
    <details className="card diagnostic"><summary>Словарь, подсказки и настройки</summary><div className="words">{gesture.labels.map(word => <span key={word}>{word}</span>)}</div><p>Названия классов не являются инструкциями жестового языка. Hello, How are you? и I’m fine ещё не обучены. Высокая оценка не доказывает правильность перевода.</p><p>{gesture.hint}</p><div className="ranking">{gesture.scores.map(s => <div className="rank" key={s.word}><span>{s.word}</span><strong>{(s.score * 100).toFixed(1)}%</strong></div>)}</div><div className="settings"><label>Порог оценки: {Math.round(gesture.settings.threshold * 100)}%<input type="range" min="0.5" max="0.99" step="0.01" value={gesture.settings.threshold} onChange={e => gesture.configure({ ...gesture.settings, threshold: +e.target.value })}/></label><label>Отрыв от второго: {Math.round(gesture.settings.margin * 100)}%<input type="range" min="0.05" max="0.5" step="0.01" value={gesture.settings.margin} onChange={e => gesture.configure({ ...gesture.settings, margin: +e.target.value })}/></label><label>Устойчивых окон: {gesture.settings.stableWindows}<input type="range" min="2" max="6" value={gesture.settings.stableWindows} onChange={e => gesture.configure({ ...gesture.settings, stableWindows: +e.target.value })}/></label></div><small>Камера и микрофон обрабатываются браузером. Условные команды используют полные точки кисти отдельно от модели слов. Начальная загрузка и подсказки отображаются выше.</small></details>
  </main>;
}

import DatasetExamples from './DatasetExamples';
import RecognitionFeedback from './RecognitionFeedback';
import { getPhrase, phraseExplanation } from './phraseMapping';
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
export default function CallPage({ roomId, name, initialReplyMode='gesture', onHome }: { roomId: string; name: string; initialReplyMode?:'gesture'|'voice'; onHome: () => void }) {
  const localVideo = useRef<HTMLVideoElement>(null), remoteVideo = useRef<HTMLVideoElement>(null), overlay = useRef<HTMLCanvasElement>(null);
  const session = useRef<CallSession | null>(null), speech = useRef<SpeechInput | null>(null);
  const [status, setStatus] = useState<CallStatus>('preparing'), [detail, setDetail] = useState('Подготовка камеры…');
  const [, render] = useState(0);
  const [cameraOn, setCameraOn] = useState(false), [micOn, setMicOn] = useState(false);
  const [previewLarge,setPreviewLarge] = useState(false);
  const [replyMode,setReplyMode] = useState(initialReplyMode);
  const [panel,setPanel] = useState<'invite'|'history'|'help'|'settings'|null>(null);
  const [voiceBusy,setVoiceBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(panel) dialog.current?.showModal(); else dialog.current?.close();},[panel]);
  const [speaking, setSpeaking] = useState(false);
  const [speechStatus, setSpeechStatus] = useState('Английские субтитры выключены.');
  const [error, setError] = useState(''), [copied, setCopied] = useState(false), [audioBlocked, setAudioBlocked] = useState(false);
  const [text, setText] = useState(''), [mediaBusy, setMediaBusy] = useState(false);
  const gesture = useGesture(localVideo, overlay, cameraOn && status !== 'ended',
    word => session.current?.send('gesture', getPhrase(word)) ?? false,
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
  const feedbackProps = {state:gesture.view,canConfirm:!!gesture.draft && connected && !gesture.training && !gesture.ending,canCancel:!!gesture.draft && !gesture.training && !gesture.ending,onConfirm:gesture.confirm,onCancel:gesture.clear};
  async function media(kind: 'audio' | 'video') {
    setError(''); setMediaBusy(true);
    if (kind === 'audio') speech.current?.cancel();
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
  async function startVoice() {
    if (voiceBusy || !call?.canSend) return;
    if (speaking) { speech.current?.stop(); return; }
    setVoiceBusy(true); setError(''); setSpeechStatus('Разреши микрофон для английских субтитров…');
    try {
      if (!call.microphoneOn) await call.toggleMedia('audio');
      if (call.canSend && call.microphoneOn) speech.current?.start();
    } catch { setSpeechStatus('Микрофон недоступен. Разреши доступ в настройках сайта и попробуй снова.'); }
    finally { setVoiceBusy(false); }
  }
  function chooseReply(next:'gesture'|'voice') { setReplyMode(next); if(next==='gesture')speech.current?.cancel(); }
  if (status === 'ended') return <main><header><a className="brand" href="./"><span className="mark">S</span>SignBridge</a></header><section className="intro"><h1>История разговора</h1><p role="status">{detail}</p></section><section className="card"><History entries={entries}/><p>История хранится только в этой вкладке и исчезнет при выходе на главную или перезагрузке.</p><button className="primary" onClick={onHome}>На главную</button></section></main>;
  const showGestures = replyMode==='gesture' || gesture.control.paused || gesture.ending || !!gesture.training;
  return <main className="call-page">
    <header className="call-header"><span className="brand">SignBridge</span><span className="connection-state" role="status">{detail}</span><nav aria-label="Панели звонка"><button onClick={()=>setPanel('invite')}>Пригласить</button><button onClick={()=>setPanel('history')}>История{entries.length ? ` · ${entries.length}` : ''}</button><button onClick={()=>setPanel('help')}>Помощь</button></nav></header>
    <div className="call-workspace">
      <section className="call-stage" aria-label="Видео и субтитры">
        <div className="remote-viewport"><video ref={remoteVideo} autoPlay playsInline muted={speaking} aria-label="Видео собеседника"/>
          {!connected && <div className="waiting"><h2>{status==='waiting'?'Ждём собеседника':status==='reconnecting'?'Восстанавливаем связь':'Подключаем звонок'}</h2><p>{status==='waiting'?'Отправь приглашение. Собеседник сможет войти по ссылке.':detail}</p>{status==='waiting' && <button className="primary" onClick={()=>setPanel('invite')}>Пригласить собеседника</button>}</div>}
          <div className="peer-label">{call?.peer?.name ?? 'Собеседник'}</div>
          <div className={`self-viewport${previewLarge?' expanded':''}`}><video ref={localVideo} muted autoPlay playsInline aria-label="Твоё видео"/><canvas ref={overlay} aria-label="Точки распознавания"/>{!cameraOn && <span>Камера выключена</span>}<small>{name} · ты</small><button className="preview-toggle" aria-expanded={previewLarge} onClick={()=>setPreviewLarge(v=>!v)}>{previewLarge?'Уменьшить превью':'Увеличить превью'}</button></div>
        </div>
        <div className="subtitles" aria-live="polite"><small>{remoteInterim?`${call?.peer?.name} · распознаётся…`:lastRemote?`${lastRemote.sender.name} · ${lastRemote.kind==='speech'?'Речь':lastRemote.kind==='gesture'?'Фраза':'Текст'}`:'Субтитры собеседника'}</small><p tabIndex={0} aria-label="Текст субтитров собеседника" className={remoteInterim?'interim':''}>{remoteInterim?.text ?? lastRemote?.text ?? 'Здесь появится ответ собеседника'}</p></div>
        {audioBlocked && <button onClick={()=>{void remoteVideo.current?.play().then(()=>setAudioBlocked(false)).catch(()=>setError('Браузер не включил звук. Проверь разрешение звука для сайта.'));}}>Включить звук собеседника</button>}
        <div className="call-controls" aria-label="Управление звонком"><button aria-pressed={cameraOn} disabled={mediaBusy || status==='preparing'} onClick={()=>void media('video')}>{cameraOn?'Выключить камеру':'Включить камеру'}</button><button aria-pressed={micOn} disabled={mediaBusy || status==='preparing' || voiceBusy} onClick={()=>void media('audio')}>{micOn?'Выключить микрофон':'Включить микрофон'}</button><button className="danger" onClick={()=>{speech.current?.cancel();call?.end();}}>Завершить звонок</button></div>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      <section className="response-workspace" aria-label="Твой ответ">
        <div className="segmented" aria-label="Предпочтительный способ ответа"><button aria-pressed={replyMode==='gesture'} onClick={()=>chooseReply('gesture')}>Жестами</button><button aria-pressed={replyMode==='voice'} onClick={()=>chooseReply('voice')}>Голосом</button></div>
        {showGestures && <section className="gesture-main"><div className="panel-heading"><h2>Твоя фраза</h2><button className="text-button" onClick={()=>setPanel('help')}>Как показать фразу?</button></div>
          <RecognitionFeedback {...feedbackProps}/>
          {gesture.ending ? <div className="end-confirm" role="alert"><h3>Завершить звонок?</h3><div><button className="danger" onClick={gesture.confirm}>Да, выйти</button><button onClick={gesture.cancelEnd}>Продолжить разговор</button></div></div> : gesture.training ? <button onClick={()=>gesture.train(null)}>Закончить обучение</button> : <button className={gestures?'recognition-toggle':'primary recognition-toggle'} disabled={!cameraOn} onClick={gesture.toggle}>{gestures?'Выключить жесты':'Включить жесты'}</button>}
          {gesture.feedback && <p className="action-feedback" role="status">{gesture.feedback}</p>}
        </section>}
        {replyMode==='voice' && <section className="voice-workspace"><h2>Твой голос → субтитры</h2><p className="voice-step">{speaking?'Субтитры включены':voiceBusy?'Включаем микрофон':'Говори по-английски'}</p><p role="status">{!supported?'Распознавание речи недоступно в этом браузере. Попробуй Chrome с поддержкой Web Speech или напиши сообщение.':speechStatus}</p><button className="primary" disabled={!supported || !connected || voiceBusy || mediaBusy} onClick={()=>void startVoice()}>{voiceBusy?'Ожидаем микрофон…':speaking?'Остановить субтитры':'Начать говорить с субтитрами'}</button>{localInterim && <p className="interim">Ты: {localInterim.text}</p>}<p className="voice-disclosure">Звук может обрабатываться сервисом браузера. Пока приложение слушает, звук собеседника выключен, чтобы не распознать его ответ повторно.</p></section>}
        <button className="write-instead" onClick={()=>setPanel('history')}>Написать сообщение</button>
      </section>
    </div>
    <dialog className={`call-drawer ${panel==='help'?'help-drawer':''}`} ref={dialog} onCancel={()=>setPanel(null)} onClose={()=>setPanel(null)} aria-label={panel==='history'?'История разговора':panel==='invite'?'Приглашение':panel==='help'?'Помощь с движениями':'Диагностика'}>
      <div className="drawer-heading"><h2>{panel==='history'?'История разговора':panel==='invite'?'Пригласи собеседника':panel==='help'?'Движения и команды':'Диагностика'}</h2><button autoFocus onClick={()=>setPanel(null)}>Закрыть</button></div>
      {panel==='invite' && <><p>Скопируй ссылку и отправь собеседнику любым удобным способом. В комнате есть место для двоих.</p><input aria-label="Ссылка комнаты" value={shareLink} readOnly onFocus={e=>e.target.select()}/><button className="primary" onClick={()=>void copy()}>{copied?'Ссылка скопирована':'Копировать ссылку'}</button>{copied && <p role="status">Отправь ссылку собеседнику. Здесь можно закрыть приглашение и ждать подключения.</p>}</>}
      {<div hidden={panel!=='history'}><History entries={entries}/><form onSubmit={e=>{e.preventDefault();sendText();}}><label className="field">Написать или исправить сообщение<textarea value={text} maxLength={2000} onChange={e=>setText(e.target.value)} placeholder="Текст сообщения"/></label><button className="primary" disabled={!connected || !text.trim()} type="submit">Отправить текст</button></form><p>История хранится только в этой вкладке.</p></div>}
      {panel==='help' && <><p>{phraseExplanation}.</p><details className="command-help"><summary>Управление ладонью, кулаком и V</summary><p>Переведи руку в рамку на своём видео. Удержи её 0,7 с для входа, затем команду 1 с. Слова в это время приостановлены.</p><p>Ладонь включает общение или отправляет черновик. Кулак отменяет черновик. V запрашивает выход; затем ладонь подтверждает, кулак отменяет. Между командами расслабь кисть на полсекунды.</p><div className="training-controls">{(Object.keys(commandNames) as Command[]).map(command=><button key={command} aria-pressed={gesture.training===command} onClick={()=>{gesture.train(command);setPanel(null);setPreviewLarge(true);}}>{commandNames[command]}</button>)}<button onClick={()=>gesture.train(null)}>Закончить обучение</button></div>{gesture.training && <div className="training-live"><p role="status">{gesture.lesson} {gesture.control.hint} {gesture.feedback}</p><progress aria-label="Удержание учебной команды" value={gesture.control.progress} max={1}/></div>}</details><DatasetExamples embedded/><button onClick={()=>setPanel('settings')}>Открыть техническую диагностику</button></>}
      {panel==='settings' && <><p>{gesture.hint}</p><div className="words">{gesture.labels.map(word=><span key={word}>{getPhrase(word)} — класс {word}</span>)}</div><div className="ranking">{gesture.scores.map(s=><div className="rank" key={s.word}><span>{getPhrase(s.word)} — класс {s.word}</span><strong>{(s.score*100).toFixed(1)}%</strong></div>)}</div><div className="settings"><label>Порог оценки: {Math.round(gesture.settings.threshold*100)}%<input type="range" min="0.5" max="0.99" step="0.01" value={gesture.settings.threshold} onChange={e=>gesture.configure({...gesture.settings,threshold:+e.target.value})}/></label><label>Отрыв от второго: {Math.round(gesture.settings.margin*100)}%<input type="range" min="0.05" max="0.5" step="0.01" value={gesture.settings.margin} onChange={e=>gesture.configure({...gesture.settings,margin:+e.target.value})}/></label><label>Устойчивых окон: {gesture.settings.stableWindows}<input type="range" min="2" max="6" value={gesture.settings.stableWindows} onChange={e=>gesture.configure({...gesture.settings,stableWindows:+e.target.value})}/></label></div><p>Оценки относятся к исходным классам модели, а не правильности жеста.</p></>}
    </dialog>
  </main>;
}

import {BrandLogo,Icon} from './design';
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
  return entries.length ? <ol className="conversation">{entries.map(e => <li key={`${e.sender.id}:${e.id}`} data-kind={e.kind} className={e.local?'own':'remote'}>
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
  const [panel,setPanel] = useState<'help'|'settings'|null>(null);
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
  const chatScroll=useRef<HTMLDivElement>(null),stickToBottom=useRef(true);
  useEffect(()=>{if(stickToBottom.current&&chatScroll.current)chatScroll.current.scrollTop=chatScroll.current.scrollHeight;},[entries.length]);
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
  if(status==='ended')return <main className="call-summary"><header><BrandLogo/></header><section><h1>Звонок завершён</h1><p role="status">{detail}</p><p>История доступна в этой вкладке до её закрытия или возвращения на главную.</p><button className="primary" onClick={onHome}><Icon name="home"/>На главную</button><h2>История разговора</h2><History entries={entries}/></section></main>;
  const showGestures=replyMode==='gesture'||gesture.control.paused||gesture.ending||!!gesture.training;
  const tone=gesture.draft?'ready':['error','stalled'].includes(gesture.view.mode)?'error':gesture.view.prediction?'guess':gesture.view.mode==='words'?'work':'idle';
  const phraseStatus=['commands','training','ending'].includes(gesture.view.mode)?gesture.view.title:gesture.draft?'Фраза готова':gesture.view.mode==='disabled'?'Распознавание выключено':gesture.view.mode==='words'?(gesture.view.prediction?'Проверяем фразу':'Распознавание'):gesture.view.title;
  return <main className="call-page">
    <header className="call-header"><BrandLogo/><span className={`connection-state ${connected?'connected':''}`} role="status"><Icon name={connected?'wifi':status==='reconnecting'?'sync':'hourglass_top'}/>{detail}</span><div className="room-share"><label htmlFor="room-link">Ссылка комнаты</label><input id="room-link" aria-label="Ссылка комнаты" value={shareLink} readOnly onFocus={e=>e.target.select()}/><button aria-label={copied?'Скопировано':'Копировать ссылку'} onClick={()=>void copy()}><Icon name={copied?'check':'content_copy'}/>{copied?'Скопировано':<><span className="copy-desktop">Копировать ссылку</span><span className="copy-mobile">Копировать</span></>}</button></div></header>
    <div className="call-workspace"><section className="call-stage" aria-label="Видео и общение">
      <div className="remote-viewport"><video ref={remoteVideo} autoPlay playsInline muted={speaking} aria-label="Видео собеседника"/>
        {!connected&&<div className="waiting"><Icon name={status==='reconnecting'?'sync':'videocam'}/><h2>{status==='waiting'?'Ждём собеседника':status==='reconnecting'?'Восстанавливаем связь':'Подключаем звонок'}</h2><p>{status==='waiting'?'Скопируйте ссылку в шапке и отправьте собеседнику.':detail}</p></div>}
        <div className="peer-label"><Icon name="person"/>{call?.peer?.name ?? 'Собеседник'}</div>
        {speaking&&<p className="muted-note"><Icon name="volume_off"/>Звук собеседника выключен, пока вы говорите, чтобы распознавание слышало только вас.</p>}
        <div className={`self-viewport${previewLarge?' expanded':''}`}><video ref={localVideo} muted autoPlay playsInline aria-label="Твоё видео"/><canvas ref={overlay} aria-label="Точки распознавания"/>{!cameraOn&&<span className="camera-off"><Icon name="videocam_off"/>Камера выкл.</span>}<small>{name} · Вы</small><button className="preview-toggle" aria-label={previewLarge?'Уменьшить превью':'Увеличить превью'} aria-expanded={previewLarge} onClick={()=>setPreviewLarge(v=>!v)}><Icon name={previewLarge?'close_fullscreen':'open_in_full'}/><span>{previewLarge?'Уменьшить':'Увеличить'}</span></button></div>
        {(remoteInterim||lastRemote)&&<div className="subtitles" aria-live="polite"><small>{remoteInterim?`${call?.peer?.name} · распознаётся…`:`${lastRemote!.sender.name} · ${lastRemote!.kind==='speech'?'Речь':lastRemote!.kind==='gesture'?'Жест':'Текст'}`}</small><p tabIndex={0} aria-label="Текст субтитров собеседника" className={remoteInterim?'interim':''}>{remoteInterim?.text ?? lastRemote?.text}</p></div>}
        {audioBlocked&&<button className="audio-unlock" onClick={()=>void remoteVideo.current?.play().then(()=>setAudioBlocked(false)).catch(()=>setError('Разрешите воспроизведение звука для сайта.'))}>Включить звук собеседника</button>}
      </div>
      <section className={`gesture-main tone-${showGestures?tone:'idle'}`} aria-label="Твоя фраза"><div className="phrase-heading"><strong>Твоя фраза</strong><span className="phrase-state"><Icon name={gesture.draft?'check_circle':showGestures?'back_hand':'mic'}/>{showGestures?phraseStatus:speaking?'Слушаем':'Голосовые субтитры'}</span><div className="phrase-options"><div className="segmented" aria-label="Способ ответа"><button aria-pressed={replyMode==='gesture'} onClick={()=>chooseReply('gesture')}>Жестами</button><button aria-pressed={replyMode==='voice'} onClick={()=>chooseReply('voice')}>Голосом</button></div><button className="plain diagnostic-toggle" onClick={()=>setPanel('settings')}>Диагностика<Icon name="expand_more"/></button></div></div>
        {showGestures?<RecognitionFeedback {...feedbackProps} onEnable={gesture.toggle} onHelp={()=>setPanel('help')} cameraOn={cameraOn} enabled={gestures}/>:<div className="voice-workspace"><div className="phrase-body"><h2 className="phrase-title">{localInterim?.text ?? (speaking?'Говорите по-английски':'Начните говорить с субтитрами')}</h2><button className="primary" disabled={!supported||!connected||voiceBusy||mediaBusy} onClick={()=>void startVoice()}><Icon name="mic"/>{voiceBusy?'Ожидаем микрофон…':speaking?'Остановить субтитры':'Начать говорить с субтитрами'}</button></div><p role="status">{!supported?'Распознавание речи недоступно в этом браузере. Попробуйте Chrome с Web Speech или напишите сообщение.':speechStatus}</p><small>Английский язык · звук может обрабатываться сервисом браузера.</small></div>}
        {gesture.ending&&<div className="end-confirm" role="alert"><h3>Завершить звонок?</h3><button className="danger" onClick={gesture.confirm}>Да, выйти</button><button onClick={gesture.cancelEnd}>Продолжить разговор</button></div>}{gesture.training&&<button onClick={()=>gesture.train(null)}>Закончить обучение</button>}
        {gesture.feedback&&<p className="action-feedback" role="status">{gesture.feedback}</p>}
      </section>
      <div className="call-controls" role="toolbar" aria-label="Управление звонком">
        <button aria-label={cameraOn?'Выключить камеру':'Включить камеру'} aria-pressed={cameraOn} disabled={mediaBusy||status==='preparing'} onClick={()=>void media('video')}><Icon name={cameraOn?'videocam':'videocam_off'}/><span>Камера<small>{cameraOn?'Вкл':'Выкл'}</small></span></button>
        <button aria-label={micOn?'Выключить микрофон':'Включить микрофон'} aria-pressed={micOn} disabled={mediaBusy||status==='preparing'||voiceBusy} onClick={()=>void media('audio')}><Icon name={micOn?'mic':'mic_off'}/><span>Микрофон<small>{micOn?'Вкл':'Выкл'}</small></span></button>
        <button aria-label={speaking?'Остановить субтитры':'Включить субтитры'} aria-pressed={speaking} disabled={!supported||!connected||voiceBusy||mediaBusy} onClick={()=>{setReplyMode('voice');void startVoice();}}><Icon name="closed_caption"/><span>Субтитры<small>{speaking?'Вкл':'Выкл'}</small></span></button>
        <button aria-label={gestures?'Выключить жесты':'Переключить жесты'} aria-pressed={gestures} disabled={!cameraOn} onClick={()=>{chooseReply('gesture');gesture.toggle();}}><Icon name="back_hand"/><span>Жесты<small>{gestures?'Вкл':'Выкл'}</small></span></button>
        <button aria-label="Помощь" onClick={()=>setPanel('help')}><Icon name="help"/><span>Помощь<small>Фразы и команды</small></span></button>
        <button className="danger" aria-label="Завершить звонок" onClick={()=>{speech.current?.cancel();call?.end();}}><Icon name="call_end"/>Завершить</button>
      </div>{error&&<p className="error" role="alert">{error}</p>}
    </section>
    <aside className="call-chat" aria-label="Чат"><header><h2>Чат</h2><p>Фразы, речь и сообщения{call?.peer?` · с ${call.peer.name}`:''}</p></header><div className="chat-history" ref={chatScroll} onScroll={e=>{const el=e.currentTarget;stickToBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<40;}}>{entries.length?<History entries={entries}/>:<div className="chat-empty"><Icon name="forum"/><p>Сообщений пока нет. Отправленные фразы, субтитры речи и текст появятся здесь.</p></div>}</div><form onSubmit={e=>{e.preventDefault();stickToBottom.current=true;sendText();}}><input aria-label="Написать или исправить сообщение" value={text} maxLength={2000} onChange={e=>setText(e.target.value)} placeholder="Напишите сообщение"/><button className="primary" aria-label="Отправить текст" disabled={!connected||!text.trim()}><Icon name="send"/>Отправить</button></form></aside>
    </div>
    <dialog className={`call-drawer ${panel==='help'?'help-drawer':''}`} ref={dialog} onCancel={()=>setPanel(null)} onClose={()=>setPanel(null)} aria-label={panel==='help'?'Помощь с движениями':'Диагностика'}>
      <div className="drawer-heading"><h2>{panel==='help'?'Движения и команды':'Диагностика'}</h2><button autoFocus onClick={()=>setPanel(null)}>Закрыть</button></div>
      {panel==='help' && <><p>{phraseExplanation}.</p><details className="command-help"><summary>Управление ладонью, кулаком и V</summary><p>Переведи руку в рамку на своём видео. Удержи её 0,7 с для входа, затем команду 1 с. Слова в это время приостановлены.</p><p>Ладонь включает общение или отправляет черновик. Кулак отменяет черновик. V запрашивает выход; затем ладонь подтверждает, кулак отменяет. Между командами расслабь кисть на полсекунды.</p><div className="training-controls">{(Object.keys(commandNames) as Command[]).map(command=><button key={command} aria-pressed={gesture.training===command} onClick={()=>{gesture.train(command);setPanel(null);setPreviewLarge(true);}}>{commandNames[command]}</button>)}<button onClick={()=>gesture.train(null)}>Закончить обучение</button></div>{gesture.training && <div className="training-live"><p role="status">{gesture.lesson} {gesture.control.hint} {gesture.feedback}</p><progress aria-label="Удержание учебной команды" value={gesture.control.progress} max={1}/></div>}</details><DatasetExamples embedded/><button onClick={()=>setPanel('settings')}>Открыть техническую диагностику</button></>}
      {panel==='settings' && <><p>{gesture.hint}</p><p>{gesture.view.progress?.label}</p><p className="stability-count">{gesture.view.stability}</p><div className="words">{gesture.labels.map(word=><span key={word}>{getPhrase(word)} — класс {word}</span>)}</div><div className="ranking">{gesture.scores.map(s=><div className="rank" key={s.word}><span>{getPhrase(s.word)} — класс {s.word}</span><strong>{(s.score*100).toFixed(1)}%</strong></div>)}</div><div className="settings"><label>Порог оценки: {Math.round(gesture.settings.threshold*100)}%<input type="range" min="0.5" max="0.99" step="0.01" value={gesture.settings.threshold} onChange={e=>gesture.configure({...gesture.settings,threshold:+e.target.value})}/></label><label>Отрыв от второго: {Math.round(gesture.settings.margin*100)}%<input type="range" min="0.05" max="0.5" step="0.01" value={gesture.settings.margin} onChange={e=>gesture.configure({...gesture.settings,margin:+e.target.value})}/></label><label>Устойчивых окон: {gesture.settings.stableWindows}<input type="range" min="2" max="6" value={gesture.settings.stableWindows} onChange={e=>gesture.configure({...gesture.settings,stableWindows:+e.target.value})}/></label></div><p>Оценки относятся к исходным классам модели, а не правильности жеста.</p></>}
    </dialog>
  </main>;
}

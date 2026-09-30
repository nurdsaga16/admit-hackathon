import Landing from './Landing';
import {Icon} from './design';
import { useState, useEffect, useRef } from 'react';
import CallPage from './CallPage';
import DatasetExamples from './DatasetExamples';

export default function App() {
  const params = new URLSearchParams(location.search);
  const [call, setCall] = useState<{ roomId: string; name: string } | null>(null);
  const [name, setName] = useState('');
  const [link, setLink] = useState(params.get('room') ?? '');
  const [replyMode, setReplyMode] = useState<'gesture'|'voice'>('gesture');
  const [joining, setJoining] = useState(params.has('room'));
  const [entry,setEntry] = useState(params.has('room'));
  const entryDialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(entry&&!call)entryDialog.current?.showModal();else entryDialog.current?.close();},[entry,call]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');

  if (params.get('mode') === 'examples') return <DatasetExamples/>;
  if (call) return <CallPage roomId={call.roomId} name={call.name} initialReplyMode={replyMode} onHome={() => { history.replaceState(null, '', location.pathname); setCall(null); setLink(''); setEntry(false);setJoining(false); }}/ >;
  function enter(roomId: string) {
    if (!/^[a-f0-9]{32}$/.test(roomId)) { setError('Вставь полную ссылку комнаты или её код.'); return; }
    const url = new URL(location.href); url.search = ''; url.searchParams.set('room', roomId);
    history.replaceState(null, '', url);
    setCall({ roomId, name: name.trim() || 'Участник' });
  }
  async function create() {
    setBusy(true); setError('');
    try {
      const response = await fetch('api/rooms', { method: 'POST', signal: AbortSignal.timeout(10000) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Не удалось создать комнату.');
      enter(body.roomId);
    } catch { setError('Сервер комнат недоступен. Проверь подключение и запуск сервера SignBridge.'); }
    finally { setBusy(false); }
  }
  function join() {
    setError(''); let roomId = link.trim();
    try { roomId = new URL(roomId).searchParams.get('room') ?? ''; } catch { /* A bare room id is accepted. */ }
    enter(roomId);
  }
  const invited = params.has('room') && !!link;
  return <>
    <Landing openCreate={()=>{setJoining(false);setEntry(true);}} openJoin={()=>{setJoining(true);setEntry(true);}}/>
    <dialog className="entry-dialog" ref={entryDialog} onCancel={()=>setEntry(false)} onClose={()=>setEntry(false)} aria-labelledby="entry-title">
      <div className="dialog-heading"><h2 id="entry-title">{joining?'Присоединиться к звонку':'Новый звонок'}</h2><button className="plain" onClick={()=>setEntry(false)}><Icon name="close"/>Закрыть</button></div>
      {!invited && <div className="entry-tabs"><button aria-pressed={!joining} onClick={()=>setJoining(false)}>Создать звонок</button><button aria-pressed={joining} onClick={()=>setJoining(true)}>Присоединиться</button></div>}
      {invited && <p className="invite-banner"><Icon name="mark_email_read"/>Вы открыли приглашение — комната уже выбрана. Укажите имя и подключитесь.</p>}
      <label className="field">Ваше имя<input aria-label="Твоё имя" autoFocus maxLength={40} value={name} onChange={e=>setName(e.target.value)} placeholder="Например, Максим" autoComplete="given-name"/></label><small>Его увидит собеседник. Можно оставить пустым.</small>
      <fieldset className="reply-choice"><legend>Как вам удобнее отвечать</legend><div className="reply-options">{(['gesture','voice'] as const).map(mode=><button key={mode} aria-pressed={replyMode===mode} onClick={()=>setReplyMode(mode)}><strong><Icon name={replyMode===mode?'radio_button_checked':'radio_button_unchecked'}/>{mode==='gesture'?'Жестами':'Голосом'}</strong><small>{mode==='gesture'?'Готовые фразы по движениям':'Английские субтитры речи'}</small></button>)}</div><p>Можно изменить во время звонка. Текстовый чат доступен всегда.</p></fieldset>
      {joining && !invited && <label className="field">Ссылка или код комнаты<input value={link} onChange={e=>setLink(e.target.value)} placeholder="Вставьте ссылку приглашения"/></label>}
      <button className="primary entry-submit" disabled={busy||(joining&&!link.trim())} onClick={()=>joining?join():void create()}>{busy?'Создаём звонок…':joining?'Присоединиться к звонку':'Создать звонок'}</button>
      <p className="permission-note">Браузер запросит камеру после подключения. Микрофон включается отдельно.</p>
      {error && <p className="error" role="alert">{error}</p>}
    </dialog>
  </>;
}

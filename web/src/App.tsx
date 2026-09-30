import { phraseExplanation } from './phraseMapping';
import { useState } from 'react';
import LocalRecognition from './LocalRecognition';
import CallPage from './CallPage';
import DatasetExamples from './DatasetExamples';

export default function App() {
  const params = new URLSearchParams(location.search);
  const [call, setCall] = useState<{ roomId: string; name: string } | null>(null);
  const [name, setName] = useState('');
  const [link, setLink] = useState(params.get('room') ?? '');
  const [replyMode, setReplyMode] = useState<'gesture'|'voice'>('gesture');
  const [joining, setJoining] = useState(params.has('room'));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (params.get('mode') === 'local') return <LocalRecognition/>;
  if (params.get('mode') === 'examples') return <DatasetExamples/>;
  if (call) return <CallPage roomId={call.roomId} name={call.name} initialReplyMode={replyMode} onHome={() => { history.replaceState(null, '', location.pathname); setCall(null); setLink(''); }}/ >;
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
  return <main className="home">
    <header><a className="brand" href="./">SignBridge</a><a href="?mode=examples">Посмотреть движения</a></header>
    <div className="welcome-layout"><section className="welcome-copy">
      <h1>Разговор, который видно.</h1>
      <p className="welcome-lead">Видеозвонок на двоих: отвечай движениями, голосом или текстом.</p>
      <div className="conversation-example" aria-label="Пример общения, не распознавание"><span>Например</span><p>Покажи заданное движение <strong>Hello</strong></p><p>Ответь голосом на английском <strong>Nice to meet you</strong></p><small>Оба увидят сообщения рядом с видео.</small></div>
      <p className="honest-note">{phraseExplanation}.</p>
    </section><section className="entry-form" aria-label="Вход в разговор">
      {invited ? <><h2>Тебя пригласили в звонок</h2><p>Комната <strong>{link.slice(0,8)}</strong>. Подключись, когда будешь готов.</p></> : <><h2>Давай начнём</h2><div className="segmented"><button aria-pressed={!joining} onClick={()=>setJoining(false)}>Начать звонок</button><button aria-pressed={joining} onClick={()=>setJoining(true)}>Присоединиться</button></div></>}
      <label className="field">Твоё имя <span>(необязательно)</span><input maxLength={40} value={name} onChange={e=>setName(e.target.value)} placeholder="Как тебя представить" autoComplete="given-name"/></label>
      <fieldset className="reply-choice"><legend>Как удобнее отвечать?</legend><div className="segmented"><button aria-pressed={replyMode==='gesture'} onClick={()=>setReplyMode('gesture')}>Жестами</button><button aria-pressed={replyMode==='voice'} onClick={()=>setReplyMode('voice')}>Голосом</button></div><small>Можно менять во время звонка. Текст доступен всегда.</small></fieldset>
      {joining && !invited && <label className="field">Ссылка или код комнаты<input value={link} onChange={e=>setLink(e.target.value)} placeholder="Вставь приглашение"/></label>}
      <p className="permission-note">При входе браузер попросит камеру, чтобы вы видели друг друга. Микрофон включается только по твоему действию.</p>
      <button className="primary entry-submit" disabled={busy || (joining && !link.trim())} onClick={()=>joining ? join() : void create()}>{busy?'Создаём звонок…':joining?'Присоединиться к звонку':'Начать звонок'}</button>
      {error && <p className="error" role="alert">{error}</p>}
      <small>Без регистрации. Видео и история не записываются на сервер.</small>
    </section></div>
    <footer><a href="?mode=local">Проверить распознавание на своей камере</a></footer>
  </main>;
}

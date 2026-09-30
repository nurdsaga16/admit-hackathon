import { useState } from 'react';
import LocalRecognition from './LocalRecognition';
import CallPage from './CallPage';
import DatasetExamples from './DatasetExamples';

export default function App() {
  const params = new URLSearchParams(location.search);
  const [call, setCall] = useState<{ roomId: string; name: string } | null>(null);
  const [name, setName] = useState('');
  const [link, setLink] = useState(params.get('room') ?? '');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (params.get('mode') === 'local') return <LocalRecognition/>;
  if (params.get('mode') === 'examples') return <DatasetExamples/>;
  if (call) return <CallPage roomId={call.roomId} name={call.name} onHome={() => { history.replaceState(null, '', location.pathname); setCall(null); setLink(''); }}/ >;
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
  return <main className="home">
    <header><a className="brand" href="./"><span className="mark">S</span>SignBridge</a><a className="quiet-link" href="?mode=local">Проверить распознавание</a></header>
    <section className="intro"><p className="eyebrow">РАЗГОВОР, КОТОРЫЙ ВИДНО</p><h1>На связи.<br/><span>На одном экране.</span></h1><p>Видеозвонок на двоих: подтверждённые жесты становятся сообщениями, английская речь — субтитрами.</p></section>
    <div className="home-grid"><section className="card"><h2>{params.has('room') ? 'Тебя пригласили в разговор' : 'Начать разговор'}</h2>
      <label className="field">Твоё имя<input maxLength={40} value={name} onChange={e => setName(e.target.value)} placeholder="Как тебя представить" autoComplete="given-name"/></label>
      <button className="primary" disabled={busy} onClick={() => void create()}>{busy ? 'Создаём комнату…' : 'Создать комнату'}</button>
      <div className="join-section"><label className="field">Ссылка или код комнаты<input value={link} onChange={e => setLink(e.target.value)} placeholder="Вставь ссылку от собеседника"/></label><button disabled={busy || !link.trim()} onClick={join}>Подключиться</button></div>
      {error && <p className="error" role="alert">{error}</p>}
      <p>Камера запрашивается при входе. Микрофон и распознавание речи включаются отдельно.</p>
    </section><section className="home-notes"><h2>Один разговор — два способа ответить</h2><ol><li>Создай комнату и отправь ссылку собеседнику.</li><li>Покажи поддерживаемый жест, проверь слово и подтверди отправку.</li><li>Включи микрофон и английские субтитры, чтобы ответить голосом.</li></ol><p>Прототип знает 11 классов исходной модели. Hello, How are you? и I’m fine ещё не обучены.</p><p>Видео и история не записываются на сервер. Распознавание речи может передавать звук сервису браузера.</p></section></div>
    <footer><a href="?mode=examples">Примеры движений из датасета</a><p>SignBridge · разговор без установки приложения</p></footer>
  </main>;
}

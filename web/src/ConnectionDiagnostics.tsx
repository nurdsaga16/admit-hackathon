import type { CallSession } from './callSession';

export default function ConnectionDiagnostics({call}: {call: CallSession | null}) {
  return <details>
    <summary>Диагностика соединения</summary>
    <p>101 означает открытие WebSocket, а не подключение видео. Ниже — SDP/ICE, конфигурация STUN/TURN и выбранный путь. Передай этот журнал с обоих устройств при ошибке.</p>
    <textarea aria-label="Журнал соединения" readOnly rows={12} style={{width:'100%', maxWidth:'100%', fontSize:13}}
      value={call?.diagnostics.join('\n') || 'Подключение ещё не началось.'}/>
    <p>Журнал хранится только в этой вкладке. SDP, адреса кандидатов, ссылки комнат и credentials в него не записываются.</p>
  </details>;
}

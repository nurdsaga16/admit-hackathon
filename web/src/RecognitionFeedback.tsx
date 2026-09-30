import type { RecognitionFeedbackState } from './feedbackState';

export default function RecognitionFeedback({state,canConfirm,canCancel,onConfirm,onCancel}: {
  state:RecognitionFeedbackState;canConfirm:boolean;canCancel:boolean;onConfirm:()=>void;onCancel:()=>void;
}) {
  const command = ['commands','training','ending'].includes(state.mode);
  return <section className="recognition-feedback" data-mode={state.mode} aria-label="Состояние распознавания фраз">
    <p className="next-step">{state.nextStep ?? state.title}</p>
    {state.draft ? <div className="saved-draft"><span className="draft">{state.draft}</span><small>Черновик сохранён. Проверь перед отправкой.</small></div> : <p className="draft empty">Фраза появится здесь</p>}
    <p className="recognition-hint" role="status">{state.guidance ?? state.hint}</p>
    {state.prediction && !state.draft && <p className="model-assumption">Предположение: <strong>{state.prediction.phrase}</strong><span>Ещё не готово к отправке</span></p>}
    {state.progress && <div className="recognition-progress" data-kind={state.progress.kind}><label>{command ? state.progress.label : state.draft ? 'Готово к отправке' : state.prediction ? 'Проверяем устойчивость' : 'Набираем движение'}<progress aria-label={command ? state.progress.label : 'Подготовка фразы'} value={state.progress.value} max={state.progress.max}/></label></div>}
    <div className="draft-actions"><button className="primary" disabled={!canConfirm} onClick={onConfirm}>Отправить</button><button disabled={!canCancel} onClick={onCancel}>Повторить</button></div>
    <details className="recognition-details"><summary>Подробности распознавания</summary><p>{state.hint}</p>{state.progress && <p>{state.progress.label}</p>}{state.stability && <p className="stability-count">{state.stability}</p>}{state.prediction && <p>Предположение: {state.prediction.phrase} · оценка модели {(state.prediction.score*100).toFixed(0)}%. Это оценка класса, не правильности жеста.</p>}</details>
  </section>;
}

import {Icon} from './design';
import type {RecognitionFeedbackState} from './feedbackState';
export default function RecognitionFeedback({state,canConfirm,canCancel,onConfirm,onCancel,onEnable,onHelp,cameraOn,enabled}: {
 state:RecognitionFeedbackState;canConfirm:boolean;canCancel:boolean;onConfirm:()=>void;onCancel:()=>void;onEnable:()=>void;onHelp:()=>void;cameraOn:boolean;enabled:boolean;
}) {
 const command=['commands','training','ending'].includes(state.mode);
 const title=command?(state.nextStep ?? state.title):state.draft?state.draft:state.mode==='disabled'?'Включите, чтобы показывать фразы':state.prediction?state.prediction.phrase:state.nextStep ?? state.title;
 const count=state.stableCount ?? 0, required=state.stableRequired ?? 3;
 return <section className="recognition-feedback" data-mode={state.mode} aria-label="Состояние распознавания фраз">
  <div className="phrase-body"><div className={state.draft?'saved-draft phrase-title':state.prediction?'model-assumption phrase-title':'phrase-title'}>{state.prediction&&!state.draft&&<small>Предположение · ещё не готово</small>}<span className={state.draft&&!command?'draft':''}>{title}</span></div>
   <div className="draft-actions">{state.draft&&!command?<><button className="primary" disabled={!canConfirm} onClick={onConfirm}><Icon name="send"/>Отправить</button><button disabled={!canCancel} onClick={onCancel}><Icon name="refresh"/>Повторить</button></>:!enabled&&!command?<button aria-label="Включить жесты" className="primary" disabled={!cameraOn||state.mode==='loading'} onClick={onEnable}><Icon name="back_hand"/>Включить распознавание</button>:null}{!state.draft&&!command&&<button onClick={onHelp}><Icon name="help"/>Как показать фразу?</button>}</div>
  </div>
  {state.progress&&(!state.draft||command)&&<div className="recognition-progress" data-kind={state.progress.kind}>{command?<label>{state.progress.label}<progress aria-label={state.progress.label} value={state.progress.value} max={state.progress.max}/></label>:<div className="progress-steps">{[{label:'Руки в кадре',value:state.progress.value>0?1:0},{label:'Движение',value:state.progress.value/state.progress.max},{label:'Проверка фразы',value:count/required}].map(step=><label key={step.label}><progress aria-label={step.label} value={step.value} max={1}/>{step.label}</label>)}</div>}</div>}
  {command&&state.draft&&<p className="frozen-draft">Сохранено: <strong className="draft">{state.draft}</strong></p>}
  <p className="recognition-hint" role="status">{state.guidance ?? state.hint}</p>
 </section>;
}

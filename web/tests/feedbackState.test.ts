import { expect, it } from 'vitest';
import { recognitionFeedback, type FeedbackInput } from '../src/feedbackState';
const input: FeedbackInput = {lifecycle:'ready',communicating:true,hint:'Руки не видны.',frames:0,requiredFrames:35,scores:[],stableCount:0,stableRequired:3,draft:null,control:{paused:false,active:false,hint:'Переведи ладонь в рамку',progress:0},training:null,lesson:'',ending:false};
it('shows word evidence, actual counters, and never a control invitation while recognizing',()=>{
  expect(recognitionFeedback(input).hint).toBe('Руки не видны.');
  const result=recognitionFeedback({...input,frames:18,stableCount:1,scores:[{word:'person',score:.76}],hint:'Оценка ниже порога.'});
  expect(result.progress).toEqual({kind:'frames',value:18,max:35,label:'18 / 35 кадров'});
  expect(result.stability).toBe('Совпало окон: 1 / 3');
  expect(result.prediction).toEqual({phrase:'Hello',score:.76});expect(result.draft).toBeNull();
});
it('keeps the saved draft separate from later predictions and switches progress on control entry/exit',()=>{
  const withDraft={...input,draft:'day',scores:[{word:'person',score:.91}]};
  expect(recognitionFeedback(withDraft).draft).toBe('Thank you');
  const commands=recognitionFeedback({...withDraft,control:{...input.control,paused:true,progress:.4}});
  expect(commands.mode).toBe('commands');expect(commands.progress?.kind).toBe('command');expect(commands.prediction).toBeNull();expect(commands.draft).toBe('Thank you');expect(commands.hint).toContain('Слова приостановлены');
  expect(recognitionFeedback(withDraft).progress?.kind).toBe('frames');
});
it('prioritizes off, loading, errors, training and exit confirmation independently',()=>{
  for(const lifecycle of ['off','loading','error','stalled'] as const)expect(recognitionFeedback({...input,lifecycle,ending:true}).mode).toBe(lifecycle);
  expect(recognitionFeedback({...input,communicating:false}).mode).toBe('disabled');
  expect(recognitionFeedback({...input,training:'palm',lesson:'Разогни мизинец.'}).hint).toContain('Разогни мизинец.');
  expect(recognitionFeedback({...input,ending:true,training:'palm'}).mode).toBe('ending');
});

it('guides the next step without turning model scores into gesture correctness',()=>{
 expect(recognitionFeedback(input).nextStep).toBe('Покажи руку');
 const uncertain=recognitionFeedback({...input,hint:'Оценка ниже порога 80%. Результат не принят.',scores:[{word:'person',score:.76}]});
 expect(uncertain.nextStep).toBe('Попробуй ещё раз');expect(uncertain.guidance).toContain('Убери руки на секунду');
 const ready=recognitionFeedback({...input,draft:'time',hint:'Черновик сохранён.'});expect(ready.nextStep).toBe('Проверь и отправь');expect(ready.draft).toBe('One moment, please');
});

it('keeps saved-draft guidance ahead of later uncertainty, with command and error priority',()=>{
 const ready={...input,draft:'time',hint:'Оценка ниже порога 80%.',scores:[{word:'person',score:.76}]};
 expect(recognitionFeedback(ready).guidance).toContain('Отправь фразу');
 expect(recognitionFeedback({...ready,control:{...input.control,paused:true}}).guidance).toContain('Слова приостановлены');
 expect(recognitionFeedback({...ready,lifecycle:'error',hint:'Ошибка камеры'}).guidance).toBe('Ошибка камеры');
});

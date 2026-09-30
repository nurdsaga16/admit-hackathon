import { commandNames, type Command } from './commands';
import { getPhrase } from './phraseMapping';

export type FeedbackInput = {
  lifecycle: 'off' | 'loading' | 'ready' | 'error' | 'stalled';
  communicating: boolean; hint: string; frames: number; requiredFrames: number;
  scores: {word:string;score:number}[]; stableCount:number; stableRequired:number;
  draft:string|null; control:{paused:boolean;active:boolean;hint:string;progress:number};
  training:Command|null; lesson:string; ending:boolean;
};
export function recognitionFeedback(input: FeedbackInput) {
  const {lifecycle, control, training, ending} = input;
  const mode = lifecycle !== 'ready' ? lifecycle : ending ? 'ending' : training ? 'training'
    : control.paused ? 'commands' : !input.communicating ? 'disabled' : 'words';
  const words = mode === 'words';
  const commandProgress = ['commands','training','ending'].includes(mode);
  const title = mode === 'off' ? 'Камера выключена' : mode === 'loading' ? 'Загрузка распознавания'
    : mode === 'error' ? 'Ошибка распознавания' : mode === 'stalled' ? 'Кадры не поступают'
    : mode === 'ending' ? 'Завершить звонок? Ладонь — да, кулак — нет'
    : mode === 'training' ? `Обучение: ${commandNames[training!]}`
    : mode === 'commands' ? (control.active ? 'Команды: удержание / нейтральное положение' : 'Вход в управление')
    : mode === 'disabled' ? 'Распознавание фраз выключено' : 'Распознавание фраз';
  const hint = mode === 'off' ? 'Включи камеру для распознавания.'
    : mode === 'disabled' ? 'Удержи ладонь в рамке, чтобы включить общение, или нажми «Включить жесты».'
    : mode === 'training' ? `${input.lesson} ${control.hint}`
    : mode === 'ending' ? `Слова приостановлены до решения о выходе. Сначала нейтральное положение 0,5 с. ${control.hint}`
    : mode === 'commands' ? `${control.hint} Слова приостановлены из-за области команд. Убери руку из рамки на 0,5 с для продолжения.`
    : input.hint;
  const uncertain = /ниже порога|не различает|некорректную/.test(hint);
  const nextStep = mode === 'words' ? input.draft ? 'Проверь и отправь' : /Руки не видны/.test(hint) ? 'Покажи руку' : uncertain ? 'Попробуй ещё раз' : input.frames > 0 ? 'Продолжай движение' : 'Покажи движение'
    : mode === 'disabled' ? 'Включи распознавание' : title;
  const guidance = mode === 'words' && input.draft ? 'Отправь фразу или нажми «Повторить». Перед повтором убери руки из кадра на секунду.'
    : uncertain ? 'Пока не удалось уверенно различить движение. Убери руки на секунду и покажи его заново. Можно открыть пример.' : hint;
  return {
    mode,title,hint,nextStep,guidance,
    draft:input.draft ? getPhrase(input.draft) : null,
    prediction:words && input.scores[0] && Number.isFinite(input.scores[0].score) ? {phrase:getPhrase(input.scores[0].word),score:input.scores[0].score} : null,
    stability:words ? `Совпало окон: ${input.stableCount} / ${input.stableRequired}` : null,
    progress:words ? {kind:'frames',value:input.frames,max:input.requiredFrames,label:`${input.frames} / ${input.requiredFrames} кадров`}
      : commandProgress ? {kind:'command',value:control.progress,max:1,label:control.active?'Удержание команды':'Вход в область команд'} : null,
  };
}
export type RecognitionFeedbackState = ReturnType<typeof recognitionFeedback>;

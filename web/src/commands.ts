import type { Point } from './core';

export type Command = 'palm' | 'fist' | 'v';
type Finger = 'extended' | 'bent' | 'uncertain';
export const commandNames = { palm: 'Раскрытая ладонь', fist: 'Кулак', v: 'V' };
// Unmirrored camera coordinates; the canvas is mirrored with the video.
export const controlArea = { x: 0.05, y: 0.08, width: 0.32, height: 0.42 };
export const timing = { entry: 700, hold: 1000, neutral: 450, gap: 350, confirmation: 12000 };
const names = ['большой', 'указательный', 'средний', 'безымянный', 'мизинец'];
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function angle(a: Point, b: Point, c: Point) {
  const u = [a.x-b.x,a.y-b.y,a.z-b.z], v = [c.x-b.x,c.y-b.y,c.z-b.z];
  return Math.acos(Math.max(-1, Math.min(1, u.reduce((s,x,i) => s+x*v[i],0) / (Math.hypot(...u)*Math.hypot(...v) || 1)))) * 180 / Math.PI;
}
export function measureHand(hand: Point[], aspect = 1) {
  const valid = hand.length === 21 && hand.every(p => [p.x,p.y,p.z].every(Number.isFinite));
  const center = valid ? [0,5,9,13,17].reduce((p,i) => ({x:p.x+hand[i].x/5,y:p.y+hand[i].y/5}), {x:0,y:0}) : {x:0,y:0};
  const inside = valid && center.x >= controlArea.x && center.x <= controlArea.x+controlArea.width && center.y >= controlArea.y && center.y <= controlArea.y+controlArea.height;
  const p = hand.map(p => ({x:p.x*aspect,y:p.y,z:p.z*aspect}));
  const size = valid ? distance(p[0],p[9]) : 0;
  const issue = !valid ? 'Покажи всю кисть: нужны все 21 точки.'
    : hand.some(p => p.x < .02 || p.x > .98 || p.y < .02 || p.y > .98) ? 'Кисть у края кадра. Перемести её ближе к центру рамки.'
    : size < .07 ? 'Поднеси кисть ближе к камере: точки слишком близко друг к другу.'
    : size > .55 ? 'Отодвинь кисть: она слишком близко к камере.' : '';
  const fingers: Finger[] = valid ? [1,5,9,13,17].map((base, i) => {
    const a = angle(p[base],p[base+1],p[base+2]), b = angle(p[base+1],p[base+2],p[base+3]);
    const reach = distance(p[base+3], p[0])/Math.max(distance(p[base+1],p[0]),.001);
    if (i === 0) {
      const spread = distance(p[4],p[5])/size;
      return a > 145 && b > 150 && spread > .65 ? 'extended' : spread < .55 ? 'bent' : 'uncertain';
    }
    return a > 155 && b > 150 && reach > 1.15 ? 'extended' : a < 115 && reach < 1.05 ? 'bent' : 'uncertain';
  }) : [];
  const spread = valid ? angle(p[8],p[5], {x:p[5].x+p[12].x-p[9].x,y:p[5].y+p[12].y-p[9].y,z:p[5].z+p[12].z-p[9].z}) : 0;
  let command: Command | null = null;
  if (!issue) {
    if (fingers.every(f => f === 'extended')) command = 'palm';
    if (fingers.every(f => f === 'bent')) command = 'fist';
    if (fingers[0] === 'bent' && fingers[1] === 'extended' && fingers[2] === 'extended' && fingers[3] === 'bent' && fingers[4] === 'bent' && spread >= 15 && spread <= 65) command = 'v';
  }
  return { inside, issue, fingers, spread, command };
}
export function trainingHint(hand: Point[], target: Command, aspect = 1): string {
  const m = measureHand(hand, aspect);
  if (m.issue) return m.issue;
  if (!m.inside) return 'Перемести центр ладони в выделенную область вверху справа на своём видео.';
  const expected = target === 'palm' ? [true,true,true,true,true] : target === 'fist' ? [false,false,false,false,false] : [false,true,true,false,false];
  const changes = m.fingers.flatMap((f,i) => f === (expected[i] ? 'extended' : 'bent') ? [] : [`${expected[i] ? 'Разогни' : 'Согни'} ${names[i]} палец`]);
  if (changes.length) return changes.join('. ') + '.';
  if (target === 'v' && m.spread < 15) return 'Разведи указательный и средний пальцы шире: угол меньше 15°.';
  if (target === 'v' && m.spread > 65) return 'Сблизь указательный и средний пальцы: угол больше 65°.';
  return 'Положение подходит.';
}

export class CommandController {
  active = false;
  private entered: number | null = null;
  private neutral: number | null = null;
  private held: Command | null = null;
  private since = 0;
  private locked = false;
  private last: number | null = null;
  reset() { this.active = false; this.entered = null; this.neutral = null; this.held = null; this.locked = false; this.last = null; }
  tick(hands: Point[][], now: number, aspect = 1, target: Command | null = null) {
    if (this.last !== null && now-this.last > timing.gap) this.reset();
    this.last = now;
    const measured = hands.map(h => measureHand(h, aspect));
    const inArea = measured.filter(m => m.inside);
    const inside = inArea.length > 0;
    const detected = inArea.length === 1 && !inArea[0].issue ? inArea[0].command : null;
    const command = target && detected !== target ? null : detected;
    let hint = inArea.length > 1 ? 'Оставь в области управления одну руку.' : inArea[0]?.issue || 'Переведи центр ладони в рамку вверху справа на своём видео.';
    let progress = 0, fired: Command | null = null;
    if (inside && (inArea.length !== 1 || inArea[0].issue)) {
      this.entered = null; this.held = null; this.neutral = null;
      return {paused:true, active:this.active, progress, hint, fired};
    }
    if (!inside) {
      this.entered = null; this.held = null;
      this.neutral ??= now;
      if (now-this.neutral >= timing.neutral) { this.active = false; this.locked = false; }
    } else {
      this.entered ??= now;
      if (!this.active) {
        progress = Math.min(1,(now-this.entered)/timing.entry);
        hint = `Вход в управление: удерживай ещё ${Math.max(0,(timing.entry-now+this.entered)/1000).toFixed(1)} с.`;
        if (progress >= 1) { this.active = true; this.held = null; }
      } else if (!command) {
        this.held = null;
        // Only a visible, valid neutral pose rearms within the area.
        if (inArea.length === 1 && !inArea[0].issue) {
          this.neutral ??= now;
          if (now-this.neutral >= timing.neutral) this.locked = false;
        } else this.neutral = null;
        hint = inArea.length > 1 || inArea[0]?.issue ? hint : 'Положение переходное. Выбери ладонь, кулак или V; для обучения выбери команду ниже.';
      } else {
        this.neutral = null;
        if (this.locked) hint = 'Команда выполнена. Убери руку из рамки на 0,5 с или покажи нейтральное положение.';
        else {
          if (this.held !== command) { this.held = command; this.since = now; }
          progress = Math.min(1,(now-this.since)/timing.hold);
          hint = `${commandNames[command]}: удерживай ещё ${Math.max(0,(timing.hold-now+this.since)/1000).toFixed(1)} с.`;
          if (progress >= 1) { fired = command; this.locked = true; this.held = null; }
        }
      }
    }
    return { paused: inside || this.active, active: this.active, progress, hint, fired };
  }
}

// Draft survives tracking loss and control poses. Only a stable word may fill it.
export class CommandConversation {
  draft: string | null = null;
  communicating = false;
  confirmUntil: number | null = null;
  offer(word: string | null) { if (!this.draft && word) this.draft = word; }
  expire(now: number) { if (this.confirmUntil !== null && now >= this.confirmUntil) this.confirmUntil = null; }
  act(command: Command, now: number, send: (word: string) => boolean, end: () => void) {
    this.expire(now);
    if (this.confirmUntil !== null) {
      if (command === 'palm') { this.confirmUntil = null; end(); return 'Звонок завершён.'; }
      if (command === 'fist') { this.confirmUntil = null; return 'Завершение отменено.'; }
      return 'Для выхода покажи ладонь, для продолжения — кулак.';
    }
    if (command === 'v') { this.confirmUntil = now+timing.confirmation; return 'Завершить звонок? После нейтрального положения: ладонь — выйти, кулак — продолжить. 12 секунд на подтверждение.'; }
    if (command === 'fist') { this.draft = null; return 'Черновик отменён. Выйди из рамки и повтори слово.'; }
    if (!this.communicating) { this.communicating = true; return 'Общение включено. Выйди из рамки и покажи слово.'; }
    if (!this.draft) return 'Черновик пуст. Сначала покажи слово вне области управления.';
    if (!send(this.draft)) return 'Нет соединения для отправки. Черновик сохранён.';
    this.draft = null;
    return 'Сообщение отправлено.';
  }
}

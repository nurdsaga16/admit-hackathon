export type Point = { x: number; y: number; z: number; visibility?: number };
export type Frame = { hand_0: Point[]; hand_1: Point[]; pose: Point[] };
export type Metadata = { labels: string[]; featureOrder: string[]; mean: number[]; scale: number[]; windowSize: number; sequenceLength: number; targetFps: number };
export type Settings = { threshold: number; margin: number; stableWindows: number };
export const defaults: Settings = { threshold: 0.8, margin: 0.2, stableWindows: 3 };
export const tips = [4, 8, 12, 16, 20];
export const joints = [11, 12, 13, 14, 15, 16];

// Compatibility with upstream realtime inference: population std, detection order.
export function features(frames: Frame[], order: string[]): number[] {
  const result: Record<string, number> = {};
  for (const [key, prefix] of [['pose', 'joints'], ['hand_0', 'left_tips'], ['hand_1', 'right_tips']] as const) {
    for (const axis of ['x', 'y', 'z'] as const) {
      const values = frames.flatMap(frame => frame[key].map(p => p[axis]));
      const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      result[`${prefix}_${axis}_mean`] = mean;
      result[`${prefix}_${axis}_std`] = values.length ? Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / values.length) : 0;
    }
  }
  return order.map(name => { if (!(name in result)) throw new Error(`Unknown feature: ${name}`); return result[name]; });
}
export function normalize(rows: number[][], meta: Metadata): Float32Array {
  return Float32Array.from(rows.flatMap(row => row.map((x, i) => (x - meta.mean[i]) / meta.scale[i])));
}
export function visibilityHint(frame: Frame): string | null {
  const hands = [...frame.hand_0, ...frame.hand_1];
  if (!hands.length) return 'Руки не видны. Покажи хотя бы одну руку перед камерой.';
  if ([...hands, ...frame.pose].some(p => ![p.x, p.y, p.z].every(Number.isFinite))) return 'Точки потеряны. Верни руку в кадр и дождись восстановления точек.';
  if (hands.some(p => p.x < 0.04 || p.x > 0.96 || p.y < 0.04 || p.y > 0.96)) return 'Рука у края кадра. Перемести её ближе к центру.';
  if (frame.pose.length !== 6 || frame.pose.some(p => (p.visibility ?? 1) < 0.5 || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1))
    return 'Плечи, локти или запястья не видны. Отойди немного и помести верхнюю часть тела в кадр.';
  return null;
}

export class Sequence {
  frames: Frame[] = [];
  rows: number[][] = [];
  lastTime: number | null = null;
  constructor(readonly meta: Metadata) {}
  reset() { this.frames = []; this.rows = []; this.lastTime = null; }
  push(frame: Frame, time: number): number[][] | null {
    if (visibilityHint(frame)) { this.reset(); return null; }
    if (this.lastTime !== null && time - this.lastTime > 350) this.reset();
    this.lastTime = time;
    this.frames.push(frame);
    if (this.frames.length < this.meta.windowSize) return null;
    this.rows.push(features(this.frames, this.meta.featureOrder));
    this.frames = [];
    this.rows = this.rows.slice(-this.meta.sequenceLength);
    return this.rows.length === this.meta.sequenceLength ? this.rows : null;
  }
  get progress() { return Math.min(this.meta.windowSize * this.meta.sequenceLength, this.rows.length * this.meta.windowSize + this.frames.length); }
}

export class Stability {
  candidate: string | null = null;
  count = 0;
  confirmed: string | null = null;
  private absentSince: number | null = null;
  clearCandidate() { this.candidate = null; this.count = 0; }
  tracking(hasHands: boolean, now: number) {
    if (hasHands) { this.absentSince = null; return; }
    this.clearCandidate();
    this.absentSince ??= now;
    if (now - this.absentSince >= 800) this.confirmed = null;
  }
  update(scores: number[], labels: string[], settings: Settings): string | null {
    const ranked = scores.map((score, i) => ({ score, label: labels[i] })).sort((a, b) => b.score - a.score);
    if (scores.some(x => !Number.isFinite(x)) || ranked[0].score < settings.threshold || ranked[0].score - ranked[1].score < settings.margin) {
      this.clearCandidate(); return null;
    }
    const label = ranked[0].label;
    this.count = label === this.candidate ? this.count + 1 : 1;
    this.candidate = label;
    return this.count >= settings.stableWindows && label !== this.confirmed ? label : null;
  }
  confirm(label: string, settings: Settings): boolean {
    if (this.candidate !== label || this.count < settings.stableWindows || label === this.confirmed) return false;
    this.confirmed = label;
    return true;
  }
}

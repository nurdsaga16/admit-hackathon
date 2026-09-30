import { describe, it, expect } from 'vitest';
import { Sequence, Stability, defaults, features, normalize, visibilityHint, type Frame } from '../src/core';
import meta from '../public/model/metadata.json';
import fixtures from './fixtures/parity.json';
const point = { x: 0.5, y: 0.5, z: -0.1, visibility: 1 };
const frame: Frame = { hand_0: Array(5).fill(point), hand_1: [], pose: Array(6).fill(point) };
const empty: Frame = { hand_0: [], hand_1: [], pose: [] };
describe('Python feature fixtures (synthetic)', () => {
  it('matches both original Python feature methods and StandardScaler', () => {
    for (const sample of fixtures.cases) {
      if (!sample.frames || !sample.features) continue;
      const rows = Array.from({ length: 5 }, (_, i) => features(sample.frames.slice(i * 7, i * 7 + 7), meta.featureOrder));
      rows.flat().forEach((x, i) => expect(Math.abs(x - sample.features!.flat()[i])).toBeLessThanOrEqual(fixtures.featureAtol));
      normalize(rows, meta).forEach((x, i) => expect(Math.abs(x - sample.normalized.flat()[i])).toBeLessThanOrEqual(fixtures.normalizedAtol));
    }
  });
});
describe('sequence and visibility', () => {
  it('accepts one hand and requires 35 fresh frames', () => {
    expect(visibilityHint(frame)).toBeNull();
    const sequence = new Sequence(meta);
    for (let i = 0; i < 34; i++) expect(sequence.push(frame, i * 67)).toBeNull();
    expect(sequence.push(frame, 34 * 67)).toHaveLength(5);
    expect(sequence.push(frame, 35 * 67)).toBeNull();
  });
  it('clears all old frames immediately when tracking is lost', () => {
    const sequence = new Sequence(meta);
    for (let i = 0; i < 35; i++) sequence.push(frame, i * 67);
    expect(sequence.push(empty, 35 * 67)).toBeNull();
    expect(sequence.progress).toBe(0);
    for (let i = 0; i < 34; i++) expect(sequence.push(frame, 3000 + i * 67)).toBeNull();
  });
  it('resets after stalled frames and rejects edge/occluded body/invalid points', () => {
    const sequence = new Sequence(meta);
    sequence.push(frame, 0); sequence.push(frame, 500);
    expect(sequence.progress).toBe(1);
    expect(visibilityHint({ ...frame, hand_0: [{ ...point, x: 0.01 }] })).toContain('края');
    expect(visibilityHint({ ...frame, pose: [] })).toContain('Плечи');
    expect(visibilityHint({ ...frame, pose: Array(6).fill({ ...point, visibility: 0.1 }) })).toContain('Плечи');
    expect(visibilityHint({ ...frame, hand_0: [{ ...point, x: NaN }] })).toContain('потеряны');
  });
});
describe('stabilization and explicit confirmation', () => {
  const labels = ['a', 'b', 'c'];
  it('requires consecutive confident windows and explicit confirmation', () => {
    const gate = new Stability();
    expect(gate.update([0.9, 0.05, 0.05], labels, defaults)).toBeNull();
    expect(gate.confirm('a', defaults)).toBe(false);
    gate.update([0.9, 0.05, 0.05], labels, defaults);
    expect(gate.update([0.9, 0.05, 0.05], labels, defaults)).toBe('a');
    expect(gate.confirmed).toBeNull();
    expect(gate.confirm('a', defaults)).toBe(true);
    for (let i = 0; i < 100; i++) {
      expect(gate.update([0.9, 0.05, 0.05], labels, defaults)).toBeNull();
      expect(gate.confirm('a', defaults)).toBe(false);
    }
  });
  it('does not rearm on momentary tracking loss or low confidence', () => {
    const gate = new Stability();
    for (let i = 0; i < 3; i++) gate.update([0.9, 0.05, 0.05], labels, defaults);
    gate.confirm('a', defaults);
    gate.tracking(false, 0); gate.tracking(false, 200); gate.tracking(true, 300);
    gate.update([0.4, 0.3, 0.3], labels, defaults);
    for (let i = 0; i < 3; i++) expect(gate.update([0.9, 0.05, 0.05], labels, defaults)).toBeNull();
    gate.tracking(false, 400); gate.tracking(false, 1200);
    gate.tracking(true, 1300);
    for (let i = 0; i < 2; i++) expect(gate.update([0.9, 0.05, 0.05], labels, defaults)).toBeNull();
    expect(gate.update([0.9, 0.05, 0.05], labels, defaults)).toBe('a');
  });
  it('rejects uncertainty, alternating labels, and invalid outputs', () => {
    const gate = new Stability();
    for (let i = 0; i < 10; i++) {
      expect(gate.update(i % 2 ? [0.9, 0.05, 0.05] : [0.05, 0.9, 0.05], labels, defaults)).toBeNull();
    }
    expect(gate.update([0.45, 0.4, 0.15], labels, defaults)).toBeNull();
    expect(gate.update([NaN, 0.1, 0.1], labels, defaults)).toBeNull();
    expect(gate.confirm('a', defaults)).toBe(false);
  });
});

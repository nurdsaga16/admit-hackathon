import * as ort from 'onnxruntime-web/wasm';
import runtimeUrl from '../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url';
import { normalize, type Metadata } from './core';
const base = import.meta.env.BASE_URL;
ort.env.wasm.numThreads = 1;
// Vite must emit the runtime as an asset, outside its dependency prebundle.
ort.env.wasm.wasmPaths = { mjs: runtimeUrl, wasm: `${base}ort/ort-wasm-simd-threaded.wasm` };
export class GestureModel {
  constructor(readonly session: ort.InferenceSession, readonly meta: Metadata) {}
  static async load() {
    const response = await fetch(`${base}model/metadata.json`);
    if (!response.ok) throw new Error('Не загружен словарь. Выполни экспорт модели.');
    const meta: Metadata = await response.json();
    if (meta.featureOrder.length !== 18 || meta.labels.length !== 11 || meta.mean.length !== 18 || meta.scale.length !== 18 || meta.scale.some(x => !Number.isFinite(x) || x <= 0) || meta.windowSize !== 7 || meta.sequenceLength !== 5)
      throw new Error('Несовместимые параметры модели. Повтори экспорт.');
    const session = await ort.InferenceSession.create(`${base}model/signbridge.onnx`, { executionProviders: ['wasm'] });
    return new GestureModel(session, meta);
  }
  async predict(rows: number[][]) { return this.predictNormalized(normalize(rows, this.meta)); }
  async predictNormalized(data: Float32Array) {
    const input = new ort.Tensor('float32', data, [1, 5, 18]);
    let output: ort.InferenceSession.ReturnType | undefined;
    try {
      output = await this.session.run({ input });
      return Array.from(output.probabilities.data as Float32Array);
    } finally {
      input.dispose();
      if (output) Object.values(output).forEach(t => t.dispose());
    }
  }
  async dispose() { await this.session.release(); }
}

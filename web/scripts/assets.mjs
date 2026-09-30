// Serve WASM and MediaPipe models from this origin; no runtime CDN requests.
import { mkdir, copyFile, readdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
await mkdir(new URL('public/licenses/', root), { recursive: true });
await copyFile(new URL('../LICENSE', root), new URL('public/licenses/upstream-MIT.txt', root));
for (const [from, to] of [['node_modules/onnxruntime-web/dist/', 'public/ort/'], ['node_modules/@mediapipe/tasks-vision/wasm/', 'public/mediapipe/']]) {
  await mkdir(new URL(to, root), { recursive: true });
  for (const name of await readdir(new URL(from, root))) {
    if (name === 'ort-wasm-simd-threaded.wasm' || (from.includes('tasks-vision') && (name.endsWith('.js') || name.endsWith('.wasm'))))
      await copyFile(new URL(from + name, root), new URL(to + name, root));
  }
}
await mkdir(new URL('public/landmarkers/', root), { recursive: true });
const manifest = [];
for (const [name, url] of [
  ['hand.task', 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'],
  ['pose.task', 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'],
]) {
  const path = new URL('public/landmarkers/' + name, root);
  let bytes;
  try { bytes = await readFile(path); } catch {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(path, bytes);
  }
  manifest.push({ name, url, sha256: createHash('sha256').update(bytes).digest('hex') });
  console.log(fileURLToPath(path), bytes.length);
}
await writeFile(new URL('public/landmarkers/sources.json', root), JSON.stringify(manifest, null, 2));

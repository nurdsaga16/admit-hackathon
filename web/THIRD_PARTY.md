# Third-party components

- The gesture weights, scaler, labels and feature definition are third-party components under MIT. See the root `LICENSE` for the copyright notice. Exporting to ONNX does not create a new trained model.
- ONNX Runtime Web: Microsoft, MIT; exact package version and dependencies in `package-lock.json`.
- React and Vite: MIT; exact versions in `package-lock.json`.
- Signaling uses the `ws` library (MIT); exact version in `../server/package-lock.json`. Browser WebRTC and Web Speech APIs are used directly; no transcription provider SDK or service key is embedded.
- MediaPipe Tasks Vision: Google, Apache-2.0, as specified in the npm package metadata; [source license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE). Models are official Google MediaPipe hand and full pose landmarkers, float16, version 1, downloaded by `scripts/assets.mjs`. Exact source URLs and downloaded SHA-256 hashes are recorded in `public/landmarkers/sources.json`. Their outputs are not claimed to be identical to the upstream Python Solutions detector.

Runtime WASM files and the two landmark models are generated/downloaded assets and excluded from Git. Run `npm ci` then `npm run assets` to prepare them. No CDN calls are needed by the running application.

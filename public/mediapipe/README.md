# PinViz MediaPipe assets

Same-origin hand-tracking assets. Populated by `npm run sync:mediapipe` (also runs on `postinstall`):

- `wasm/` — copied from `@mediapipe/tasks-vision` (gitignored; regenerated on install)
- `hand_landmarker.task` — HandLandmarker float16 model (committed so deploys work offline after clone+install)

Never load these from a CDN at runtime.

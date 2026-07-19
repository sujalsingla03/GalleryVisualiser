# PinViz

Drop photos into a private 3D AR space. The webcam is an optional backdrop; arrange shots with hand gestures or the mouse. Everything runs **in your browser** — no sign-in, no uploads, no third-party trackers. Photos never leave your device.

## Stack

- React 19 + Vite + TypeScript
- Three.js (SMAA + outline over a transparent canvas)
- Zustand
- `@mediapipe/tasks-vision` — local WASM + model (same-origin, no CDN)
- Vercel static hosting (optional)

## Setup

```bash
npm install   # also syncs MediaPipe WASM into public/mediapipe
npm run dev   # http://localhost:5173
```

No environment variables. Camera stays **off** until you press **Hands** in the space view.

## Security

- Hand-tracking WASM and model are served from `/mediapipe` (same origin)
- No Discord / product promo links, analytics, or remote scripts
- Deploy headers: CSP, `X-Frame-Options`, HSTS, Permissions-Policy (camera self-only)
- Photos stay as in-memory blob URLs for the session only

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the build |
| `npm test` | Unit tests (layout + gestures) |
| `npm run sync:mediapipe` | Re-copy WASM / fetch model if missing |

## Deploy

Push to GitHub and import on Vercel. No env vars. `postinstall` ensures MediaPipe assets are present before the build.

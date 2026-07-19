# PinViz

Private 3D / AR photo gallery that runs entirely in the browser. Photos never leave your device.

## Use on phone

1. Deploy to Vercel (HTTPS) or open a LAN preview.
2. Optional: **Add to Home Screen** (PWA shell caches after first visit).
3. **Choose from gallery** / **Take a photo**, or **Continue saved space**.
4. Drag to orbit · pinch to zoom · tap to open.
5. HUD: Orbit, layouts (Cloud/Grid/Spiral/Wall/Sphere/Timeline), Mix, Stop, Shot, Save, theme, Motion, Quality, Hands.

## Desktop shortcuts

| Key | Action |
|-----|--------|
| `R` | Reshuffle layout |
| `O` | Toggle auto-orbit |
| `P` | Snapshot PNG |
| `Space` / `X` | Stop all motion |
| `+` / `-` | Zoom |
| `WASD` / arrows | Pan |

Add `?debug=1` for an on-screen FPS counter (also drives adaptive quality).

## Stack

React 19 · Vite 8 · Three.js 0.160 · Zustand · MediaPipe tasks-vision (same-origin WASM) · Tailwind 4 · Vitest · Playwright

## Setup

```bash
npm install
npm run dev
```

No env vars. Camera stays off until **Hands**.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview build |
| `npm test` | Unit tests |
| `npm run test:e2e` | Build + Playwright smoke |
| `npm run sync:mediapipe` | Sync local MediaPipe assets |

## Security

CSP + frame deny + HSTS + Permissions-Policy on Vercel. No analytics. MediaPipe from `/mediapipe` only. Optional IndexedDB save stores **downscaled** canvases locally — never uploads.

## Notes

- iOS Safari camera + WebGL: verify on a real device (fragile combo).
- Instanced borders / texture atlas deferred for a later perf pass.
- Multi-select batch actions deferred.

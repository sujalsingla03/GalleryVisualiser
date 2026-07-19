# GallerySphere

Private 3D / AR photo gallery that runs entirely in the browser. Photos never leave your device.

## Use on phone

1. Deploy to Vercel (HTTPS) or open a LAN preview.
2. Optional: **Add to Home Screen** (PWA shell caches after first visit).
3. **Choose from gallery** / **Take a photo**, or **Continue saved space**.
4. Drag to orbit · pinch to zoom · tap to open.
5. HUD: Orbit, layouts (Cloud/Grid/Spiral/Wall/Sphere/Timeline), Mix, Stop, Shot, Save, theme, Motion, Quality, Hands.

## Controls

### HUD — primary bar (always visible)

| Button | Action |
|--------|--------|
| ← New | Return to landing / load new photos |
| ⊙ Reset | Snap camera back to initial framing |
| ■ Stop | Kill all spin, orbit, and momentum |
| 📷 Shot | Download a PNG snapshot |
| ✏ Draw | Open/close the drawing tool palette |
| 🤚 AR Gestures | Toggle webcam + hand-gesture control |
| ⚙ Settings | Open/close the settings drawer |

### HUD — settings drawer

Orbit · Layout cycle · Mix (reshuffle) · Save (IndexedDB) · Clear saved · Theme · Motion toggle · Quality cycle · Photo count

### Desktop keyboard shortcuts

| Key | Action |
|-----|--------|
| `R` | Reshuffle layout |
| `O` | Toggle auto-orbit |
| `P` | Snapshot PNG |
| `Space` / `X` | Stop all motion |
| `D` | Toggle draw mode + open panel |
| `Z` | Undo last drawing stroke |
| `+` / `-` | Zoom in / out |
| `WASD` / arrows | Pan camera |

Add `?debug=1` for an on-screen FPS overlay (landmark Hz, quality tier, matrix-miss counter).

## 3D Drawing mode

Enable hand tracking (**🖐 Hands** button) then point your index finger at the screen while keeping your other three fingers curled. The recognizer enters draw mode and traces a 3D tube stroke at a fixed drawing plane 6 units in front of the camera.

- **Start drawing** — extend index finger (others curled); a stroke begins immediately.
- **Draw** — move your pointing hand; the tube follows in real time.
- **Finish stroke** — curl the index finger, lower your hand, or let the 60-frame watchdog time out.
- **Undo last stroke** — press `Z` on keyboard.
- **Clear all drawings** — click the **✏ Clear** button that appears in the HUD whenever strokes exist. Drawings are session-only and cleared on reload (not saved to IndexedDB with the rest of the space — deferred decision).

Grabbing a card (pinch) is fully independent of draw mode: `isPointing()` returns false whenever a pinch is active, so you can never accidentally start a stroke while dragging a photo.

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

# PinViz

Drop photos into a private 3D AR space. Works on **phone and desktop**. Everything runs **in your browser** — no sign-in, no uploads, no trackers.

## Use on your phone

1. Deploy (Vercel) or run locally, then open the URL in **Chrome** or **Safari** on your phone.
2. Optional: browser menu → **Add to Home Screen** for an app-like icon.
3. Tap **Choose from gallery** or **Take a photo**.
4. In the space:
   - **Drag** one finger to spin
   - **Pinch** two fingers to zoom
   - **Tap** a photo to open it (✕ / ‹ › to navigate)
5. Controls:
   - **Orbit** — automatic slow spin
   - **Cloud / Grid / Spiral / Wall** — rearrange layouts
   - **Mix** — reshuffle positions
   - **Hands** — optional front-camera AR + gestures (ask for permission)

Use **HTTPS** (or localhost) so camera / Hands can work. Prefer Wi‑Fi the first time Hands loads the local model (~8 MB).

## Stack

- React 19 + Vite + TypeScript
- Three.js (outline + optional SMAA)
- Zustand
- `@mediapipe/tasks-vision` — local WASM + model (same-origin)
- Vercel static hosting (optional)

## Setup

```bash
npm install   # syncs MediaPipe WASM into public/mediapipe
npm run dev   # http://localhost:5173
```

No environment variables. Camera stays **off** until you press **Hands**.

## Security

- Hand-tracking assets from `/mediapipe` only
- No third-party promo links or analytics
- CSP / frame deny / HSTS / Permissions-Policy on Vercel
- Photos stay as in-memory blob URLs for the session

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the build |
| `npm test` | Unit tests |
| `npm run sync:mediapipe` | Re-copy WASM / fetch model if missing |

## Deploy

Push to GitHub → import on Vercel. No env vars. `postinstall` ensures MediaPipe assets exist before build.

To test phone against your PC: `npm run dev -- --host`, then open `http://<your-lan-ip>:5173` on the phone (same Wi‑Fi). Camera needs HTTPS in many browsers — deploy to Vercel for the smoothest phone camera experience.

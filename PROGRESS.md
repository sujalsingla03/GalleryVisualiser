# PinViz — Progress Checkpoint

**Last session:** 2026-05-07
**Status:** v1.1 shipped to production (Supabase auth + saved spaces + hand gesture control). Pause point for the side project.

---

## TL;DR

PinViz is a personal photo space — drop a folder of photos, they appear floating in a 3D space SOOT-WORLD-style, you navigate with mouse/trackpad **or hand gestures via webcam**, save spaces, and revisit them from any device. Auth + DB + photo storage all on Supabase. Hosted on Vercel.

- **Live:** https://pin-viz.vercel.app
- **Repo:** https://github.com/aivsomkar/PinViz
- **Working directory locally:** `/Users/omkar/Desktop/Fun Projects/triptrace` (the directory name still says "triptrace" — the *project* renamed to PinViz; you can `mv` the folder if you want)
- **Supabase project ID:** `vokhxjvfcxtdgwyatcqj`
- **Auto-deploy:** push to `main` → Vercel rebuilds

---

## Tech stack (committed choices)

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 19 + Vite + TypeScript | Fast iteration, no Next.js overkill |
| 3D | Three.js (raw, not r3f) | Custom render pipeline (SMAA + OutlinePass) needs control r3f obscures |
| State | Zustand | Lightweight, four small stores |
| Auth + DB + Storage | Supabase | Single vendor, no backend code, RLS gates per-user access |
| Hand tracking | `@mediapipe/tasks-vision` (HandLandmarker) | Browser-side WASM + WebGL, no server, ~30 fps |
| Hosting | Vercel | Auto-deploy on push, hobby tier free |
| Style | CSS variables + Tailwind v4 | Tokens-driven, no design system framework |
| Fonts | Geist (variable) | Free, similar mood to SOOT's paid Diatype |

**Explicitly NOT chosen:** Next.js (no API routes needed), Clerk (Supabase Auth covers it), Firebase (NoSQL is awkward for our schema), R3F (abstracts away the post-processing pipeline).

---

## File map (key files only)

```
src/
├── main.tsx                              # entry: inits authStore, mounts <App />
├── App.tsx                               # view machine: auth | landing | processing | space | spaces-list | loading-space
├── styles/
│   ├── tokens.css                        # design tokens (light theme + yellow accent)
│   └── globals.css                       # reset, font face, SVG filter
├── components/
│   ├── AuthGate.tsx                      # gates app behind sign-in
│   ├── AuthForm.tsx                      # email/password + magic link UI
│   ├── LandingScreen.tsx                 # drop zone (jpg/png/webp)
│   ├── ProcessingScreen.tsx              # progress UI during photo decode
│   ├── SpaceScene.tsx                    # mounts Three.js scene; mouse + trackpad + hand inputs
│   ├── SpaceHud.tsx                      # ← New space / ⊙ Reset / 🖐 Hands / ⬛ Save / count pills
│   ├── HandControl.tsx                   # webcam preview + permission UX (bottom-right HUD)
│   ├── PhotoLightbox.tsx                 # full-res modal
│   ├── SpacesList.tsx                    # "My spaces" — click → loadSpace
│   ├── LoadingSpaceScreen.tsx            # download progress while restoring
│   ├── SaveSpaceModal.tsx                # name + upload progress
│   ├── SvgFilters.tsx                    # shared SVG outline filter
│   └── ui/FrostPanel.tsx                 # frost-glass primitive
├── three/
│   ├── createScene.ts                    # renderer + composer (RenderPass → Outline → SMAA → Output)
│   ├── createPhotoCard.ts                # textured plane mesh + white border, billboard-friendly
│   ├── orbitControlsFactory.ts           # OrbitControls config (zoom disabled — we handle it)
│   └── passes/outlinePassFactory.ts      # yellow #ECFF0F outline pass
├── lib/
│   ├── supabase.ts                       # Supabase client singleton
│   ├── photoHash.ts                      # content hash (SHA-256 of first 64 KB + size + name)
│   ├── loadPhoto.ts                      # File → ImageBitmap → Canvas (texture-ready)
│   ├── computeLayout.ts                  # gaussian 2D scatter w/ z-depth + min xy-distance + scale variation
│   ├── storage.ts                        # Supabase storage upload/download + JPEG encode
│   ├── handTracking.ts                   # HandTracker class — webcam + MediaPipe HandLandmarker
│   └── gestureRecognizer.ts              # pure: landmark frames → pinch/two-pinch events (TDD'd)
├── store/
│   ├── authStore.ts                      # Supabase auth state + actions
│   ├── viewStore.ts                      # current view + progress + reset trigger
│   ├── photoStore.ts                     # photos + files + hashes + layout
│   ├── spaceStore.ts                     # saved-spaces list + saveCurrent + loadSpace
│   └── handStore.ts                      # 🖐 toggle state (enabled, status, errorMessage)
└── types/
    ├── photo.ts                          # Photo (canvas + blobUrl + aspect + name + id)
    └── space.ts                          # SavedSpace + PhotoMeta

supabase/
└── migrations/
    ├── 0001_init.sql                     # spaces table + RLS
    └── 0002_storage.sql                  # photos bucket + 4 storage RLS policies

tests/lib/
├── computeLayout.test.ts                 # 8 tests, gaussian scatter + scale + z + minXyDistance
└── gestureRecognizer.test.ts             # 15 tests, pinch + two-pinch state machine
docs/superpowers/plans/                    # implementation plans
```

---

## Design decisions worth remembering

### Layout
- **Gaussian 2D scatter** (`gaussian(rng) * spread` for x/y, `gaussian * spread * 0.6` for z). Denser at center, sparser at edges. Looks organic, not grid-y.
- **Variable scale 0.5×–2.0×** per photo. Random per-slot, gives visual rhythm.
- **`minXyDistance` rejection sampling** (default 1.2 units). Prevents two photos sitting at the exact same xy spot, which made it hard to see one behind the other.

### Camera + zoom (mouse / trackpad)
- **OrbitControls' built-in zoom is DISABLED.** Reason: OrbitControls doesn't damp the dolly (`scale` is reset to 1 each frame in `update()`), so bumping `dampingFactor` only smooths pan/rotate. Trackpad's high-frequency wheel events felt choppy.
- **Custom smooth zoom** in `SpaceScene.tsx`: tracks a scalar `targetDistance` and a `targetTarget` Vec3. Each frame, `controls.target` lerps toward `targetTarget` (`TARGET_LERP = 0.18`) and camera distance lerps toward `targetDistance` (`ZOOM_LERP = 0.25`).
- **Zoom-to-cursor (mouse only):** on zoom-in, `targetTarget` is pulled toward the world point under the mouse cursor by `Math.min(magnitude * 0.5, 0.3)` per event. The user said this "rotation/lean toward cursor" feel is what makes scroll-zoom feel alive — keep it.
- **Per-source magnitude divisor** in `onWheel`: pinch (`ctrlKey`)=30, mouse wheel (large delta)=100, trackpad scroll=60. Each input source feels punchy in its own way.
- **No rotation** — `controls.enableRotate = false`. Drag = pan only. Matches SOOT WORLD's flat plane navigation.

### Hand gesture control
- **MediaPipe HandLandmarker** detects up to 2 hands per frame (21 landmarks each). Model loaded from Google's CDN on first use, cached after.
- **Pinch detection** (`isPinching` in `gestureRecognizer.ts`): 3D distance between thumb tip (landmark 4) and index tip (landmark 8) below `PINCH_THRESHOLD = 0.06` → pinching.
- **GestureRecognizer state machine** (TDD'd, 15 tests): tracks per-hand pinch state across frames, emits `pinchStart` / `pinchMove` / `pinchEnd` and `twoPinchStart` / `twoPinchMove` / `twoPinchEnd`.
- **Webcam mirrored once in HandTracker** so the user's right hand maps to the world's right side (natural feel). Then signs are negated AGAIN at the camera boundary in SpaceScene to get correct grab-drag direction (pinch right → photos follow right).
- **Gesture zoom bypasses zoom-to-cursor.** Critical: gesture zoom directly mutates `targetDistance` instead of calling `performZoom()`. Why: `performZoom`'s cursor-pull uses the **mouse** position (stale corner of the screen during hand gestures), which caused the cloud to swing/rotate during pinch zoom. Gesture has no specific point of focus, so it just dollies straight toward the orbit target.
- **Mouse and gesture coexist.** Both write to the same `targetDistance` / `targetTarget` lerp state. No mode switch — both are always live; whichever input fires drives the camera.
- **Sensitivity dialed for v1:** `PAN_SCALE_X/Y = canvas * 0.5`, `ZOOM_GAIN = 1.0`. Per-event zoom factor clamped to [0.7, 1.4] for safety.

### Render pipeline (final state)
```
RenderPass(scene, camera) → OutlinePass (yellow) → SMAAPass → OutputPass
```
TAA was DROPPED — it produced a black screen as the only scene-rendering pass and wasn't needed for static photo content.

### Photo card
- Two planes per card: white border plane (slightly larger) + photo plane in front at z=0.001. Polaroid feel.
- The file pipeline decodes the bitmap into a **2D `<canvas>`** before uploading as the texture source. ImageBitmap's flipY behavior is browser-inconsistent; canvas is reliable.

### Auth + saved spaces
- **Photos uploaded to Supabase Storage** at `{user_id}/{space_id}/{contentHash}.jpg`, encoded as 1024px max-edge JPEG @ 0.85 quality (~150 KB/photo).
- **Loaded spaces are read-only at the layout level** — Save button is hidden because we don't keep original `File` objects after download (only Blobs). Acceptable for now.
- **Photos are scoped per-user, not per-device** — sign in on any browser/device with the same email and your saved spaces appear with their photos.
- **Delete cleans up storage** — `deleteSpace` lists the user's `{user_id}/{space_id}` folder and removes all blobs first, then deletes the row.
- **Failure rollback** — if any photo upload fails mid-save, the space row is deleted and storage folder cleaned, so no orphan rows.

---

## How to pick up locally

```bash
cd "/Users/omkar/Desktop/Fun Projects/triptrace"
npm install                  # already done, but in case node_modules is wiped
npm run dev                  # http://localhost:5173
```

The local `.env` already exists with your Supabase keys. **Do not commit it** — `.gitignore` already excludes it.

If you cloned fresh elsewhere:
```bash
git clone https://github.com/aivsomkar/PinViz.git
cd PinViz
npm install
cp .env.example .env
# Edit .env with the values below:
#   VITE_SUPABASE_URL=https://vokhxjvfcxtdgwyatcqj.supabase.co
#   VITE_SUPABASE_ANON_KEY=sb_publishable_nTaic_vxOwWU6FgQ68ah7g_yPsGylXu
npm run dev
```

If working in another browser/device on the deployed site, the Supabase auth URL config already includes `https://pin-viz.vercel.app` and (probably) `http://localhost:5173`. If local sign-in fails, double-check the URL config at https://supabase.com/dashboard/project/vokhxjvfcxtdgwyatcqj/auth/url-configuration.

---

## Tuning knobs (where to twiddle if something feels off)

| Behavior | File | Value |
|---|---|---|
| Photo scatter spread | `src/lib/computeLayout.ts` | `spread = Math.cbrt(count) * 1.4` |
| Z depth (parallax intensity) | same | `depthRatio = 0.6` |
| Card size variation | same | `scaleMin = 0.5`, `scaleMax = 2.0` |
| Min distance between photos | same | `minXyDistance = 1.2` |
| Zoom step per scroll event | `src/components/SpaceScene.tsx` | `ZOOM_STEP = 0.86` |
| Zoom smoothing (camera distance) | same | `ZOOM_LERP = 0.25` |
| Target smoothing (orbit target) | same | `TARGET_LERP = 0.18` |
| Mouse-zoom cursor-pull strength | same (in `performZoom`) | `Math.min(magnitude * 0.5, 0.3)` per event |
| Pan smoothing (OrbitControls drag) | `src/three/orbitControlsFactory.ts` | `dampingFactor = 0.18` |
| Outline color | `src/three/passes/outlinePassFactory.ts` | `ACCENT_HEX = 0xecff0f` |
| Outline strength | same | `edgeStrength = 10` |
| Photo upload size | `src/lib/storage.ts` | `UPLOAD_MAX_EDGE = 1024`, `UPLOAD_QUALITY = 0.85` |
| WebGL texture size | `src/lib/loadPhoto.ts` | `MAX_TEXTURE_EDGE = 512` |
| Card border thickness | `src/three/createPhotoCard.ts` | `BORDER_RATIO = 0.05` |
| Camera framing distance | `src/components/SpaceScene.tsx` | `distance = spread * 5.5` |
| **Pinch detection threshold** | `src/lib/gestureRecognizer.ts` | `PINCH_THRESHOLD = 0.06` |
| **Hand pan sensitivity** | `src/components/SpaceScene.tsx` | `PAN_SCALE_X/Y = canvas * 0.5` |
| **Hand zoom sensitivity** | same | `ZOOM_GAIN = 1.0` |
| **Hand zoom per-event safety clamp** | same | `[0.7, 1.4]` |
| **Webcam preview size** | `src/components/HandControl.tsx` | `PREVIEW_WIDTH = 200, HEIGHT = 150` |

---

## What's next (in rough priority order)

These are real follow-ups, not aspirational. Each is sized for ~1 short session.

### 1. Re-save loaded spaces
**Problem:** Open a space from cloud, edit nothing, hit Save → button is hidden.
**Fix:** When loadSpace populates photoStore, set `files` to be Blob-backed `File` objects (pass each downloaded blob through `new File([blob], name, { type: 'image/jpeg' })`), set hashes from `photo_meta`. Then Save just re-uploads (same path, `upsert: true`) — no quality loss because the blob is the existing storage object.
**Why it's not done:** Out of scope of original "save metadata only" pivot. Would unlock real iterative editing.

### 2. Public/shared spaces
A "Make public" toggle on a space → an `is_public` column on `spaces` + a public-read RLS policy + a `/share/:id` route that anyone can open without auth. Photos in storage would need a separate policy to allow `select` for objects under a space marked public, OR generate signed URLs server-side.
**Trickiness:** Vite has no API routes. Public storage policy is the cleaner path — bucket stays private, but a special policy lets unauthenticated users read photos under public space folders.

### 3. OAuth providers (Google / GitHub)
Already supported by Supabase Auth — just needs UI buttons in `AuthForm.tsx` that call `supabase.auth.signInWithOAuth({ provider: 'google' })`. Configure providers in Supabase dashboard (Authentication → Providers). 30 minutes of work.

### 4. Pinch-tap gesture for click (open lightbox)
Currently, gesture controls navigation only — clicking a photo to open the lightbox still requires the mouse. Add a quick-pinch detection: if the pinch lasts < 200ms with minimal hand movement, treat it as a "tap" → raycast at the index fingertip's projected screen position → set `selectedId`. Adds ~30 lines to `gestureRecognizer.ts` (need a tap state) and ~20 lines wiring in `SpaceScene.tsx`.

### 5. Multiple photo selection / bulk actions
Hold-shift-click to multi-select cards in the space, then "Hide", "Group", "Recolor" actions. SOOT-style.

### 6. Fix folder name (cosmetic)
Local dir is `/Users/omkar/Desktop/Fun Projects/triptrace`. Repo and product are PinViz. Either:
- `mv` the folder (will need to re-open in editor + dev server start path)
- Leave it (works fine; just visual)

### 7. Better empty/error states
- Cloud download failure surfaces as a generic alert. Make a proper error UI on SpacesList that shows the broken space with a "Delete this broken space" button.
- Sign-up error flow (email already taken, password too short) currently shows raw Supabase error strings. Map common ones to friendlier copy.
- Hand control: if MediaPipe model fails to load (CDN down), the preview just sits in the "loading" state forever. Add a timeout + retry.

### 8. Sort modes (à la SOOT WORLD's "Name / Overview / Similarity")
- "Name": alphabetical layout
- "Color": cluster by dominant color (compute color palette per photo at decode time, sort by hue)
- "Date": layout by EXIF date
Very nice-to-have. Each is a distinct layout strategy in `computeLayout.ts`.

### 9. Mobile / touch tuning
Pan-only OrbitControls works on touch (one-finger pan), but pinch-zoom is via wheel events with ctrlKey on Mac trackpads — mobile touch gestures are different. Test on a real phone, may need to handle `gesturestart`/`gesturechange` events on iOS Safari, or use `Pointer Events` for pinch. Hand-control on mobile is awkward (you'd hold the phone with one hand, gesture with the other), so maybe skip.

### 10. Performance: many photos
At ~500 photos things may slow down (each card is its own Mesh + Texture, raycaster checks all of them every frame). If this becomes real:
- Use `THREE.InstancedMesh` for photo cards (one draw call vs 500)
- Spatial partitioning for raycaster (Octree or just a screen-space bucket)
- Texture atlas (pack thumbnails into a few large textures)

### 11. Right-click context menu on a photo
- Open in lightbox
- Hide
- "Delete from space" (mark as hidden; don't physically remove from storage)
- Center camera on this photo

---

## Open questions (decisions deferred)

- **Storage cost at scale:** at 150 KB/photo with the free tier's 1 GB, ~6,000 photos total. Past that you'd hit the $25/mo Supabase Pro tier. Acceptable for personal use; if PinViz ever gets shared with friends or has multiple users, consider migrating to Cloudflare R2 (~$0.015/GB stored).
- **Photo preview / thumbnails in SpacesList:** today the list shows just name + photo count + date. Adding a 4-photo collage thumbnail would help recognition. Cheap to do (just request the first 4 photos by hash), but a nice-to-have.
- **Layout regeneration:** clicking Reset zooms back to the camera's initial framing, but the layout itself is fixed when the scene mounts. No "shuffle" button. Easy to add: `triggerReshuffle()` on viewStore + watch in SpaceScene.
- **Hand-control onboarding:** first-time users have no idea what gestures work. Tooltip text in the HandControl preview ("🖐 Pinch to pan · 🤲 Two-hand pinch to zoom") helps but isn't great. Could add a 5-second animated walkthrough on first toggle.

---

## Known limitations / quirks

- **Loaded-from-cloud spaces can't be re-saved** (Save button hidden). See follow-up #1.
- **Original photo quality is lost on save** — we upload 1024px JPEGs. If you need full-quality archive, this isn't it. (Could add a "store originals" toggle later, separate bucket or a flag.)
- **No undo** for delete. Confirms via `confirm()` dialog. Good enough for v1.
- **Auth resilience:** if the Supabase JWT expires mid-session, you may get 401s on save/load. Should auto-refresh via the SDK; if you ever see persistent auth errors, sign out and back in.
- **iframe / cross-origin embedding:** untested. Probably broken because of the WebGL canvas + auth flow needing top-level navigation.
- **Hand control needs daylight-equivalent lighting.** Dim rooms produce jittery tracking. MediaPipe is robust but not magic.
- **No gesture-click in v1.** Mouse still required to open the photo lightbox. See follow-up #4.
- **Hand control = desktop only.** Phone use case is awkward (one hand holds the phone). If you want this on mobile someday, the design is a different beast.

---

## Cost summary (current)

| Vendor | Tier | Cost | Limits |
|---|---|---|---|
| Vercel | Hobby | $0 | 100 GB bandwidth/mo (way more than you'll use) |
| Supabase | Free | $0 | 500 MB DB, 1 GB storage, 50k MAU, 5 GB egress |
| MediaPipe | (Google CDN) | $0 | Hosted by Google; ~3 MB model, lazy-loaded |

**Total monthly cost: $0.** All free tier or free hosted assets.

If usage explodes (it won't, but): Supabase Pro is $25/mo (8 GB DB, 100 GB storage), Vercel Pro is $20/mo. Combined $45/mo for a real product with thousands of users.

---

## Important URLs

- **Production app:** https://pin-viz.vercel.app
- **GitHub repo:** https://github.com/aivsomkar/PinViz
- **Supabase dashboard:** https://supabase.com/dashboard/project/vokhxjvfcxtdgwyatcqj
- **Vercel project:** check https://vercel.com/dashboard for the PinViz project
- **Supabase SQL editor:** https://supabase.com/dashboard/project/vokhxjvfcxtdgwyatcqj/sql/new
- **Supabase auth URL config:** https://supabase.com/dashboard/project/vokhxjvfcxtdgwyatcqj/auth/url-configuration
- **Supabase storage browser:** https://supabase.com/dashboard/project/vokhxjvfcxtdgwyatcqj/storage/buckets/photos

---

## Plans archive

These are the implementation plans written during development — useful if you want to see the original spec for any milestone:

- [docs/superpowers/plans/2026-05-05-triptrace-foundation.md](docs/superpowers/plans/2026-05-05-triptrace-foundation.md) — original globe-based scaffold (architecturally superseded but methodology is reusable)
- [docs/superpowers/plans/2026-05-06-triptrace-space-pivot.md](docs/superpowers/plans/2026-05-06-triptrace-space-pivot.md) — globe → space pivot (the visual paradigm we shipped)
- [docs/superpowers/plans/2026-05-06-supabase-auth-vercel.md](docs/superpowers/plans/2026-05-06-supabase-auth-vercel.md) — auth + saved spaces (v1 metadata-only; later upgraded to full storage)
- [docs/superpowers/plans/2026-05-07-hand-gesture-control.md](docs/superpowers/plans/2026-05-07-hand-gesture-control.md) — hand gesture control via MediaPipe (this session)

PRD lives at [PRD.md](PRD.md) — written for the original "TripTrace travel photos" framing. Most of it is now superseded by the SOOT-style spatial scatter; the design tokens section (§11) is still accurate.

---

*To resume: `cd` into the project, `npm run dev`, open http://localhost:5173, sign in, drop photos. To deploy a change: `git push`. Webcam-based hand control: click 🖐 Hands in the HUD, allow camera, pinch one hand to drag, both hands to zoom.*

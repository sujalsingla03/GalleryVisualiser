import { useEffect, useRef } from 'react';
import {
  Group,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
  type Object3D,
  type Intersection,
} from 'three';
import { createScene } from '../three/createScene';
import { createPhotoCard, type PhotoCard } from '../three/createPhotoCard';
import { setupControls } from '../three/orbitControlsFactory';
import { computeLayout } from '../lib/computeLayout';
import { usePhotoStore } from '../store/photoStore';
import { handTracker } from '../lib/handTracking';
import { GestureRecognizer, type FrameSnapshot } from '../lib/gestureRecognizer';
import { useViewStore } from '../store/viewStore';
import { useSpacePrefsStore } from '../store/spacePrefsStore';
import { isCoarsePointer } from '../lib/device';
import { downloadCanvasPng } from '../lib/snapshot';
import { registerSnapshot } from '../lib/snapshotBridge';
import {
  approach,
  decayVelocity2,
  isDebugQuery,
  DISTANCE_EPS,
  POSITION_EPS,
} from '../lib/motion';

const ZOOM_STEP = 0.86;
const ZOOM_LERP = 0.25;
const MIN_DISTANCE = 0.05;
const MAX_DISTANCE = 5000;
const TARGET_LERP = 0.18;
const LAYOUT_LERP = 0.12;
const AUTO_ORBIT_SPEED = 0.22; // rad/sec (scaled by dt)
const FLOAT_AMT = 0.028;
const FLOAT_AMT_LOW = 0.012;
const IDLE_RESUME_MS = 2800;
const HAND_FRAME_TIMEOUT_MS = 450;
const TAP_SLOP_SQ = isCoarsePointer() ? 24 * 24 : 10 * 10;
const SPIN_FRICTION = 0.95;
const SPIN_MAX = 7.2; // rad/sec (was per-frame; now dt-based)

export function SpaceScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photos = usePhotoStore((s) => s.photos);
  const setSelected = usePhotoStore((s) => s.setSelected);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bundle = createScene(canvas);
    const { scene, camera, composer, outline, resize, renderer, setPixelRatioCap } = bundle;

    registerSnapshot(() => {
      downloadCanvasPng(renderer.domElement, `pinviz-${Date.now()}.png`);
    });

    const cardsRoot = new Group();
    scene.add(cardsRoot);

    const cards: PhotoCard[] = [];
    const cardIndex = new Map<PhotoCard, number>();
    const bakedScales: number[] = [];
    const basePositions: Vector3[] = [];
    const targetPositions: Vector3[] = [];
    const floatPhase: number[] = [];

    const initialMode = useSpacePrefsStore.getState().layoutMode;
    let slots = usePhotoStore.getState().layout;
    if (photos.length > 0) {
      slots =
        slots && slots.length === photos.length
          ? slots
          : computeLayout(photos.length, { mode: initialMode });
      usePhotoStore.getState().setLayout(slots);
      for (let i = 0; i < photos.length; i++) {
        const slot = slots[i];
        const card = createPhotoCard(photos[i], slot.scale);
        const { x, y, z } = slot.position;
        card.group.position.set(x, y, z);
        cardsRoot.add(card.group);
        cards.push(card);
        cardIndex.set(card, i);
        bakedScales.push(slot.scale);
        basePositions.push(new Vector3(x, y, z));
        targetPositions.push(new Vector3(x, y, z));
        floatPhase.push(i * 0.73);
      }
    }

    if (cards.length > 0) {
      const spread = Math.max(2.5, Math.cbrt(photos.length) * 1.4);
      const distance = Math.max(8, spread * 5.5);
      camera.position.set(0, 0, distance);
      camera.lookAt(0, 0, 0);
    }

    const controlsBundle = setupControls(camera, canvas);
    controlsBundle.controls.target.set(0, 0, 0);
    controlsBundle.controls.update();

    // ---- Smooth zoom state ----
    let targetDistance = camera.position.distanceTo(controlsBundle.controls.target);
    const targetTarget = controlsBundle.controls.target.clone();
    const camDir = new Vector3();
    const rootInvQuat = new Quaternion();

    // Capture the initial framing so the Reset button can snap back to it.
    const initialDistance = targetDistance;
    const initialTarget = targetTarget.clone();
    const unsubReset = useViewStore.subscribe((state, prev) => {
      if (state.resetCounter !== prev.resetCounter) {
        targetDistance = initialDistance;
        targetTarget.copy(initialTarget);
        userInteracting = true;
        interactUntil = performance.now() + 2500;
      }
    });

    // Auto-orbit pauses fully while the user is interacting; resumes only after idle timeout.
    let userInteracting = false;
    let interactUntil = 0;
    const markInteract = () => {
      userInteracting = true;
      interactUntil = performance.now() + IDLE_RESUME_MS;
    };

    const applyLayoutSlots = (next: NonNullable<typeof slots>) => {
      slots = next;
      usePhotoStore.getState().setLayout(next);
      for (let i = 0; i < cards.length; i++) {
        const { x, y, z } = next[i].position;
        targetPositions[i].set(x, y, z);
        basePositions[i].set(x, y, z);
        cards[i].group.scale.setScalar(1);
      }
    };

    const unsubLayout = useSpacePrefsStore.subscribe((state, prev) => {
      if (state.layoutNonce === prev.layoutNonce) return;
      if (photos.length === 0) return;
      applyLayoutSlots(computeLayout(photos.length, { mode: state.layoutMode }));
      markInteract();
    });

    const performZoom = (deltaY: number, magnitudeScale: number) => {
      const sign = Math.sign(deltaY);
      if (sign === 0) return;
      const magnitude = Math.min(Math.abs(deltaY) / magnitudeScale, 1.5);
      const factor = sign > 0 ? 1 / Math.pow(ZOOM_STEP, magnitude) : Math.pow(ZOOM_STEP, magnitude);
      targetDistance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, targetDistance * factor));

      // Zoom-to-cursor: pull the orbit target toward the world point under the cursor (zoom-in only).
      // The pull is proportional to the per-event zoom magnitude so it stays smooth regardless of
      // event rate (60Hz trackpad scroll vs ~10Hz mouse wheel) and capped at 0.25 per event.
      if (sign < 0) {
        camera.getWorldDirection(camDir);
        const origin = new Vector3().setFromMatrixPosition(camera.matrixWorld);
        const cursorRay = new Vector3(pointer.x, pointer.y, 0.5).unproject(camera).sub(origin).normalize();
        const planeDistance = controlsBundle.controls.target.clone().sub(origin).dot(camDir) / cursorRay.dot(camDir);
        if (Number.isFinite(planeDistance) && planeDistance > 0) {
          const focal = origin.clone().add(cursorRay.multiplyScalar(planeDistance));
          const pull = Math.min(magnitude * 0.5, 0.3);
          targetTarget.lerp(focal, pull);
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      markInteract();

      // All wheel events zoom. Pan is via mouse-drag.
      // Magnitude divisor tuned per input source so each feels natural:
      //   - Pinch fires many small events → small divisor for gentle response
      //   - Mouse wheel fires few large events → large divisor
      //   - Trackpad two-finger scroll is intermediate
      const isPinch = e.ctrlKey;
      const isMouseWheel = !isPinch && (e.deltaMode !== 0 || Math.abs(e.deltaY) >= 50);
      const divisor = isPinch ? 30 : isMouseWheel ? 100 : 60;
      performZoom(e.deltaY, divisor);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const onKeyZoom = (e: Event) => {
      const detail = (e as CustomEvent<number>).detail;
      if (typeof detail !== 'number') return;
      markInteract();
      performZoom(detail, 40);
    };
    const onKeyPan = (e: Event) => {
      const detail = (e as CustomEvent<{ dx: number; dy: number }>).detail;
      if (!detail) return;
      markInteract();
      performPan(detail.dx, detail.dy);
    };
    window.addEventListener('pinviz-zoom', onKeyZoom);
    window.addEventListener('pinviz-pan', onKeyPan);

    // Mobile: two-finger pinch zoom (OrbitControls zoom is disabled for custom smoothing).
    let pinchDist = 0;
    const touchDistance = (touches: TouchList) => {
      const a = touches[0];
      const b = touches[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };
    const onTouchStart = (e: TouchEvent) => {
      markInteract();
      if (e.touches.length === 2) {
        pinchDist = touchDistance(e.touches);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || pinchDist <= 0) return;
      e.preventDefault();
      markInteract();
      const next = touchDistance(e.touches);
      const ratio = next / pinchDist;
      // Spread fingers → zoom in (negative deltaY); pinch together → zoom out.
      performZoom((1 - ratio) * 90, 36);
      pinchDist = next;
    };
    const onTouchEnd = () => {
      pinchDist = 0;
    };
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);

    // ----- Hand-gesture input (parallel to mouse) -----
    // performPan: shift camera + orbit target by the same world-space offset so
    // view direction is preserved (true parallel pan, no rotation).
    const performPan = (dxPx: number, dyPx: number) => {
      const distance = camera.position.distanceTo(controlsBundle.controls.target);
      const fovRad = (camera.fov * Math.PI) / 180;
      const worldPerPixel = (2 * distance * Math.tan(fovRad / 2)) / canvas.clientHeight;
      const right = new Vector3().setFromMatrixColumn(camera.matrix, 0);
      const up = new Vector3().setFromMatrixColumn(camera.matrix, 1);
      const offset = right
        .multiplyScalar(dxPx * worldPerPixel)
        .add(up.multiplyScalar(-dyPx * worldPerPixel));
      camera.position.add(offset);
      controlsBundle.controls.target.add(offset);
      targetTarget.add(offset);
    };

    const recognizer = new GestureRecognizer();
    const PAN_SCALE_X = canvas.clientWidth * 0.5;
    const PAN_SCALE_Y = canvas.clientHeight * 0.5;
    const TWO_HAND_GAIN = 3.0;
    const TWIST_GAIN = 1.6;
    const SPIN_GAIN = 54; // swipe delta → rad/sec impulse
    const HELD_MIN_DIST = 1.5;
    const HELD_MAX_DIST = 40;

    const targets: Object3D[] = cards.map((c) => c.mesh);
    const meshToCard = new Map<Object3D, PhotoCard>(cards.map((c) => [c.mesh, c]));

    // ---- Hand-gesture interaction state ----
    // Photo-cloud spin (free axis), decays to a stop via friction.
    const angVel = { x: 0, y: 0 };
    // Per-card in-plane roll (radians). Session-only — billboarding overwrites orientation
    // each frame, so we re-apply roll on top.
    const rollAngles = new Map<PhotoCard, number>();
    // A single photo can be "held" — lifted out of the cloud, floating in front of you.
    // Releasing the pinch drops it exactly where it is (placement persists on Save).
    let held:
      | {
          card: PhotoCard;
          hand: 'Left' | 'Right';
          grabSpan: number;       // palm width at grab → depth baseline
          grabDistance: number;   // camera distance at grab
          grabRoll: number;       // hand roll at grab
          baseRoll: number;       // card roll at grab
          // Scale baselines, recaptured when switching between one- and two-hand scaling.
          single: { baseTM: number; baseScale: number } | null;
          two: { baseDist: number; baseScale: number } | null;
        }
      | null = null;
    let panHand: 'Left' | 'Right' | null = null;
    let snapshot: FrameSnapshot = { Left: null, Right: null };

    // Convert a normalized (mirrored) hand pointer to a world ray direction from the camera.
    const rayDir = new Vector3();
    const ndcToRayDir = (px: number, py: number): Vector3 => {
      const ndcX = px * 2 - 1;
      const ndcY = 1 - py * 2;
      rayDir.set(ndcX, ndcY, 0.5).unproject(camera).sub(camera.position).normalize();
      return rayDir;
    };

    // Write a dropped card's new position + size back into the shared layout so Save persists it.
    const persistPlacement = (card: PhotoCard) => {
      const idx = cardIndex.get(card);
      if (idx == null || !slots) return;
      slots[idx] = {
        index: idx,
        position: {
          x: card.group.position.x,
          y: card.group.position.y,
          z: card.group.position.z,
        },
        scale: bakedScales[idx] * card.group.scale.x,
      };
      basePositions[idx].copy(card.group.position);
      targetPositions[idx].copy(card.group.position);
      usePhotoStore.getState().setLayout([...slots]);
    };

    const forceReleaseHeld = () => {
      if (held) {
        cardsRoot.attach(held.card.group);
        persistPlacement(held.card);
        held = null;
      }
      panHand = null;
      recognizer.reset();
    };

    let lastHandFrameAt = 0;
    const unsubFrames = handTracker.onFrame((frame) => {
      lastHandFrameAt = performance.now();
      const events = recognizer.process(frame);
      snapshot = recognizer.snapshot;
      if (events.length > 0 || recognizer.hasActiveGesture) markInteract();
      for (const ev of events) {
        if (ev.type === 'pinchStart') {
          if (held) continue;
          // Point at a photo and pinch to grab it; pinch in empty space pans instead.
          raycaster.setFromCamera(
            new Vector2(ev.pointer.x * 2 - 1, 1 - ev.pointer.y * 2),
            camera,
          );
          const hits = raycaster.intersectObjects(targets, false);
          const card = hits.length > 0 ? meshToCard.get(hits[0].object) : undefined;
          if (card) {
            const worldPos = card.group.getWorldPosition(new Vector3());
            held = {
              card,
              hand: ev.hand,
              grabSpan: Math.max(ev.span, 1e-3),
              grabDistance: camera.position.distanceTo(worldPos),
              grabRoll: ev.roll,
              baseRoll: rollAngles.get(card) ?? 0,
              single: null,
              two: null,
            };
            // Lift out of the (spinning) cloud so it floats steadily in front of you.
            scene.attach(card.group);
          } else {
            panHand = ev.hand;
          }
        } else if (ev.type === 'pinchMove') {
          if (held && held.hand === ev.hand) {
            const card = held.card;
            // 1. Depth — pull closer / push away via palm size (bigger palm = nearer).
            const span = Math.max(ev.span, 1e-3);
            const distance = Math.max(
              HELD_MIN_DIST,
              Math.min(HELD_MAX_DIST, held.grabDistance * (held.grabSpan / span)),
            );
            // 2. Reposition — follow where the hand points, at that depth.
            const dir = ndcToRayDir(ev.pointer.x, ev.pointer.y);
            card.group.position.copy(camera.position).addScaledVector(dir, distance);

            // 3. Scale — two-hand stretch if the other hand is up, else single-hand thumb↔middle.
            const other = held.hand === 'Left' ? snapshot.Right : snapshot.Left;
            if (other && other.present && !other.pinching) {
              held.single = null;
              const handDist = Math.max(
                Math.hypot(ev.pointer.x - other.pointer.x, ev.pointer.y - other.pointer.y),
                1e-3,
              );
              if (!held.two) held.two = { baseDist: handDist, baseScale: card.group.scale.x };
              const scale = Math.max(0.3, Math.min(6, held.two.baseScale * (handDist / held.two.baseDist)));
              card.group.scale.setScalar(scale);
            } else {
              held.two = null;
              const tm = Math.max(ev.thumbMiddle, 1e-3);
              if (!held.single) held.single = { baseTM: tm, baseScale: card.group.scale.x };
              const scale = Math.max(0.3, Math.min(6, held.single.baseScale * (tm / held.single.baseTM)));
              card.group.scale.setScalar(scale);
            }

            // 4. Roll — twist the wrist to rotate the photo in its plane.
            rollAngles.set(card, held.baseRoll + (ev.roll - held.grabRoll));
          } else if (panHand === ev.hand) {
            performPan(-ev.delta.x * PAN_SCALE_X, -ev.delta.y * PAN_SCALE_Y);
          }
        } else if (ev.type === 'pinchEnd') {
          if (held && held.hand === ev.hand) {
            // Drop in place: reparent into the cloud frame (preserving world transform) and persist.
            cardsRoot.attach(held.card.group);
            persistPlacement(held.card);
            held = null;
          }
          if (panHand === ev.hand) panHand = null;
        } else if (ev.type === 'twoHandMove') {
          if (held) continue;
          // Hands together (distanceDelta < 0) → photos come closer (zoom in).
          const factor = Math.max(0.85, Math.min(1.15, 1 + ev.distanceDelta * TWO_HAND_GAIN));
          targetDistance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, targetDistance * factor));
        } else if (ev.type === 'twoHandTwist') {
          if (held) continue;
          // Both-hands twist → deliberate turntable rotation of the cloud (no momentum).
          cardsRoot.rotation.y += ev.angleDelta * TWIST_GAIN;
        } else if (ev.type === 'swipe') {
          if (held) continue;
          angVel.y = Math.max(-SPIN_MAX, Math.min(SPIN_MAX, angVel.y + ev.velocity.x * SPIN_GAIN));
          angVel.x = Math.max(-SPIN_MAX, Math.min(SPIN_MAX, angVel.x + ev.velocity.y * SPIN_GAIN));
        } else if (ev.type === 'fist') {
          angVel.x = 0;
          angVel.y = 0;
        }
      }
    });

    const unsubStop = useSpacePrefsStore.subscribe((state, prev) => {
      if (state.stopNonce !== prev.stopNonce) {
        angVel.x = 0;
        angVel.y = 0;
        forceReleaseHeld();
        markInteract();
      }
    });

    const raycaster = new Raycaster();
    const pointer = new Vector2();
    let pointerInCanvas = false;
    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      pointerInCanvas = true;
    };
    const onPointerLeave = () => {
      pointerInCanvas = false;
    };
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);

    let downX = 0;
    let downY = 0;
    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      markInteract();
    };
    const onPointerUp = (e: PointerEvent) => {
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (dx * dx + dy * dy > TAP_SLOP_SQ) return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length > 0) {
        const id = hits[0].object.userData.photoId as string | undefined;
        if (id) setSelected(id);
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);

    const onResize = () => {
      const w = Math.round(window.visualViewport?.width ?? window.innerWidth);
      const h = Math.round(window.visualViewport?.height ?? window.innerHeight);
      resize(w, h);
    };
    onResize();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('scroll', onResize);

    let raf = 0;
    let lastTick = performance.now();
    let fpsAccum = 0;
    let fpsFrames = 0;
    let fpsDisplay = 0;
    const debugFps = isDebugQuery();
    const fpsEl = debugFps ? document.createElement('div') : null;
    if (fpsEl) {
      fpsEl.className = 'fps-debug';
      fpsEl.textContent = 'FPS —';
      document.body.appendChild(fpsEl);
    }

    // matrixAutoUpdate off — we update matrices only when cards move.
    for (const c of cards) {
      c.group.matrixAutoUpdate = false;
      c.group.updateMatrix();
    }
    cardsRoot.matrixAutoUpdate = true;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTick) / 1000));
      lastTick = now;
      if (userInteracting && now > interactUntil) userInteracting = false;

      // Hand-tracking timeout while holding — MediaPipe may stop sending frames.
      if ((held || panHand) && lastHandFrameAt > 0 && now - lastHandFrameAt > HAND_FRAME_TIMEOUT_MS) {
        forceReleaseHeld();
      }

      const prefs = useSpacePrefsStore.getState();
      const reduced = prefs.effectiveReducedMotion();
      const lowQuality = prefs.qualityTier === 'low';

      // Smooth zoom / target with snap-to-rest.
      const tx = controlsBundle.controls.target.x;
      const ty = controlsBundle.controls.target.y;
      const tz = controlsBundle.controls.target.z;
      controlsBundle.controls.target.x = approach(tx, targetTarget.x, TARGET_LERP, POSITION_EPS);
      controlsBundle.controls.target.y = approach(ty, targetTarget.y, TARGET_LERP, POSITION_EPS);
      controlsBundle.controls.target.z = approach(tz, targetTarget.z, TARGET_LERP, POSITION_EPS);
      controlsBundle.update();

      const currentDistance = camera.position.distanceTo(controlsBundle.controls.target);
      const blended = approach(currentDistance, targetDistance, ZOOM_LERP, DISTANCE_EPS);
      if (Math.abs(blended - currentDistance) > DISTANCE_EPS) {
        const dir = camera.position.clone().sub(controlsBundle.controls.target).normalize();
        camera.position.copy(controlsBundle.controls.target).add(dir.multiplyScalar(blended));
      }

      // Auto-orbit only when fully idle (suspended during/after interaction).
      if (prefs.autoOrbit && !reduced && !userInteracting && !held && angVel.x === 0 && angVel.y === 0) {
        cardsRoot.rotation.y += AUTO_ORBIT_SPEED * dt;
      }

      // Spin momentum — dt-scaled friction, hard zero.
      if (angVel.x !== 0 || angVel.y !== 0) {
        cardsRoot.rotation.y += angVel.y * dt;
        cardsRoot.rotation.x += angVel.x * dt;
        decayVelocity2(angVel, SPIN_FRICTION, dt);
      }

      const floatAmp = reduced || lowQuality ? 0 : prefs.qualityTier === 'balanced' ? FLOAT_AMT_LOW : FLOAT_AMT;
      const t = now * 0.001;
      const allowFloat = floatAmp > 0 && !userInteracting;
      rootInvQuat.copy(cardsRoot.quaternion).invert();

      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        if (held && held.card === c) {
          c.group.quaternion.copy(camera.quaternion);
          c.group.updateMatrix();
          continue;
        }

        const before = basePositions[i];
        before.x = approach(before.x, targetPositions[i].x, LAYOUT_LERP, POSITION_EPS);
        before.y = approach(before.y, targetPositions[i].y, LAYOUT_LERP, POSITION_EPS);
        before.z = approach(before.z, targetPositions[i].z, LAYOUT_LERP, POSITION_EPS);

        const bob = allowFloat ? Math.sin(t * 0.55 + floatPhase[i]) * floatAmp : 0;
        c.group.position.set(before.x, before.y + bob, before.z);
        c.group.quaternion.copy(camera.quaternion).premultiply(rootInvQuat);
        const roll = rollAngles.get(c);
        if (roll) c.group.rotateZ(roll);
        c.group.updateMatrix();
      }

      let hovered: Object3D | null = null;
      if (held) {
        hovered = held.card.mesh;
      } else if (pointerInCanvas) {
        raycaster.setFromCamera(pointer, camera);
        const hits: Intersection[] = raycaster.intersectObjects(targets, false);
        hovered = hits.length > 0 ? hits[0].object : null;
      } else {
        const handPtr = snapshot.Right ?? snapshot.Left;
        if (handPtr) {
          raycaster.setFromCamera(
            new Vector2(handPtr.pointer.x * 2 - 1, 1 - handPtr.pointer.y * 2),
            camera,
          );
          const hits: Intersection[] = raycaster.intersectObjects(targets, false);
          hovered = hits.length > 0 ? hits[0].object : null;
        }
      }
      if (outline) outline.selectedObjects = hovered ? [hovered] : [];

      composer.render();

      if (fpsEl) {
        fpsAccum += dt;
        fpsFrames += 1;
        if (fpsAccum >= 0.5) {
          fpsDisplay = Math.round(fpsFrames / fpsAccum);
          fpsEl.textContent = `FPS ${fpsDisplay} · q=${prefs.qualityTier}`;
          fpsAccum = 0;
          fpsFrames = 0;

          // Adaptive quality: step down if FPS stays low (unless user locked).
          if (!prefs.qualityLocked && fpsDisplay > 0 && fpsDisplay < 28) {
            if (prefs.qualityTier === 'high') {
              prefs.setQualityTier('balanced');
              setPixelRatioCap(1.5);
            } else if (prefs.qualityTier === 'balanced') {
              prefs.setQualityTier('low');
              setPixelRatioCap(1.25);
            }
          }
        }
      }
    };
    tick();

    // WebGL context loss / restore
    const onContextLost = (e: Event) => {
      e.preventDefault();
    };
    const onContextRestored = () => {
      resize(
        Math.round(window.visualViewport?.width ?? window.innerWidth),
        Math.round(window.visualViewport?.height ?? window.innerHeight),
      );
    };
    canvas.addEventListener('webglcontextlost', onContextLost, false);
    canvas.addEventListener('webglcontextrestored', onContextRestored, false);

    return () => {
      cancelAnimationFrame(raf);
      fpsEl?.remove();
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('scroll', onResize);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      window.removeEventListener('pinviz-zoom', onKeyZoom);
      window.removeEventListener('pinviz-pan', onKeyPan);
      unsubFrames();
      unsubReset();
      unsubLayout();
      unsubStop();
      registerSnapshot(null);
      recognizer.reset();
      controlsBundle.dispose();
      cards.forEach((c) => c.dispose());
      bundle.dispose();
    };
  }, [photos, setSelected]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        cursor: 'grab',
        zIndex: 1,
        background: 'transparent',
        touchAction: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    />
  );
}

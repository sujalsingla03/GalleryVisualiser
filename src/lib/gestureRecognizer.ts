import { isDebugQuery } from './motion';

// ---------------------------------------------------------------------------
// [DEBUG] Watchdog reset frequency monitor (Diagnostic 3)
// Tracks how often the tracking-loss watchdog fires and logs resets-per-minute.
// Only active when ?debug=1.
// ---------------------------------------------------------------------------
class WatchdogMonitor {
  private enabled: boolean;
  private resets: number[] = [];

  constructor() {
    this.enabled = isDebugQuery();
  }

  recordReset(elapsedFramesSinceLastLandmark: number): void {
    if (!this.enabled) return;
    const now = performance.now();
    this.resets.push(now);
    // Purge entries older than 60 s
    const cutoff = now - 60_000;
    this.resets = this.resets.filter((t) => t >= cutoff);
    console.warn(
      `[DEBUG][Watchdog] FORCE-RESET fired at ${now.toFixed(0)} ms` +
        ` | frames-since-last-landmark=${elapsedFramesSinceLastLandmark}` +
        ` | resets-in-last-60s=${this.resets.length}`,
    );
  }
}

export const watchdogMonitor = new WatchdogMonitor();

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface HandData {
  landmarks: HandLandmark[];
  handedness: 'Left' | 'Right';
}

export interface HandFrame {
  hands: HandData[];
  timestamp: number;
}

const THUMB_TIP = 4;
const INDEX_TIP = 8;
const INDEX_PIP = 6;
const INDEX_MCP = 5;
const MIDDLE_TIP = 12;
const MIDDLE_PIP = 10;
const MIDDLE_MCP = 9;
const RING_TIP = 16;
const RING_PIP = 14;
const PINKY_TIP = 20;
const PINKY_PIP = 18;
const PINKY_MCP = 17;
const WRIST = 0;

/** Squared 3D distance — avoids Math.sqrt in hot pinch checks. */
function dist3Sq(a: HandLandmark, b: HandLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function dist2d(a: HandLandmark, b: HandLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function isPinching(landmarks: HandLandmark[], threshold: number): boolean {
  return dist3Sq(landmarks[THUMB_TIP], landmarks[INDEX_TIP]) < threshold * threshold;
}

export function pinchPosition(landmarks: HandLandmark[]): { x: number; y: number } {
  const t = landmarks[THUMB_TIP];
  const i = landmarks[INDEX_TIP];
  return { x: (t.x + i.x) / 2, y: (t.y + i.y) / 2 };
}

/** Where the index fingertip is pointing — used as the "cursor" for selecting photos. */
export function indexTipPosition(landmarks: HandLandmark[]): { x: number; y: number } {
  const i = landmarks[INDEX_TIP];
  return { x: i.x, y: i.y };
}

/** Continuous thumb-tip↔index-tip distance. */
export function pinchSpread(landmarks: HandLandmark[]): number {
  return dist2d(landmarks[THUMB_TIP], landmarks[INDEX_TIP]);
}

/** Thumb-tip↔middle-tip distance — a single-hand scale dial that doesn't disturb the pinch. */
export function thumbMiddleDistance(landmarks: HandLandmark[]): number {
  return dist2d(landmarks[THUMB_TIP], landmarks[MIDDLE_TIP]);
}

/**
 * Palm width (index-knuckle ↔ pinky-knuckle). Roughly invariant to finger pose,
 * so it grows as the hand approaches the camera — a cheap depth proxy for "pull closer".
 */
export function palmWidth(landmarks: HandLandmark[]): number {
  return dist2d(landmarks[INDEX_MCP], landmarks[PINKY_MCP]);
}

/** Stable hand center (middle-finger knuckle) — used for swipe + two-hand distance. */
export function handCenter(landmarks: HandLandmark[]): { x: number; y: number } {
  const c = landmarks[MIDDLE_MCP];
  return { x: c.x, y: c.y };
}

/** Hand roll angle (radians) from the knuckle line — twisting the wrist changes it. */
export function handRoll(landmarks: HandLandmark[]): number {
  const a = landmarks[INDEX_MCP];
  const b = landmarks[PINKY_MCP];
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** Count extended fingers (index, middle, ring, pinky) via tip-vs-PIP distance from the wrist. */
export function extendedFingerCount(landmarks: HandLandmark[]): number {
  const w = landmarks[WRIST];
  const pairs: [number, number][] = [
    [INDEX_TIP, INDEX_PIP],
    [MIDDLE_TIP, MIDDLE_PIP],
    [RING_TIP, RING_PIP],
    [PINKY_TIP, PINKY_PIP],
  ];
  let count = 0;
  for (const [tip, pip] of pairs) {
    if (dist2d(landmarks[tip], w) > dist2d(landmarks[pip], w)) count++;
  }
  return count;
}

export function isFist(landmarks: HandLandmark[]): boolean {
  return extendedFingerCount(landmarks) === 0;
}

export interface HandSnapshot {
  present: boolean;
  pinching: boolean;
  fist: boolean;
  pointer: { x: number; y: number };
  center: { x: number; y: number };
  spread: number;
  thumbMiddle: number;
  span: number;
  roll: number;
}

export interface FrameSnapshot {
  Left: HandSnapshot | null;
  Right: HandSnapshot | null;
}

export type GestureEvent =
  | {
      type: 'pinchStart';
      hand: 'Left' | 'Right';
      pointer: { x: number; y: number };
      spread: number;
      span: number;
      roll: number;
      thumbMiddle: number;
    }
  | {
      type: 'pinchMove';
      hand: 'Left' | 'Right';
      pointer: { x: number; y: number };
      delta: { x: number; y: number };
      spread: number;
      span: number;
      roll: number;
      thumbMiddle: number;
    }
  | { type: 'pinchEnd'; hand: 'Left' | 'Right' }
  | { type: 'twoHandMove'; distance: number; distanceDelta: number }
  | { type: 'twoHandTwist'; angleDelta: number }
  | { type: 'swipe'; hand: 'Left' | 'Right'; velocity: { x: number; y: number } }
  | { type: 'fist'; hand: 'Left' | 'Right' };

interface PinchState {
  active: boolean;
  pointer: { x: number; y: number } | null;
  /** EMA-smoothed pointer for stable grab tracking. */
  smooth: { x: number; y: number } | null;
}

/** Absolute enter/exit thresholds (normalized image space) — hysteresis kills flicker. */
const PINCH_ENTER = 0.055;
const PINCH_EXIT = 0.085;
/** Palm-relative pinch: closer hands get a looser absolute threshold. */
const PINCH_ENTER_PALM = 0.42;
const PINCH_EXIT_PALM = 0.65;
/** Ignore sub-pixel jitter in pinchMove (normalized). */
const MOVE_DEADZONE = 0.0012;
/** EMA blend for pinch pointer (higher = snappier). */
const POINTER_SMOOTH = 0.42;
/** Swipe: min speed in normalized units / second. */
const SWIPE_SPEED = 1.15;
/** Swipe cooldown after emit (ms). */
const SWIPE_COOLDOWN_MS = 280;
/** Require mostly-open hand for swipe (avoids grab/flick confusion). */
const SWIPE_MIN_FINGERS = 3;
/** Two-hand zoom/twist deadzones. */
const ZOOM_DEADZONE = 0.002;
const TWIST_DEADZONE = 0.008;

function pinchThresholds(landmarks: HandLandmark[]): { enter: number; exit: number } {
  const palm = palmWidth(landmarks);
  if (palm < 1e-4) return { enter: PINCH_ENTER, exit: PINCH_EXIT };
  return {
    enter: Math.max(PINCH_ENTER * 0.85, Math.min(PINCH_ENTER * 1.35, palm * PINCH_ENTER_PALM)),
    exit: Math.max(PINCH_EXIT * 0.85, Math.min(PINCH_EXIT * 1.4, palm * PINCH_EXIT_PALM)),
  };
}

function snapshotHand(hand: HandData, pinching: boolean): HandSnapshot {
  return {
    present: true,
    pinching,
    fist: isFist(hand.landmarks),
    pointer: indexTipPosition(hand.landmarks),
    center: handCenter(hand.landmarks),
    spread: pinchSpread(hand.landmarks),
    thumbMiddle: thumbMiddleDistance(hand.landmarks),
    span: palmWidth(hand.landmarks),
    roll: handRoll(hand.landmarks),
  };
}

function shortestAngleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export class GestureRecognizer {
  private leftPinch: PinchState = { active: false, pointer: null, smooth: null };
  private rightPinch: PinchState = { active: false, pointer: null, smooth: null };
  private twoHandZoomActive = false;
  private twoHandLastDistance = 0;
  private twoHandTwistActive = false;
  private twoHandLastAngle = 0;
  private lastCenter: Record<'Left' | 'Right', { x: number; y: number } | null> = {
    Left: null,
    Right: null,
  };
  private lastTimestamp = 0;
  private wasFist: Record<'Left' | 'Right', boolean> = { Left: false, Right: false };
  private swipeCooldownUntil = 0;
  /** Consecutive frames with zero hands while a pinch was active — forces release. */
  private emptyWhileActive = 0;

  /** Latest per-hand derived features — read this for continuous, mode-dependent control. */
  snapshot: FrameSnapshot = { Left: null, Right: null };

  /** True if either hand currently has an active pinch. */
  get hasActiveGesture(): boolean {
    return this.leftPinch.active || this.rightPinch.active;
  }

  /** Clear all gesture state (call when the camera stops). */
  reset(): void {
    this.leftPinch = { active: false, pointer: null, smooth: null };
    this.rightPinch = { active: false, pointer: null, smooth: null };
    this.twoHandZoomActive = false;
    this.twoHandLastDistance = 0;
    this.twoHandTwistActive = false;
    this.twoHandLastAngle = 0;
    this.lastCenter = { Left: null, Right: null };
    this.lastTimestamp = 0;
    this.wasFist = { Left: false, Right: false };
    this.swipeCooldownUntil = 0;
    this.emptyWhileActive = 0;
    this.snapshot = { Left: null, Right: null };
  }

  process(frame: HandFrame): GestureEvent[] {
    const events: GestureEvent[] = [];
    const dtMs = this.lastTimestamp > 0 ? Math.max(1, frame.timestamp - this.lastTimestamp) : 16.67;
    this.lastTimestamp = frame.timestamp;

    const left = frame.hands.find((h) => h.handedness === 'Left');
    const right = frame.hands.find((h) => h.handedness === 'Right');

    // ---- Tracking-loss tolerance ----
    // MediaPipe routinely drops detections for 3–8 consecutive frames during fast hand
    // motion (GPU dispatch latency, motion blur). Firing pinchEnd on the first empty frame
    // causes the held card to drop mid-drag.
    //
    // Strategy:
    // - While a pinch is active and ALL hands vanish, accumulate emptyWhileActive.
    // - For the first JITTER_TOLERANCE frames, skip processHand (suppress pinchEnd).
    //   The last known landmark positions are retained in the snapshot.
    // - After JITTER_TOLERANCE frames the hand is treated as gone: processHand fires
    //   pinchEnd through the normal path.
    // - The watchdog (WATCHDOG_THRESHOLD) is a separate backstop that clears any lingering
    //   state that processHand might have missed (e.g. partial-hand frames).
    //
    // JITTER_TOLERANCE = 4 frames ≈ 67 ms at 60 Hz — enough to bridge normal detection gaps
    //   while keeping card drop latency low for intentional releases.
    // WATCHDOG_THRESHOLD = 18 frames ≈ 300 ms at 60 Hz — belt-and-suspenders cleanup.
    const JITTER_TOLERANCE = 4;
    const WATCHDOG_THRESHOLD = 18;

    const anyActive = this.leftPinch.active || this.rightPinch.active;
    if (frame.hands.length === 0 && anyActive) {
      this.emptyWhileActive += 1;

      if (this.emptyWhileActive >= WATCHDOG_THRESHOLD) {
        // [DEBUG] Diagnostic 3 — log watchdog reset with elapsed-frames evidence
        watchdogMonitor.recordReset(this.emptyWhileActive);
        this.processHand('Left', undefined, this.leftPinch, events);
        this.processHand('Right', undefined, this.rightPinch, events);
        this.endZoom();
        this.endTwist();
        this.emptyWhileActive = 0;
        this.snapshot = { Left: null, Right: null };
        return events;
      }

      if (this.emptyWhileActive <= JITTER_TOLERANCE) {
        // Within the tolerance window: hold off pinchEnd, keep last snapshot, skip gesture
        // processing entirely for this frame. The card stays wherever it was.
        return events;
      }

      // emptyWhileActive > JITTER_TOLERANCE but < WATCHDOG_THRESHOLD:
      // treat the hand as gone — processHand will fire pinchEnd below.
    } else {
      this.emptyWhileActive = 0;
    }

    this.processHand('Left', left, this.leftPinch, events);
    this.processHand('Right', right, this.rightPinch, events);

    this.snapshot = {
      Left: left ? snapshotHand(left, this.leftPinch.active) : null,
      Right: right ? snapshotHand(right, this.rightPinch.active) : null,
    };

    this.processFist('Left', left, events);
    this.processFist('Right', right, events);

    const bothPresent = !!left && !!right;
    const neitherPinching = !this.leftPinch.active && !this.rightPinch.active;
    const bothPinching = this.leftPinch.active && this.rightPinch.active;

    if (bothPresent && neitherPinching) {
      this.endTwist();
      this.processTwoHandZoom(left, right, events);
    } else if (bothPresent && bothPinching) {
      this.endZoom();
      this.processTwoHandTwist(left, right, events);
    } else {
      this.endZoom();
      this.endTwist();
      this.processSwipe('Left', left, this.leftPinch, dtMs, frame.timestamp, events);
      this.processSwipe('Right', right, this.rightPinch, dtMs, frame.timestamp, events);
    }

    this.lastCenter.Left = left ? handCenter(left.landmarks) : null;
    this.lastCenter.Right = right ? handCenter(right.landmarks) : null;

    return events;
  }

  private processHand(
    handedness: 'Left' | 'Right',
    hand: HandData | undefined,
    state: PinchState,
    events: GestureEvent[],
  ): void {
    if (!hand) {
      if (state.active) {
        events.push({ type: 'pinchEnd', hand: handedness });
        state.active = false;
        state.pointer = null;
        state.smooth = null;
      }
      return;
    }

    const { enter, exit } = pinchThresholds(hand.landmarks);
    const spread3 = Math.sqrt(dist3Sq(hand.landmarks[THUMB_TIP], hand.landmarks[INDEX_TIP]));
    const pinching = state.active ? spread3 < exit : spread3 < enter;
    const rawPointer = pinching ? indexTipPosition(hand.landmarks) : null;

    if (pinching && !state.active) {
      state.smooth = { x: rawPointer!.x, y: rawPointer!.y };
      events.push({
        type: 'pinchStart',
        hand: handedness,
        pointer: { x: rawPointer!.x, y: rawPointer!.y },
        spread: pinchSpread(hand.landmarks),
        span: palmWidth(hand.landmarks),
        roll: handRoll(hand.landmarks),
        thumbMiddle: thumbMiddleDistance(hand.landmarks),
      });
      state.active = true;
      state.pointer = { x: rawPointer!.x, y: rawPointer!.y };
    } else if (pinching && state.active && rawPointer) {
      const s = state.smooth!;
      s.x += (rawPointer.x - s.x) * POINTER_SMOOTH;
      s.y += (rawPointer.y - s.y) * POINTER_SMOOTH;
      const last = state.pointer!;
      const dx = s.x - last.x;
      const dy = s.y - last.y;
      if (dx * dx + dy * dy >= MOVE_DEADZONE * MOVE_DEADZONE) {
        events.push({
          type: 'pinchMove',
          hand: handedness,
          pointer: { x: s.x, y: s.y },
          delta: { x: dx, y: dy },
          spread: pinchSpread(hand.landmarks),
          span: palmWidth(hand.landmarks),
          roll: handRoll(hand.landmarks),
          thumbMiddle: thumbMiddleDistance(hand.landmarks),
        });
        state.pointer = { x: s.x, y: s.y };
      }
    } else if (!pinching && state.active) {
      events.push({ type: 'pinchEnd', hand: handedness });
      state.active = false;
      state.pointer = null;
      state.smooth = null;
    }
  }

  private processFist(
    handedness: 'Left' | 'Right',
    hand: HandData | undefined,
    events: GestureEvent[],
  ): void {
    const fist = hand ? isFist(hand.landmarks) : false;
    if (fist && !this.wasFist[handedness]) {
      events.push({ type: 'fist', hand: handedness });
    }
    this.wasFist[handedness] = fist;
  }

  private processTwoHandZoom(left: HandData, right: HandData, events: GestureEvent[]): void {
    const distance = dist2d(left.landmarks[MIDDLE_MCP], right.landmarks[MIDDLE_MCP]);
    if (!this.twoHandZoomActive) {
      this.twoHandZoomActive = true;
      this.twoHandLastDistance = distance;
      return;
    }
    const distanceDelta = distance - this.twoHandLastDistance;
    if (Math.abs(distanceDelta) >= ZOOM_DEADZONE) {
      events.push({ type: 'twoHandMove', distance, distanceDelta });
      this.twoHandLastDistance = distance;
    }
  }

  private processTwoHandTwist(left: HandData, right: HandData, events: GestureEvent[]): void {
    const lc = handCenter(left.landmarks);
    const rc = handCenter(right.landmarks);
    const angle = Math.atan2(rc.y - lc.y, rc.x - lc.x);
    if (!this.twoHandTwistActive) {
      this.twoHandTwistActive = true;
      this.twoHandLastAngle = angle;
      return;
    }
    const angleDelta = shortestAngleDelta(this.twoHandLastAngle, angle);
    if (Math.abs(angleDelta) >= TWIST_DEADZONE) {
      events.push({ type: 'twoHandTwist', angleDelta });
      this.twoHandLastAngle = angle;
    }
  }

  private endZoom(): void {
    this.twoHandZoomActive = false;
  }

  private endTwist(): void {
    this.twoHandTwistActive = false;
  }

  private processSwipe(
    handedness: 'Left' | 'Right',
    hand: HandData | undefined,
    state: PinchState,
    dtMs: number,
    now: number,
    events: GestureEvent[],
  ): void {
    if (!hand || state.active || isFist(hand.landmarks)) return;
    if (extendedFingerCount(hand.landmarks) < SWIPE_MIN_FINGERS) return;
    if (now < this.swipeCooldownUntil) return;

    const last = this.lastCenter[handedness];
    if (!last) return;

    const center = handCenter(hand.landmarks);
    const vx = (center.x - last.x) / (dtMs / 1000);
    const vy = (center.y - last.y) / (dtMs / 1000);
    const speed = Math.hypot(vx, vy);
    if (speed >= SWIPE_SPEED) {
      // Emit frame-delta velocity (matches previous consumer scale expectations).
      events.push({
        type: 'swipe',
        hand: handedness,
        velocity: { x: center.x - last.x, y: center.y - last.y },
      });
      this.swipeCooldownUntil = now + SWIPE_COOLDOWN_MS;
    }
  }
}

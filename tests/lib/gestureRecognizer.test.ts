import { describe, it, expect } from 'vitest';
import {
  isPinching,
  pinchPosition,
  pinchSpread,
  palmWidth,
  handCenter,
  indexTipPosition,
  type HandLandmark,
} from '../../src/lib/gestureRecognizer';

// Build a 21-landmark hand where landmarks 4 (thumb tip) and 8 (index tip) are placed at given points.
// All other landmarks are zeroed — they don't matter for pinch detection.
function landmarksWithThumbIndex(
  thumb: { x: number; y: number; z?: number },
  index: { x: number; y: number; z?: number },
): HandLandmark[] {
  const arr: HandLandmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  arr[4] = { x: thumb.x, y: thumb.y, z: thumb.z ?? 0 };
  arr[8] = { x: index.x, y: index.y, z: index.z ?? 0 };
  return arr;
}

describe('isPinching', () => {
  it('returns true when thumb and index are within threshold', () => {
    const lm = landmarksWithThumbIndex({ x: 0.5, y: 0.5 }, { x: 0.51, y: 0.51 });
    expect(isPinching(lm, 0.05)).toBe(true);
  });

  it('returns false when thumb and index are far apart', () => {
    const lm = landmarksWithThumbIndex({ x: 0.5, y: 0.5 }, { x: 0.7, y: 0.5 });
    expect(isPinching(lm, 0.05)).toBe(false);
  });

  it('considers the z axis (3D distance, not just 2D)', () => {
    // x/y are identical but z differs → should NOT be pinching.
    const lm = landmarksWithThumbIndex({ x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0.2 });
    expect(isPinching(lm, 0.05)).toBe(false);
  });
});

describe('pinchPosition', () => {
  it('returns the midpoint of thumb and index tips', () => {
    const lm = landmarksWithThumbIndex({ x: 0.4, y: 0.6 }, { x: 0.6, y: 0.4 });
    const p = pinchPosition(lm);
    expect(p.x).toBeCloseTo(0.5);
    expect(p.y).toBeCloseTo(0.5);
  });
});

describe('pinchSpread', () => {
  it('measures the thumb-tip to index-tip distance', () => {
    const lm = landmarksWithThumbIndex({ x: 0.4, y: 0.5 }, { x: 0.7, y: 0.5 });
    expect(pinchSpread(lm)).toBeCloseTo(0.3, 5);
  });
});

describe('indexTipPosition', () => {
  it('returns the index fingertip coordinates', () => {
    const lm = landmarksWithThumbIndex({ x: 0.4, y: 0.5 }, { x: 0.7, y: 0.2 });
    const p = indexTipPosition(lm);
    expect(p.x).toBeCloseTo(0.7);
    expect(p.y).toBeCloseTo(0.2);
  });
});

describe('palmWidth / handCenter', () => {
  it('palmWidth is the index-knuckle to pinky-knuckle distance', () => {
    const arr: HandLandmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    arr[5] = { x: 0.4, y: 0.5, z: 0 }; // index MCP
    arr[17] = { x: 0.6, y: 0.5, z: 0 }; // pinky MCP
    expect(palmWidth(arr)).toBeCloseTo(0.2, 5);
  });

  it('handCenter reads the middle-finger knuckle', () => {
    const arr: HandLandmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    arr[9] = { x: 0.33, y: 0.44, z: 0 };
    const c = handCenter(arr);
    expect(c.x).toBeCloseTo(0.33);
    expect(c.y).toBeCloseTo(0.44);
  });
});

import { GestureRecognizer, type HandData, type HandFrame } from '../../src/lib/gestureRecognizer';

// A pinched hand: thumb tip (4) and index tip (8) nearly coincident, plus palm/center
// knuckles placed so palmWidth and handCenter are well-defined.
function pinchedHand(handedness: 'Left' | 'Right', x = 0.5, y = 0.5): HandData {
  const landmarks = landmarksWithThumbIndex({ x, y }, { x: x + 0.01, y: y + 0.01 });
  landmarks[5] = { x: x - 0.05, y, z: 0 };
  landmarks[9] = { x, y, z: 0 };
  landmarks[17] = { x: x + 0.05, y, z: 0 };
  return { landmarks, handedness };
}

function openHand(handedness: 'Left' | 'Right', x = 0.5, y = 0.5): HandData {
  const landmarks = landmarksWithThumbIndex({ x, y }, { x: x + 0.2, y });
  landmarks[0] = { x, y: y + 0.25, z: 0 }; // wrist
  landmarks[5] = { x: x - 0.05, y, z: 0 };
  landmarks[9] = { x, y, z: 0 };
  landmarks[17] = { x: x + 0.05, y, z: 0 };
  // Extended fingers: tips farther from wrist than PIPs.
  for (const [tip, pip, ox] of [
    [8, 6, 0.2],
    [12, 10, 0.18],
    [16, 14, 0.16],
    [20, 18, 0.14],
  ] as const) {
    landmarks[pip] = { x: x + ox * 0.4, y: y - 0.05, z: 0 };
    landmarks[tip] = { x: x + ox, y: y - 0.18, z: 0 };
  }
  return { landmarks, handedness };
}

function frame(hands: HandData[], timestamp = 0): HandFrame {
  return { hands, timestamp };
}

describe('GestureRecognizer — single-hand pinch state machine', () => {
  it('emits no events when no hands present', () => {
    const r = new GestureRecognizer();
    expect(r.process(frame([]))).toEqual([]);
  });

  it('emits no events for a slowly-held open hand', () => {
    const r = new GestureRecognizer();
    // First frame establishes the center; second frame stays put → no swipe.
    r.process(frame([openHand('Right')]));
    expect(r.process(frame([openHand('Right')], 16))).toEqual([]);
  });

  it('emits pinchStart with index-tip pointer on transition from open to pinch', () => {
    const r = new GestureRecognizer();
    r.process(frame([openHand('Right')]));
    const events = r.process(frame([pinchedHand('Right', 0.4, 0.6)], 16));
    const start = events.find((e) => e.type === 'pinchStart');
    expect(start).toBeDefined();
    if (start && start.type === 'pinchStart') {
      expect(start.hand).toBe('Right');
      // pointer is the index tip (x+0.01, y+0.01)
      expect(start.pointer.x).toBeCloseTo(0.41, 2);
      expect(start.pointer.y).toBeCloseTo(0.61, 2);
      expect(start.spread).toBeGreaterThan(0);
      expect(start.span).toBeGreaterThan(0);
    }
  });

  it('emits pinchMove with delta on subsequent pinch frames', () => {
    const r = new GestureRecognizer();
    r.process(frame([pinchedHand('Right', 0.5, 0.5)]));
    const events = r.process(frame([pinchedHand('Right', 0.6, 0.5)], 16));
    const move = events.find((e) => e.type === 'pinchMove');
    expect(move).toBeDefined();
    if (move && move.type === 'pinchMove') {
      expect(move.hand).toBe('Right');
      // Pointer is EMA-smoothed — expect a positive step toward the new position.
      expect(move.delta.x).toBeGreaterThan(0.02);
      expect(Math.abs(move.delta.y)).toBeLessThan(0.02);
    }
  });

  it('emits pinchEnd when a pinching hand opens', () => {
    const r = new GestureRecognizer();
    r.process(frame([pinchedHand('Right')]));
    const events = r.process(frame([openHand('Right')], 16));
    expect(events.some((e) => e.type === 'pinchEnd' && e.hand === 'Right')).toBe(true);
  });

  it('emits pinchEnd when a pinching hand disappears (after jitter-tolerance window)', () => {
    const r = new GestureRecognizer();
    r.process(frame([pinchedHand('Right')]));
    // JITTER_TOLERANCE = 4: the first 4 empty frames are suppressed to ride out normal
    // MediaPipe detection drops. pinchEnd fires on frame 5 (first frame past tolerance).
    // Collect all events across multiple frames and look for pinchEnd in any of them.
    const allEvents: ReturnType<typeof r.process>[number][] = [];
    for (let i = 1; i <= 10; i++) {
      allEvents.push(...r.process(frame([], i * 16)));
    }
    expect(allEvents.some((e) => e.type === 'pinchEnd' && e.hand === 'Right')).toBe(true);
    expect(r.hasActiveGesture).toBe(false);
  });

  it('tracks left and right hands independently', () => {
    const r = new GestureRecognizer();
    r.process(frame([pinchedHand('Left'), openHand('Right')]));
    const events = r.process(frame([pinchedHand('Left'), pinchedHand('Right')], 16));
    expect(events.some((e) => e.type === 'pinchStart' && e.hand === 'Right')).toBe(true);
    expect(events.some((e) => e.type === 'pinchStart' && e.hand === 'Left')).toBe(false);
  });
});

describe('GestureRecognizer — two-hand zoom', () => {
  it('does not emit twoHandMove on the first both-hands frame (establishes baseline)', () => {
    const r = new GestureRecognizer();
    const events = r.process(frame([openHand('Left', 0.3, 0.5), openHand('Right', 0.7, 0.5)]));
    expect(events.some((e) => e.type === 'twoHandMove')).toBe(false);
  });

  it('emits positive distanceDelta when open hands move apart', () => {
    const r = new GestureRecognizer();
    r.process(frame([openHand('Left', 0.4, 0.5), openHand('Right', 0.6, 0.5)]));
    const events = r.process(frame([openHand('Left', 0.3, 0.5), openHand('Right', 0.7, 0.5)], 16));
    const move = events.find((e) => e.type === 'twoHandMove');
    expect(move).toBeDefined();
    if (move && move.type === 'twoHandMove') {
      expect(move.distanceDelta).toBeGreaterThan(0);
    }
  });

  it('emits negative distanceDelta when open hands move together', () => {
    const r = new GestureRecognizer();
    r.process(frame([openHand('Left', 0.3, 0.5), openHand('Right', 0.7, 0.5)]));
    const events = r.process(frame([openHand('Left', 0.4, 0.5), openHand('Right', 0.6, 0.5)], 16));
    const move = events.find((e) => e.type === 'twoHandMove');
    expect(move).toBeDefined();
    if (move && move.type === 'twoHandMove') {
      expect(move.distanceDelta).toBeLessThan(0);
    }
  });

  it('does not zoom while a hand is pinching (that is a grab, not a zoom)', () => {
    const r = new GestureRecognizer();
    r.process(frame([pinchedHand('Left', 0.3, 0.5), openHand('Right', 0.7, 0.5)]));
    const events = r.process(frame([pinchedHand('Left', 0.4, 0.5), openHand('Right', 0.6, 0.5)], 16));
    expect(events.some((e) => e.type === 'twoHandMove')).toBe(false);
  });
});

describe('GestureRecognizer — swipe', () => {
  it('emits a swipe when a single open hand moves fast', () => {
    const r = new GestureRecognizer();
    r.process(frame([openHand('Right', 0.3, 0.5)]));
    const events = r.process(frame([openHand('Right', 0.6, 0.5)], 16));
    const swipe = events.find((e) => e.type === 'swipe');
    expect(swipe).toBeDefined();
    if (swipe && swipe.type === 'swipe') {
      expect(swipe.velocity.x).toBeCloseTo(0.3, 2);
      expect(swipe.velocity.y).toBeCloseTo(0, 2);
    }
  });

  it('does not emit a swipe for small movements', () => {
    const r = new GestureRecognizer();
    r.process(frame([openHand('Right', 0.5, 0.5)]));
    const events = r.process(frame([openHand('Right', 0.51, 0.5)], 16));
    expect(events.some((e) => e.type === 'swipe')).toBe(false);
  });

  it('does not emit a swipe while pinching', () => {
    const r = new GestureRecognizer();
    r.process(frame([pinchedHand('Right', 0.3, 0.5)]));
    const events = r.process(frame([pinchedHand('Right', 0.6, 0.5)], 16));
    expect(events.some((e) => e.type === 'swipe')).toBe(false);
  });
});

// A fist: all four fingertips curled toward the wrist (tips closer to the wrist than the PIPs).
function fistHand(handedness: 'Left' | 'Right', x = 0.5, y = 0.5): HandData {
  const arr: HandLandmark[] = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
  arr[0] = { x, y: y + 0.2, z: 0 }; // wrist below the hand
  // PIPs sit farther from the wrist; tips curl back closer to the wrist.
  for (const [tip, pip] of [
    [8, 6],
    [12, 10],
    [16, 14],
    [20, 18],
  ]) {
    arr[pip] = { x, y: y - 0.1, z: 0 };
    arr[tip] = { x, y: y + 0.05, z: 0 };
  }
  return { landmarks: arr, handedness };
}

describe('GestureRecognizer — fist (brake)', () => {
  it('emits a fist event on the transition into a fist', () => {
    const r = new GestureRecognizer();
    r.process(frame([openHand('Right')]));
    const events = r.process(frame([fistHand('Right')], 16));
    expect(events.some((e) => e.type === 'fist' && e.hand === 'Right')).toBe(true);
  });

  it('does not re-emit fist while the fist is held', () => {
    const r = new GestureRecognizer();
    r.process(frame([fistHand('Right')]));
    const events = r.process(frame([fistHand('Right')], 16));
    expect(events.some((e) => e.type === 'fist')).toBe(false);
  });
});

describe('GestureRecognizer — two-hand twist', () => {
  it('emits twoHandTwist when both pinched hands rotate', () => {
    const r = new GestureRecognizer();
    // Baseline frame: left low, right high (line tilted).
    r.process(frame([pinchedHand('Left', 0.4, 0.4), pinchedHand('Right', 0.6, 0.6)]));
    // Rotate the pair.
    const events = r.process(frame([pinchedHand('Left', 0.4, 0.6), pinchedHand('Right', 0.6, 0.4)], 16));
    const twist = events.find((e) => e.type === 'twoHandTwist');
    expect(twist).toBeDefined();
    if (twist && twist.type === 'twoHandTwist') {
      expect(Math.abs(twist.angleDelta)).toBeGreaterThan(0);
    }
  });
});

describe('GestureRecognizer — snapshot', () => {
  it('exposes per-hand derived features for the current frame', () => {
    const r = new GestureRecognizer();
    r.process(frame([pinchedHand('Right', 0.5, 0.5)]));
    expect(r.snapshot.Right).not.toBeNull();
    expect(r.snapshot.Left).toBeNull();
    expect(r.snapshot.Right!.pinching).toBe(true);
    expect(r.snapshot.Right!.present).toBe(true);
  });
});

describe('GestureRecognizer — hysteresis + reset', () => {
  it('keeps pinch active through small open jitter (exit hysteresis)', () => {
    const r = new GestureRecognizer();
    r.process(frame([pinchedHand('Right', 0.5, 0.5)]));
    // Slightly open but still under exit threshold (~0.085).
    const soft = landmarksWithThumbIndex({ x: 0.5, y: 0.5 }, { x: 0.57, y: 0.5 });
    soft[5] = { x: 0.45, y: 0.5, z: 0 };
    soft[9] = { x: 0.5, y: 0.5, z: 0 };
    soft[17] = { x: 0.55, y: 0.5, z: 0 };
    const events = r.process(frame([{ landmarks: soft, handedness: 'Right' }], 16));
    expect(events.some((e) => e.type === 'pinchEnd')).toBe(false);
    expect(r.snapshot.Right!.pinching).toBe(true);
  });

  it('reset() clears active pinch state', () => {
    const r = new GestureRecognizer();
    r.process(frame([pinchedHand('Right')]));
    expect(r.snapshot.Right!.pinching).toBe(true);
    r.reset();
    expect(r.snapshot.Right).toBeNull();
    const events = r.process(frame([pinchedHand('Right')], 32));
    expect(events.some((e) => e.type === 'pinchStart')).toBe(true);
  });
});

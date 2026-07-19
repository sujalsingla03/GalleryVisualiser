import { describe, it, expect } from 'vitest';
import { GestureRecognizer, type HandData, type HandFrame, type HandLandmark } from '../../src/lib/gestureRecognizer';

function landmarksWithThumbIndex(
  thumb: { x: number; y: number; z?: number },
  index: { x: number; y: number; z?: number },
): HandLandmark[] {
  const arr: HandLandmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  arr[4] = { x: thumb.x, y: thumb.y, z: thumb.z ?? 0 };
  arr[8] = { x: index.x, y: index.y, z: index.z ?? 0 };
  return arr;
}

function pinchedHand(handedness: 'Left' | 'Right', x = 0.5, y = 0.5): HandData {
  const landmarks = landmarksWithThumbIndex({ x, y }, { x: x + 0.01, y: y + 0.01 });
  landmarks[5] = { x: x - 0.05, y, z: 0 };
  landmarks[9] = { x, y, z: 0 };
  landmarks[17] = { x: x + 0.05, y, z: 0 };
  return { landmarks, handedness };
}

function frame(hands: HandData[], timestamp = 0): HandFrame {
  return { hands, timestamp };
}

describe('GestureRecognizer — tracking loss watchdog', () => {
  it('force-ends pinch after several empty frames while active', () => {
    const r = new GestureRecognizer();
    r.process(frame([pinchedHand('Right')]));
    expect(r.hasActiveGesture).toBe(true);

    let ended = false;
    for (let i = 1; i <= 10; i++) {
      const events = r.process(frame([], i * 16));
      if (events.some((e) => e.type === 'pinchEnd')) {
        ended = true;
        break;
      }
    }
    expect(ended).toBe(true);
    expect(r.hasActiveGesture).toBe(false);
  });
});

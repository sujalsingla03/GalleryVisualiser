import { describe, it, expect } from 'vitest';
import { decayVelocity, decayVelocity2, approach, VELOCITY_EPS } from '../../src/lib/motion';

describe('decayVelocity', () => {
  it('reaches exactly zero within a bounded number of frames at 60Hz', () => {
    let v = 0.12;
    const friction = 0.95;
    const dt = 1 / 60;
    let frames = 0;
    const maxFrames = 500;
    while (Math.abs(v) > 0 && frames < maxFrames) {
      v = decayVelocity(v, friction, dt);
      frames += 1;
    }
    expect(v).toBe(0);
    expect(frames).toBeLessThan(maxFrames);
    expect(frames).toBeGreaterThan(10);
  });

  it('reaches zero at 120Hz as well (dt-scaled friction)', () => {
    let v = 0.12;
    const friction = 0.95;
    const dt = 1 / 120;
    let frames = 0;
    while (Math.abs(v) > 0 && frames < 1000) {
      v = decayVelocity(v, friction, dt);
      frames += 1;
    }
    expect(v).toBe(0);
  });

  it('snaps tiny values to zero immediately', () => {
    expect(decayVelocity(VELOCITY_EPS / 2, 0.95, 1 / 60)).toBe(0);
  });
});

describe('decayVelocity2', () => {
  it('zeros both axes and reports rest', () => {
    const vel = { x: 0.08, y: -0.05 };
    let rested = false;
    for (let i = 0; i < 500; i++) {
      rested = decayVelocity2(vel, 0.95, 1 / 60);
      if (rested) break;
    }
    expect(rested).toBe(true);
    expect(vel.x).toBe(0);
    expect(vel.y).toBe(0);
  });
});

describe('approach', () => {
  it('snaps to the target instead of perpetual sub-pixel lerp', () => {
    let x = 0;
    const target = 10;
    for (let i = 0; i < 200; i++) {
      x = approach(x, target, 0.18);
    }
    expect(x).toBe(target);
  });
});

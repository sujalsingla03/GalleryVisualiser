import { describe, it, expect } from 'vitest';
import { computeLayout } from '../../src/lib/computeLayout';

describe('computeLayout', () => {
  it('returns an empty array for zero photos', () => {
    expect(computeLayout(0)).toEqual([]);
  });

  it('returns N slots for N photos', () => {
    const result = computeLayout(7);
    expect(result).toHaveLength(7);
  });

  it('every slot has a finite position and a scale', () => {
    const result = computeLayout(5);
    for (const s of result) {
      expect(Number.isFinite(s.position.x)).toBe(true);
      expect(Number.isFinite(s.position.y)).toBe(true);
      expect(Number.isFinite(s.position.z)).toBe(true);
      expect(typeof s.scale).toBe('number');
    }
  });

  it('scale values stay within [scaleMin, scaleMax]', () => {
    const result = computeLayout(200, { scaleMin: 0.5, scaleMax: 1.5 });
    for (const s of result) {
      expect(s.scale).toBeGreaterThanOrEqual(0.5);
      expect(s.scale).toBeLessThanOrEqual(1.5);
    }
  });

  it('produces a roughly centered scatter (mean near 0 for x, y, z)', () => {
    const result = computeLayout(2000, { spread: 1, depthRatio: 0.5, minXyDistance: 0 });
    const meanX = result.reduce((acc, s) => acc + s.position.x, 0) / result.length;
    const meanY = result.reduce((acc, s) => acc + s.position.y, 0) / result.length;
    const meanZ = result.reduce((acc, s) => acc + s.position.z, 0) / result.length;
    expect(Math.abs(meanX)).toBeLessThan(0.15);
    expect(Math.abs(meanY)).toBeLessThan(0.15);
    expect(Math.abs(meanZ)).toBeLessThan(0.15);
  });

  it('depthRatio scales the z stddev relative to xy', () => {
    const result = computeLayout(4000, { spread: 2, depthRatio: 0.5, minXyDistance: 0 });
    const stddev = (xs: number[]) => {
      const mean = xs.reduce((a, x) => a + x, 0) / xs.length;
      return Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length);
    };
    const sx = stddev(result.map((s) => s.position.x));
    const sz = stddev(result.map((s) => s.position.z));
    expect(sx).toBeGreaterThan(1.7);
    expect(sx).toBeLessThan(2.3);
    expect(sz).toBeGreaterThan(0.85);
    expect(sz).toBeLessThan(1.15);
  });

  it('respects minXyDistance when feasible (low density layout)', () => {
    // Sparse: spread 5, only 20 photos, plenty of room for min distance 1.5.
    const min = 1.5;
    const result = computeLayout(20, { spread: 5, minXyDistance: min, maxPlacementAttempts: 200 });
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const dx = result[i].position.x - result[j].position.x;
        const dy = result[i].position.y - result[j].position.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        expect(d).toBeGreaterThanOrEqual(min - 1e-9);
      }
    }
  });

  it('is deterministic with a seeded rng', () => {
    const makeSeededRng = () => {
      let s = 0;
      return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
    };
    const a = computeLayout(20, { spread: 2 }, makeSeededRng());
    const b = computeLayout(20, { spread: 2 }, makeSeededRng());
    expect(a).toEqual(b);
  });
});

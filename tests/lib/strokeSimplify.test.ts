import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import {
  douglasPeucker,
  decimateStride,
  enforcePointCap,
  MAX_RAW_POINTS,
} from '../../src/lib/strokeSimplify';

// ---- helpers ---------------------------------------------------------------

function pt(x: number, y = 0, z = 0): Vector3 {
  return new Vector3(x, y, z);
}

/** Build a perfectly collinear line of n points from x=0 to x=1. */
function collinear(n: number): Vector3[] {
  return Array.from({ length: n }, (_, i) => pt(i / (n - 1)));
}

/** Build a zigzag: points alternate above and below the x-axis by `amp`. */
function zigzag(n: number, amp = 0.1): Vector3[] {
  return Array.from({ length: n }, (_, i) =>
    pt(i / (n - 1), i % 2 === 0 ? 0 : amp),
  );
}

// ---- douglasPeucker --------------------------------------------------------

describe('douglasPeucker', () => {
  it('returns both endpoints unchanged for a 2-point input', () => {
    const pts = [pt(0), pt(1)];
    const result = douglasPeucker(pts, 0.01);
    expect(result).toHaveLength(2);
    expect(result[0].x).toBeCloseTo(0);
    expect(result[1].x).toBeCloseTo(1);
  });

  it('collapses a perfectly collinear stroke to 2 points', () => {
    const result = douglasPeucker(collinear(50), 0.001);
    expect(result).toHaveLength(2);
  });

  it('preserves all points of a zigzag that exceeds epsilon', () => {
    // zigzag amplitude 0.1, epsilon 0.01 → every peak exceeds threshold → all kept.
    const zz = zigzag(9, 0.1);
    const result = douglasPeucker(zz, 0.01);
    // All 9 points survive because every off-axis deviation > 0.01.
    expect(result.length).toBe(zz.length);
  });

  it('collapses a low-amplitude zigzag below epsilon', () => {
    // amplitude 0.001 < epsilon 0.01 → all middle points removed.
    const zz = zigzag(9, 0.001);
    const result = douglasPeucker(zz, 0.01);
    expect(result).toHaveLength(2);
  });

  it('does not mutate the input array', () => {
    const pts = collinear(10);
    const copy = pts.map((p) => p.clone());
    douglasPeucker(pts, 0.01);
    pts.forEach((p, i) => {
      expect(p.x).toBeCloseTo(copy[i].x);
    });
  });

  it('always includes first and last points', () => {
    const pts = collinear(20);
    const result = douglasPeucker(pts, 0.5);
    expect(result[0].x).toBeCloseTo(0);
    expect(result[result.length - 1].x).toBeCloseTo(1);
  });
});

// ---- decimateStride --------------------------------------------------------

describe('decimateStride', () => {
  it('returns a copy unchanged for ≤2 points', () => {
    expect(decimateStride([pt(0), pt(1)])).toHaveLength(2);
    expect(decimateStride([pt(0)])).toHaveLength(1);
  });

  it('roughly halves the point count', () => {
    const pts = collinear(100);
    const result = decimateStride(pts);
    // Keeps every even index + first + last, so count ≈ 51
    expect(result.length).toBeLessThan(pts.length);
    expect(result.length).toBeGreaterThanOrEqual(Math.floor(pts.length / 2));
  });

  it('always preserves first and last point', () => {
    const pts = collinear(20);
    const result = decimateStride(pts);
    expect(result[0].x).toBeCloseTo(pts[0].x);
    expect(result[result.length - 1].x).toBeCloseTo(pts[pts.length - 1].x);
  });
});

// ---- enforcePointCap -------------------------------------------------------

describe('enforcePointCap', () => {
  it('returns the same array reference when under the cap', () => {
    const pts = collinear(10);
    const result = enforcePointCap(pts);
    expect(result).toBe(pts); // same reference — no copy needed
  });

  it('returns a shorter array when over the cap', () => {
    const pts = collinear(MAX_RAW_POINTS + 10);
    const result = enforcePointCap(pts);
    expect(result.length).toBeLessThan(pts.length);
    expect(result.length).toBeLessThanOrEqual(MAX_RAW_POINTS);
  });

  it('new array preserves first and last point after cap enforcement', () => {
    const pts = collinear(MAX_RAW_POINTS + 50);
    const result = enforcePointCap(pts);
    expect(result[0].x).toBeCloseTo(pts[0].x);
    expect(result[result.length - 1].x).toBeCloseTo(pts[pts.length - 1].x);
  });
});

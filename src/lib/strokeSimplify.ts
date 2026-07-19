/**
 * Stroke point simplification utilities.
 *
 * Two complementary strategies keep stroke geometry bounded:
 *
 * 1. Douglas-Peucker decimation — applied when a stroke is *finalized* (drawEnd).
 *    Removes redundant collinear points while preserving visual shape.
 *    Runs in O(n log n) average, acceptable for strokes of a few hundred points.
 *
 * 2. Hard point cap — enforced *during* drawing (every drawMove call).
 *    Once MAX_RAW_POINTS is reached, every other point is decimated in a single
 *    O(n) pass so geometry never grows unbounded mid-stroke.
 */

import { Vector3 } from 'three';

/** Maximum raw points allowed in a live (in-progress) stroke before mid-stroke decimation. */
export const MAX_RAW_POINTS = 400;

/** Perpendicular distance from point `p` to the line segment [a, b] in 3D. */
function perpendicularDistance(p: Vector3, a: Vector3, b: Vector3): number {
  const ab = new Vector3().subVectors(b, a);
  const ap = new Vector3().subVectors(p, a);
  const abLenSq = ab.lengthSq();
  if (abLenSq < 1e-12) return ap.length();
  const t = Math.max(0, Math.min(1, ap.dot(ab) / abLenSq));
  const closest = new Vector3().copy(a).addScaledVector(ab, t);
  return p.distanceTo(closest);
}

/**
 * Douglas-Peucker simplification on a Vector3 array.
 *
 * @param points  Input point array (not mutated).
 * @param epsilon Tolerance in scene units. Points within this perpendicular
 *                distance of the simplified line are removed.
 *                Recommended: ~0.02–0.05 for the default drawing-plane distance.
 * @returns       Simplified point array (new array, shares Vector3 references).
 */
export function douglasPeucker(points: readonly Vector3[], epsilon: number): Vector3[] {
  if (points.length <= 2) return [...points];

  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIdx), epsilon);
    // Merge: left ends at maxIdx, right starts at maxIdx — drop the duplicate.
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

/**
 * Mid-stroke decimation: called when a live stroke exceeds MAX_RAW_POINTS.
 * Keeps every other point (O(n), non-recursive) and returns a new array.
 * Preserves first and last point for continuity.
 */
export function decimateStride(points: readonly Vector3[]): Vector3[] {
  if (points.length <= 2) return [...points];
  const result: Vector3[] = [];
  for (let i = 0; i < points.length; i++) {
    if (i === 0 || i === points.length - 1 || i % 2 === 0) {
      result.push(points[i]);
    }
  }
  return result;
}

/**
 * Enforce the raw-point cap on a live stroke.
 * Call this after appending each new point during drawMove.
 * Returns the same array (possibly replaced with a decimated copy).
 */
export function enforcePointCap(points: Vector3[]): Vector3[] {
  if (points.length > MAX_RAW_POINTS) {
    return decimateStride(points);
  }
  return points;
}

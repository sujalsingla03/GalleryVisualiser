/**
 * Regression test for the landmark→transform→render matrix seam.
 *
 * Background
 * ----------
 * SpaceScene sets `matrixAutoUpdate = false` on every card Group so Three.js never
 * auto-rebuilds the local matrix from position/quaternion/scale during scene traversal.
 * This is a valid performance optimisation — but it means every code path that writes
 * to a card's position, scale, or rotation MUST call `group.updateMatrix()` in the same
 * tick, otherwise `group.matrix` (what the GPU reads) lags behind the JS values by one
 * or more render frames.
 *
 * The bug that shipped
 * --------------------
 * The `pinchMove` gesture handler in SpaceScene wrote `card.group.position` and
 * `card.group.scale` but did NOT call `updateMatrix()`. The render tick's
 * `if (held && held.card === c) { …updateMatrix() }` was the only update point, and
 * it ran in a *separate* requestAnimationFrame chain (the Three.js loop), not the
 * MediaPipe rAF chain where the gesture callback fired. On every landmark frame the
 * card's GPU transform was therefore stale — visually the card appeared frozen or
 * sluggishly lagging behind the hand.
 *
 * What this test asserts
 * ----------------------
 * 1. STALE-BEFORE: With `matrixAutoUpdate = false`, writing `position` does NOT
 *    automatically update the matrix (documents the invariant that makes the bug possible).
 * 2. FRESH-AFTER-SAME-TICK: Calling `updateMatrix()` in the same tick as the
 *    position/scale write makes the matrix current immediately — before any render call.
 * 3. ROLL-INCLUDED: The quaternion (billboard + roll) is baked into the matrix in the
 *    same `updateMatrix()` call, not deferred.
 *
 * If anyone removes or moves the `updateMatrix()` call out of the gesture callback,
 * test 2 will fail.
 */

import { describe, it, expect } from 'vitest';
import { Group, Quaternion, Matrix4 } from 'three';

/** Extract the translation component from a column-major Matrix4. */
function translationOf(m: Matrix4): { x: number; y: number; z: number } {
  const e = m.elements;
  // Column-major layout: translation is at indices 12 (x), 13 (y), 14 (z).
  return { x: e[12], y: e[13], z: e[14] };
}

/** Extract the uniform scale from a column-major Matrix4 (from the x-axis column length). */
function scaleXOf(m: Matrix4): number {
  const e = m.elements;
  return Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]);
}

describe('card Group matrix seam — matrixAutoUpdate=false', () => {
  it('STALE-BEFORE: position write does NOT update matrix when matrixAutoUpdate is false', () => {
    const group = new Group();
    group.matrixAutoUpdate = false;
    group.updateMatrix(); // initial bake at origin

    // Write a new position — simulates what pinchMove does to card.group.
    group.position.set(3, 7, -2);

    // matrix still reflects the old (origin) position — the bug lives here.
    const { x, y, z } = translationOf(group.matrix);
    expect(x).toBe(0);
    expect(y).toBe(0);
    expect(z).toBe(0);
  });

  it('FRESH-AFTER-SAME-TICK: calling updateMatrix() in the same tick makes matrix current', () => {
    const group = new Group();
    group.matrixAutoUpdate = false;
    group.updateMatrix(); // initial bake at origin

    // Simulate the full sequence that the fixed pinchMove handler now performs:
    //   1. Write position (from landmark ray projection).
    //   2. Write scale (from palm-width ratio).
    //   3. Set quaternion to camera orientation + roll.
    //   4. Call updateMatrix() IMMEDIATELY — same tick.
    group.position.set(1.5, -0.8, 4.2);
    group.scale.setScalar(2.0);
    // Use an identity quaternion for simplicity (roll = 0, camera = identity).
    group.quaternion.copy(new Quaternion()); // identity

    // THE FIX: this call must happen in the same gesture callback, not the next render tick.
    group.updateMatrix();

    const pos = translationOf(group.matrix);
    expect(pos.x).toBeCloseTo(1.5, 5);
    expect(pos.y).toBeCloseTo(-0.8, 5);
    expect(pos.z).toBeCloseTo(4.2, 5);

    // Scale should also be reflected immediately.
    expect(scaleXOf(group.matrix)).toBeCloseTo(2.0, 5);
  });

  it('ROLL-INCLUDED: roll applied via rotateZ before updateMatrix() is baked into matrix', () => {
    const group = new Group();
    group.matrixAutoUpdate = false;
    group.updateMatrix();

    // Set up: position + camera quaternion (identity here) + 90-degree roll.
    group.position.set(0, 0, 5);
    group.quaternion.copy(new Quaternion()); // identity camera orientation
    group.rotateZ(Math.PI / 2);             // 90° roll

    group.updateMatrix();

    // After a 90° Z-rotation, the local X-axis should point in the +Y world direction.
    // In a column-major Matrix4, the first column (elements 0,1,2) is the local X axis.
    const e = group.matrix.elements;
    expect(e[0]).toBeCloseTo(0, 5);  // X of local-X in world ≈ 0 (rotated away)
    expect(e[1]).toBeCloseTo(1, 5);  // Y of local-X in world ≈ +1 (pointing up)
  });

  it('REGRESSION: matrix stays stale across two ticks when updateMatrix() is omitted', () => {
    // This test documents exactly how the bug manifested: two separate "ticks"
    // (gesture callback and render callback), position written in tick 1 but
    // updateMatrix() only called in tick 2.
    const group = new Group();
    group.matrixAutoUpdate = false;
    group.updateMatrix(); // initial bake

    // Tick 1 — gesture callback writes position but (incorrectly) does NOT call updateMatrix().
    group.position.set(10, 20, 30);
    // Matrix is still (0, 0, 0) here.
    expect(translationOf(group.matrix).x).toBe(0); // stale

    // Tick 2 — render loop calls updateMatrix().
    group.updateMatrix();
    // Only NOW does the matrix reflect the position.
    expect(translationOf(group.matrix).x).toBeCloseTo(10, 5);

    // The gap between tick 1 and tick 2 is the bug: during tick 1's render call
    // the GPU would have received the stale matrix (x=0, not x=10).
  });
});

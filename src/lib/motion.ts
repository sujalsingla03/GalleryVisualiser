/** Shared motion helpers — delta-time friction + snap-to-rest. */

export const VELOCITY_EPS = 1e-5;
export const POSITION_EPS = 1e-4;
export const DISTANCE_EPS = 1e-4;

/**
 * Apply per-frame friction scaled to elapsed time so 60Hz and 120Hz behave alike.
 * `frictionPerFrame60` is the legacy per-frame factor at 60fps (e.g. 0.95).
 * Returns the new velocity; snaps to exactly 0 below VELOCITY_EPS.
 */
export function decayVelocity(
  velocity: number,
  frictionPerFrame60: number,
  deltaSeconds: number,
  eps: number = VELOCITY_EPS,
): number {
  if (Math.abs(velocity) < eps) return 0;
  const dt = Math.max(0, Math.min(deltaSeconds, 0.1)); // clamp huge stalls
  const next = velocity * Math.pow(frictionPerFrame60, dt * 60);
  return Math.abs(next) < eps ? 0 : next;
}

/** Mutates a 2D velocity object in place; returns whether both axes are now zero. */
export function decayVelocity2(
  vel: { x: number; y: number },
  frictionPerFrame60: number,
  deltaSeconds: number,
  eps: number = VELOCITY_EPS,
): boolean {
  vel.x = decayVelocity(vel.x, frictionPerFrame60, deltaSeconds, eps);
  vel.y = decayVelocity(vel.y, frictionPerFrame60, deltaSeconds, eps);
  return vel.x === 0 && vel.y === 0;
}

/**
 * Exponential approach of `current` toward `target`.
 * Snaps exactly to target when within `eps` so motion fully stops.
 */
export function approach(
  current: number,
  target: number,
  alpha: number,
  eps: number = POSITION_EPS,
): number {
  const next = current + (target - current) * alpha;
  return Math.abs(next - target) < eps ? target : next;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function isDebugQuery(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('debug') === '1';
  } catch {
    return false;
  }
}

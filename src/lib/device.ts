/** Lightweight device/capability helpers for mobile-aware defaults. */

export function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

export function isNarrowViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches;
}

export function preferLowPowerMedia(): boolean {
  if (typeof window === 'undefined') return false;
  if (isCoarsePointer() || isNarrowViewport()) return true;
  const cores = navigator.hardwareConcurrency ?? 4;
  return cores <= 4;
}

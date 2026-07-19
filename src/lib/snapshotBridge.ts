/** Module bridge so HUD can trigger a WebGL snapshot without prop-drilling. */
type SnapshotFn = () => void;

let snapshotFn: SnapshotFn | null = null;

export function registerSnapshot(fn: SnapshotFn | null): void {
  snapshotFn = fn;
}

export function requestSnapshot(): boolean {
  if (!snapshotFn) return false;
  snapshotFn();
  return true;
}

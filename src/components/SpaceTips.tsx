import { FrostPanel } from './ui/FrostPanel';
import { useSpacePrefsStore } from '../store/spacePrefsStore';
import { isCoarsePointer } from '../lib/device';

export function SpaceTips() {
  const visible = useSpacePrefsStore((s) => s.tipsVisible);
  const dismissTips = useSpacePrefsStore((s) => s.dismissTips);

  if (!visible) return null;

  const mobile = typeof window !== 'undefined' && isCoarsePointer();

  return (
    <div className="space-tips">
      <FrostPanel className="space-tips-panel">
        <div className="space-tips-title">How to explore</div>
        <ul className="space-tips-list">
          {mobile ? (
            <>
              <li>Drag with one finger to spin the gallery</li>
              <li>Pinch with two fingers to zoom</li>
              <li>Tap a photo to open it full-screen</li>
              <li>Use Orbit / Cloud / Mix for auto visuals</li>
              <li>Optional: Hands for AR camera gestures</li>
            </>
          ) : (
            <>
              <li>Drag to pan · scroll / pinch to zoom</li>
              <li>Click a photo to open it</li>
              <li>Orbit keeps the space turning automatically</li>
              <li>Cycle layouts: Cloud → Grid → Spiral → Wall</li>
              <li>Hands enables webcam AR + gesture control</li>
            </>
          )}
        </ul>
        <button type="button" className="space-tips-ok" onClick={dismissTips}>
          Got it
        </button>
      </FrostPanel>
    </div>
  );
}

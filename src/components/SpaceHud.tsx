import { useCallback, useEffect, useState } from 'react';
import { FrostPanel } from './ui/FrostPanel';
import { useViewStore } from '../store/viewStore';
import { usePhotoStore } from '../store/photoStore';
import { useHandStore } from '../store/handStore';
import { useSpacePrefsStore } from '../store/spacePrefsStore';
import { LAYOUT_MODE_LABELS } from '../lib/computeLayout';
import { requestSnapshot } from '../lib/snapshotBridge';
import { saveSpaceSession, clearSpaceSession } from '../lib/sessionStore';

export function SpaceHud() {
  const setView = useViewStore((s) => s.setView);
  const triggerReset = useViewStore((s) => s.triggerReset);
  const photos = usePhotoStore((s) => s.photos);
  const layout = usePhotoStore((s) => s.layout);
  const clear = usePhotoStore((s) => s.clear);
  const handEnabled = useHandStore((s) => s.enabled);
  const handStatus = useHandStore((s) => s.status);
  const handError = useHandStore((s) => s.errorMessage);
  const toggleHand = useHandStore((s) => s.toggle);
  const autoOrbit = useSpacePrefsStore((s) => s.autoOrbit);
  const toggleAutoOrbit = useSpacePrefsStore((s) => s.toggleAutoOrbit);
  const layoutMode = useSpacePrefsStore((s) => s.layoutMode);
  const cycleLayoutMode = useSpacePrefsStore((s) => s.cycleLayoutMode);
  const reshuffle = useSpacePrefsStore((s) => s.reshuffle);
  const stopAllMotion = useSpacePrefsStore((s) => s.stopAllMotion);
  const cycleTheme = useSpacePrefsStore((s) => s.cycleTheme);
  const theme = useSpacePrefsStore((s) => s.theme);
  const toggleReducedMotion = useSpacePrefsStore((s) => s.toggleReducedMotion);
  const effectiveReducedMotion = useSpacePrefsStore((s) => s.effectiveReducedMotion);
  const qualityTier = useSpacePrefsStore((s) => s.qualityTier);
  const setQualityTier = useSpacePrefsStore((s) => s.setQualityTier);

  const [toast, setToast] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  const onClear = () => {
    clear();
    setView('landing');
  };

  const onSnapshot = useCallback(() => {
    if (requestSnapshot()) showToast('Snapshot saved to downloads');
    else showToast('Snapshot unavailable');
  }, [showToast]);

  const onSave = async () => {
    if (!layout || photos.length === 0) {
      showToast('Nothing to save yet');
      return;
    }
    try {
      await saveSpaceSession({
        layout,
        canvases: photos.map((p) => p.canvas),
        names: photos.map((p) => p.name),
        aspects: photos.map((p) => p.aspectRatio),
        layoutMode,
      });
      setSavedOk(true);
      showToast('Space saved on this device');
    } catch {
      showToast('Could not save space');
    }
  };

  const onClearSaved = async () => {
    try {
      await clearSpaceSession();
      setSavedOk(false);
      showToast('Saved space cleared');
    } catch {
      showToast('Could not clear saved data');
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key;
      const lower = key.toLowerCase();

      if (lower === 'r' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        reshuffle();
        return;
      }
      if (lower === 'o') {
        e.preventDefault();
        toggleAutoOrbit();
        return;
      }
      if (lower === 'p' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onSnapshot();
        return;
      }
      if (key === ' ' || lower === 'x') {
        e.preventDefault();
        stopAllMotion();
        return;
      }
      if (key === '+' || key === '=') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('pinviz-zoom', { detail: -80 }));
        return;
      }
      if (key === '-' || key === '_') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('pinviz-zoom', { detail: 80 }));
        return;
      }

      const panMap: Record<string, [number, number]> = {
        ArrowLeft: [-40, 0],
        ArrowRight: [40, 0],
        ArrowUp: [0, -40],
        ArrowDown: [0, 40],
        a: [-40, 0],
        d: [40, 0],
        w: [0, -40],
        s: [0, 40],
      };
      const delta = panMap[key] ?? panMap[lower];
      if (delta) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('pinviz-pan', { detail: { dx: delta[0], dy: delta[1] } }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reshuffle, toggleAutoOrbit, stopAllMotion, onSnapshot]);

  const reduced = effectiveReducedMotion();
  const handsBroken = handStatus === 'error';

  return (
    <>
      <div className="space-hud" role="toolbar" aria-label="Space controls">
        <FrostPanel className="space-hud-chip">
          <button type="button" className="space-hud-btn" onClick={onClear} aria-label="New space">
            <span className="label-full">← New space</span>
            <span className="label-short">← New</span>
          </button>
        </FrostPanel>
        <FrostPanel className="space-hud-chip">
          <button type="button" className="space-hud-btn" onClick={triggerReset} aria-label="Reset view">
            <span className="label-full">⊙ Reset view</span>
            <span className="label-short">⊙ Reset</span>
          </button>
        </FrostPanel>
        <FrostPanel className="space-hud-chip">
          <button
            type="button"
            className="space-hud-btn"
            onClick={stopAllMotion}
            aria-label="Stop all motion"
            title="Stop spin & orbit (Space / X)"
          >
            ■ Stop
          </button>
        </FrostPanel>
        <FrostPanel className="space-hud-chip">
          <button
            type="button"
            className={`space-hud-btn${autoOrbit ? ' is-active' : ''}`}
            onClick={toggleAutoOrbit}
            aria-pressed={autoOrbit}
            aria-label="Toggle auto orbit"
          >
            <span className="label-full">{autoOrbit ? '↻ Orbit on' : '↻ Orbit'}</span>
            <span className="label-short">{autoOrbit ? '↻ On' : '↻ Spin'}</span>
          </button>
        </FrostPanel>
        <FrostPanel className="space-hud-chip">
          <button
            type="button"
            className="space-hud-btn"
            onClick={cycleLayoutMode}
            aria-label={`Layout ${LAYOUT_MODE_LABELS[layoutMode]}`}
          >
            ▦ {LAYOUT_MODE_LABELS[layoutMode]}
          </button>
        </FrostPanel>
        <FrostPanel className="space-hud-chip">
          <button type="button" className="space-hud-btn" onClick={reshuffle} aria-label="Shuffle layout">
            ⟲ Mix
          </button>
        </FrostPanel>
        <FrostPanel className="space-hud-chip">
          <button type="button" className="space-hud-btn" onClick={onSnapshot} aria-label="Download snapshot">
            📷 Shot
          </button>
        </FrostPanel>
        <FrostPanel className="space-hud-chip">
          <button type="button" className="space-hud-btn" onClick={() => void onSave()} aria-label="Save space locally">
            {savedOk ? '✓ Saved' : '💾 Save'}
          </button>
        </FrostPanel>
        <FrostPanel className="space-hud-chip">
          <button
            type="button"
            className="space-hud-btn"
            onClick={() => void onClearSaved()}
            aria-label="Clear saved space"
          >
            🗑
          </button>
        </FrostPanel>
        <FrostPanel className="space-hud-chip">
          <button type="button" className="space-hud-btn" onClick={cycleTheme} aria-label={`Theme ${theme}`}>
            ◐ {theme}
          </button>
        </FrostPanel>
        <FrostPanel className="space-hud-chip">
          <button
            type="button"
            className={`space-hud-btn${reduced ? ' is-active' : ''}`}
            onClick={toggleReducedMotion}
            aria-pressed={reduced}
            aria-label="Toggle reduced motion"
          >
            {reduced ? 'Motion off' : 'Motion'}
          </button>
        </FrostPanel>
        <FrostPanel className="space-hud-chip">
          <button
            type="button"
            className="space-hud-btn"
            onClick={() => {
              const next =
                qualityTier === 'high' ? 'balanced' : qualityTier === 'balanced' ? 'low' : 'high';
              setQualityTier(next, true);
              showToast(`Quality: ${next}`);
            }}
            aria-label={`Quality ${qualityTier}`}
          >
            Q:{qualityTier[0].toUpperCase()}
          </button>
        </FrostPanel>
        <FrostPanel className="space-hud-chip">
          <button
            type="button"
            className={`space-hud-btn${handEnabled ? ' is-active' : ''}`}
            onClick={toggleHand}
            disabled={handsBroken && !handEnabled}
            aria-pressed={handEnabled}
            aria-label="Toggle hand tracking"
            title={
              handsBroken
                ? (handError ?? 'Hand tracking unavailable')
                : handEnabled
                  ? 'Turn off camera'
                  : 'Enable AR hands'
            }
          >
            {handsBroken ? '🖐 Err' : handEnabled ? '🖐 On' : '🖐 Hands'}
          </button>
        </FrostPanel>
        <FrostPanel className="space-hud-chip">
          <span className="space-hud-count" aria-live="polite">
            {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
          </span>
        </FrostPanel>
      </div>
      {handsBroken && (
        <div className="space-toast space-toast-error" role="status">
          Hands unavailable: {handError ?? 'model or camera failed'}
        </div>
      )}
      {toast && (
        <div className="space-toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}

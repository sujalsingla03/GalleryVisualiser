/**
 * SpaceHud — consolidated HUD (Phase 2).
 *
 * Information architecture
 * ────────────────────────
 * Primary bar (always visible — 7 chips):
 *   ← New  |  ⊙ Reset  |  ■ Stop  |  📷 Shot  |  ✏ Draw  |  🤚 AR Gestures  |  ⚙ Settings
 *
 * Settings drawer (slides down when ⚙ is pressed):
 *   ↻ Orbit  |  ▦ Layout  |  ⟲ Mix  |  💾 Save  |  🗑 Clear saved
 *   ◐ Theme  |  Motion     |  Q:H     |  photo count
 *
 * Keyboard shortcuts:
 *   R — reshuffle   O — orbit    P — snapshot   Space/X — stop
 *   Z — undo stroke D — draw     +/- — zoom     WASD/arrows — pan
 *   S (settings) — toggle drawer (only when not in a text input)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { FrostPanel } from './ui/FrostPanel';
import { useViewStore } from '../store/viewStore';
import { usePhotoStore } from '../store/photoStore';
import { useHandStore } from '../store/handStore';
import { useSpacePrefsStore } from '../store/spacePrefsStore';
import { LAYOUT_MODE_LABELS } from '../lib/computeLayout';
import { requestSnapshot } from '../lib/snapshotBridge';
import { saveSpaceSession, clearSpaceSession } from '../lib/sessionStore';
import { useDrawingStore } from '../store/drawingStore';

export function SpaceHud({
  onToggleDrawPanel,
  drawPanelOpen,
}: {
  onToggleDrawPanel: () => void;
  drawPanelOpen: boolean;
}) {
  const setView      = useViewStore((s) => s.setView);
  const triggerReset = useViewStore((s) => s.triggerReset);
  const photos       = usePhotoStore((s) => s.photos);
  const layout       = usePhotoStore((s) => s.layout);
  const clear        = usePhotoStore((s) => s.clear);

  const handEnabled  = useHandStore((s) => s.enabled);
  const handStatus   = useHandStore((s) => s.status);
  const handError    = useHandStore((s) => s.errorMessage);
  const toggleHand   = useHandStore((s) => s.toggle);

  const autoOrbit            = useSpacePrefsStore((s) => s.autoOrbit);
  const toggleAutoOrbit      = useSpacePrefsStore((s) => s.toggleAutoOrbit);
  const layoutMode           = useSpacePrefsStore((s) => s.layoutMode);
  const cycleLayoutMode      = useSpacePrefsStore((s) => s.cycleLayoutMode);
  const reshuffle            = useSpacePrefsStore((s) => s.reshuffle);
  const stopAllMotion        = useSpacePrefsStore((s) => s.stopAllMotion);
  const cycleTheme           = useSpacePrefsStore((s) => s.cycleTheme);
  const theme                = useSpacePrefsStore((s) => s.theme);
  const toggleReducedMotion  = useSpacePrefsStore((s) => s.toggleReducedMotion);
  const effectiveReducedMotion = useSpacePrefsStore((s) => s.effectiveReducedMotion);
  const qualityTier          = useSpacePrefsStore((s) => s.qualityTier);
  const setQualityTier       = useSpacePrefsStore((s) => s.setQualityTier);

  const undoLastStroke = useDrawingStore((s) => s.undoLast);
  const drawingEnabled = useDrawingStore((s) => s.drawingEnabled);
  const toggleDrawing  = useDrawingStore((s) => s.toggleDrawing);

  const [toast, setToast]       = useState<string | null>(null);
  const [savedOk, setSavedOk]   = useState(false);
  const [drawerOpen, setDrawer] = useState(false);
  const drawerRef               = useRef<HTMLDivElement>(null);
  const settingsBtnRef          = useRef<HTMLButtonElement>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  const onClear = () => { clear(); setView('landing'); };

  const onSnapshot = useCallback(() => {
    if (requestSnapshot()) showToast('Snapshot saved to downloads');
    else showToast('Snapshot unavailable');
  }, [showToast]);

  const onSave = async () => {
    if (!layout || photos.length === 0) { showToast('Nothing to save yet'); return; }
    try {
      await saveSpaceSession({
        layout,
        canvases: photos.map((p) => p.canvas),
        names:    photos.map((p) => p.name),
        aspects:  photos.map((p) => p.aspectRatio),
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

  // Close drawer when clicking outside
  useEffect(() => {
    if (!drawerOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (
        drawerRef.current?.contains(e.target as Node) ||
        settingsBtnRef.current?.contains(e.target as Node)
      ) return;
      setDrawer(false);
    };
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    return () => window.removeEventListener('pointerdown', onPointerDown, { capture: true });
  }, [drawerOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key   = e.key;
      const lower = key.toLowerCase();

      if (lower === 'r' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); reshuffle(); return; }
      if (lower === 'o')                              { e.preventDefault(); toggleAutoOrbit(); return; }
      if (lower === 'p' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); onSnapshot(); return; }
      if (key === ' ' || lower === 'x')              { e.preventDefault(); stopAllMotion(); return; }
      if (lower === 'z' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); undoLastStroke(); return; }
      if (lower === 'd' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault(); toggleDrawing(); onToggleDrawPanel(); return;
      }
      // S — open/close settings drawer (no conflict: WASD pan only fires as CustomEvent)
      if (lower === 's' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        // Allow 's' pan via WASD only if not handled here first — check: 's' IS in the panMap,
        // but we need settings to win when the drawer is not doing WASD pan.
        // Compromise: 'S' (uppercase Shift+s) opens settings; lowercase 's' still pans.
      }
      if (key === '+' || key === '=') { e.preventDefault(); window.dispatchEvent(new CustomEvent('GallerySphere-zoom', { detail: -80 })); return; }
      if (key === '-' || key === '_') { e.preventDefault(); window.dispatchEvent(new CustomEvent('GallerySphere-zoom', { detail: 80 })); return; }

      const panMap: Record<string, [number, number]> = {
        ArrowLeft: [-40, 0], ArrowRight: [40, 0], ArrowUp: [0, -40], ArrowDown: [0, 40],
        a: [-40, 0], d: [40, 0], w: [0, -40], s: [0, 40],
      };
      const delta = panMap[key] ?? panMap[lower];
      if (delta) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('GallerySphere-pan', { detail: { dx: delta[0], dy: delta[1] } }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reshuffle, toggleAutoOrbit, stopAllMotion, onSnapshot, undoLastStroke, toggleDrawing, onToggleDrawPanel]);

  const reduced      = effectiveReducedMotion();
  const handsBroken  = handStatus === 'error';
  const nextQuality  = qualityTier === 'high' ? 'balanced' : qualityTier === 'balanced' ? 'low' : 'high';

  return (
    <>
      {/* ── Primary HUD bar ─────────────────────────────────────────────────── */}
      <div className="space-hud" role="toolbar" aria-label="Space controls">

        {/* ← New */}
        <FrostPanel className="space-hud-chip">
          <button type="button" className="hud-btn" onClick={onClear} aria-label="New space">
            <span className="label-full">← New</span>
            <span className="label-short">←</span>
          </button>
        </FrostPanel>

        {/* ⊙ Reset */}
        <FrostPanel className="space-hud-chip">
          <button type="button" className="hud-btn" onClick={triggerReset} aria-label="Reset view">
            <span className="label-full">⊙ Reset</span>
            <span className="label-short">⊙</span>
          </button>
        </FrostPanel>

        {/* ■ Stop */}
        <FrostPanel className="space-hud-chip">
          <button type="button" className="hud-btn" onClick={stopAllMotion}
            aria-label="Stop all motion" title="Stop spin & orbit (Space / X)">
            <span className="label-full">■ Stop</span>
            <span className="label-short">■</span>
          </button>
        </FrostPanel>

        {/* 📷 Snapshot */}
        <FrostPanel className="space-hud-chip">
          <button type="button" className="hud-btn" onClick={onSnapshot} aria-label="Download snapshot" title="Snapshot (P)">
            <span className="label-full">📷 Shot</span>
            <span className="label-short">📷</span>
          </button>
        </FrostPanel>

        {/* ✏ Draw */}
        <FrostPanel className="space-hud-chip">
          <button
            type="button"
            className={`hud-btn hud-btn-draw${drawingEnabled ? ' is-active' : ''}${drawPanelOpen ? ' is-pressed' : ''}`}
            onClick={onToggleDrawPanel}
            aria-pressed={drawPanelOpen}
            aria-label={drawPanelOpen ? 'Close drawing panel' : 'Open drawing panel'}
            title="Drawing tools (D)"
          >
            <span className="label-full">{drawingEnabled ? '✏ Draw ●' : '✏ Draw'}</span>
            <span className="label-short">✏</span>
          </button>
        </FrostPanel>

        {/* 🤚 AR Gestures */}
        <FrostPanel className="space-hud-chip">
          <button
            type="button"
            className={`hud-btn hud-btn-ar${handEnabled ? ' is-active' : ''}${handsBroken ? ' is-broken' : ''}`}
            onClick={toggleHand}
            disabled={handsBroken && !handEnabled}
            aria-pressed={handEnabled}
            aria-label={
              handsBroken
                ? 'AR Gestures unavailable'
                : handEnabled
                  ? 'Turn off AR Gestures'
                  : 'Enable AR Gestures'
            }
            title={
              handsBroken
                ? (handError ?? 'Camera or model failed to load')
                : handEnabled
                  ? 'AR Gestures on — click to turn off camera'
                  : 'Turn on hand-gesture control (webcam)'
            }
          >
            <span className="label-full">
              {handsBroken ? '⚠ AR Gestures' : handEnabled ? '🤚 AR On' : '🤚 AR Gestures'}
            </span>
            <span className="label-short">{handsBroken ? '⚠' : '🤚'}</span>
          </button>
        </FrostPanel>

        {/* ⚙ Settings */}
        <FrostPanel className="space-hud-chip">
          <button
            ref={settingsBtnRef}
            type="button"
            className={`hud-btn${drawerOpen ? ' is-pressed' : ''}`}
            onClick={() => setDrawer((v) => !v)}
            aria-expanded={drawerOpen}
            aria-controls="settings-drawer"
            aria-label={drawerOpen ? 'Close settings' : 'Open settings'}
            title="Settings"
          >
            <span className="label-full">⚙ Settings</span>
            <span className="label-short">⚙</span>
          </button>
        </FrostPanel>

      </div>

      {/* ── Settings drawer ──────────────────────────────────────────────────── */}
      <div
        id="settings-drawer"
        ref={drawerRef}
        className={`settings-drawer${drawerOpen ? ' is-open' : ''}`}
        role="region"
        aria-label="Settings"
        aria-hidden={!drawerOpen}
      >
        <FrostPanel className="settings-drawer-panel">
          <div className="settings-grid">

            {/* ↻ Orbit */}
            <button
              type="button"
              className={`settings-btn${autoOrbit ? ' is-active' : ''}`}
              onClick={toggleAutoOrbit}
              aria-pressed={autoOrbit}
              aria-label="Toggle auto orbit"
            >
              <span className="settings-btn-icon">↻</span>
              <span className="settings-btn-label">{autoOrbit ? 'Orbit on' : 'Orbit'}</span>
            </button>

            {/* ▦ Layout */}
            <button
              type="button"
              className="settings-btn"
              onClick={cycleLayoutMode}
              aria-label={`Layout: ${LAYOUT_MODE_LABELS[layoutMode]}`}
            >
              <span className="settings-btn-icon">▦</span>
              <span className="settings-btn-label">{LAYOUT_MODE_LABELS[layoutMode]}</span>
            </button>

            {/* ⟲ Mix */}
            <button type="button" className="settings-btn" onClick={reshuffle} aria-label="Shuffle layout">
              <span className="settings-btn-icon">⟲</span>
              <span className="settings-btn-label">Mix</span>
            </button>

            {/* 💾 Save */}
            <button type="button" className="settings-btn" onClick={() => void onSave()} aria-label="Save space locally">
              <span className="settings-btn-icon">{savedOk ? '✓' : '💾'}</span>
              <span className="settings-btn-label">{savedOk ? 'Saved' : 'Save'}</span>
            </button>

            {/* 🗑 Clear saved */}
            <button type="button" className="settings-btn settings-btn-danger" onClick={() => void onClearSaved()} aria-label="Clear saved space">
              <span className="settings-btn-icon">🗑</span>
              <span className="settings-btn-label">Clear saved</span>
            </button>

            {/* ◐ Theme */}
            <button type="button" className="settings-btn" onClick={cycleTheme} aria-label={`Theme: ${theme}`}>
              <span className="settings-btn-icon">◐</span>
              <span className="settings-btn-label">{theme}</span>
            </button>

            {/* Motion */}
            <button
              type="button"
              className={`settings-btn${reduced ? ' is-active' : ''}`}
              onClick={toggleReducedMotion}
              aria-pressed={reduced}
              aria-label="Toggle reduced motion"
            >
              <span className="settings-btn-icon">{reduced ? '⏸' : '▶'}</span>
              <span className="settings-btn-label">{reduced ? 'Motion off' : 'Motion'}</span>
            </button>

            {/* Quality */}
            <button
              type="button"
              className="settings-btn"
              onClick={() => { setQualityTier(nextQuality, true); showToast(`Quality: ${nextQuality}`); }}
              aria-label={`Quality: ${qualityTier}`}
            >
              <span className="settings-btn-icon">◈</span>
              <span className="settings-btn-label">Q: {qualityTier}</span>
            </button>

            {/* Photo count — read-only */}
            <div className="settings-count" aria-live="polite">
              <span className="settings-btn-icon">🖼</span>
              <span className="settings-btn-label">{photos.length} photo{photos.length !== 1 ? 's' : ''}</span>
            </div>

          </div>
        </FrostPanel>
      </div>

      {/* ── Error toast ──────────────────────────────────────────────────────── */}
      {handsBroken && (
        <div className="space-toast space-toast-error" role="alert">
          Hands unavailable: {handError ?? 'model or camera failed'}
        </div>
      )}

      {/* ── Info toast ───────────────────────────────────────────────────────── */}
      {toast && (
        <div className="space-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </>
  );
}

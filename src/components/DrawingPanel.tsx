/**
 * DrawingPanel — floating tool palette shown when drawing mode is open.
 *
 * Features:
 *   - Draw mode toggle (on/off) with visual indicator
 *   - Color palette (11 presets + live preview swatch)
 *   - Brush size selector (XS / S / M / L / XL)
 *   - Opacity slider (5 % – 100 %)
 *   - Stroke counter with undo-last and clear-all buttons
 *   - Keyboard hint (Z = undo)
 *
 * Visibility is controlled by the `open` prop — the parent (SpaceHud) toggles
 * it with the ✏ Draw button so it slides in/out without unmounting.
 */

import { useDrawingStore, PALETTE_COLORS, BRUSH_SIZES } from '../store/drawingStore';
import { FrostPanel } from './ui/FrostPanel';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function DrawingPanel({ open, onClose }: Props) {
  const drawingEnabled  = useDrawingStore((s) => s.drawingEnabled);
  const toggleDrawing   = useDrawingStore((s) => s.toggleDrawing);
  const currentColor    = useDrawingStore((s) => s.currentColor);
  const currentRadius   = useDrawingStore((s) => s.currentRadius);
  const currentOpacity  = useDrawingStore((s) => s.currentOpacity);
  const setColor        = useDrawingStore((s) => s.setColor);
  const setRadius       = useDrawingStore((s) => s.setRadius);
  const setOpacity      = useDrawingStore((s) => s.setOpacity);
  const strokeCount     = useDrawingStore((s) => s.strokes.length);
  const isDrawing       = useDrawingStore((s) => s.isDrawing);
  const undoLast        = useDrawingStore((s) => s.undoLast);
  const clearAll        = useDrawingStore((s) => s.clearAll);

  return (
    <div
      className={`drawing-panel-wrapper${open ? ' is-open' : ''}`}
      role="dialog"
      aria-label="Drawing tools"
      aria-modal="false"
    >
      <FrostPanel className="drawing-panel">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="dp-header">
          <span className="dp-title">✏ Draw</span>
          <div className="dp-header-actions">
            {/* Master on/off toggle */}
            <button
              type="button"
              className={`dp-toggle-btn${drawingEnabled ? ' is-on' : ''}`}
              onClick={toggleDrawing}
              aria-pressed={drawingEnabled}
              aria-label={drawingEnabled ? 'Stop drawing' : 'Start drawing'}
              title={drawingEnabled ? 'Drawing ON — click to stop' : 'Click to start drawing'}
            >
              {drawingEnabled ? (
                <><span className="dp-toggle-dot is-live" />Live</>
              ) : (
                'Off'
              )}
            </button>
            <button
              type="button"
              className="dp-close-btn"
              onClick={onClose}
              aria-label="Close drawing panel"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Status pill ────────────────────────────────────────────── */}
        {drawingEnabled && (
          <div className="dp-status">
            {isDrawing
              ? <span className="dp-status-active">● Drawing stroke…</span>
              : <span className="dp-status-idle">Point finger or click+drag to draw</span>}
          </div>
        )}

        {/* ── Color palette ──────────────────────────────────────────── */}
        <div className="dp-section-label">Color</div>
        <div className="dp-colors">
          {PALETTE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`dp-color-swatch${c === currentColor ? ' is-selected' : ''}`}
              style={{ background: c, borderColor: c === currentColor ? '#fff' : 'transparent' }}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              aria-pressed={c === currentColor}
              title={c}
            />
          ))}
          {/* Custom color via native picker */}
          <label className="dp-color-custom" title="Custom color">
            <span
              className={`dp-color-swatch dp-color-custom-swatch${
                !PALETTE_COLORS.includes(currentColor as typeof PALETTE_COLORS[number]) ? ' is-selected' : ''
              }`}
              style={{ background: currentColor }}
            />
            <input
              type="color"
              value={currentColor}
              onChange={(e) => setColor(e.target.value)}
              aria-label="Custom color"
            />
          </label>
        </div>

        {/* ── Brush size ─────────────────────────────────────────────── */}
        <div className="dp-section-label">Brush size</div>
        <div className="dp-sizes">
          {BRUSH_SIZES.map(({ label, value }) => (
            <button
              key={label}
              type="button"
              className={`dp-size-btn${value === currentRadius ? ' is-selected' : ''}`}
              onClick={() => setRadius(value)}
              aria-pressed={value === currentRadius}
              aria-label={`Brush size ${label}`}
            >
              {/* Visual dot scales with radius */}
              <span
                className="dp-size-dot"
                style={{ width: 6 + BRUSH_SIZES.findIndex((s) => s.value === value) * 4 }}
              />
              <span className="dp-size-label">{label}</span>
            </button>
          ))}
        </div>

        {/* ── Opacity ────────────────────────────────────────────────── */}
        <div className="dp-section-label">
          Opacity
          <span className="dp-section-value">{Math.round(currentOpacity * 100)} %</span>
        </div>
        <div className="dp-opacity-row">
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={Math.round(currentOpacity * 100)}
            onChange={(e) => setOpacity(Number(e.target.value) / 100)}
            className="dp-slider"
            aria-label="Stroke opacity"
            style={{ '--thumb-color': currentColor } as React.CSSProperties}
          />
          {/* Live preview swatch */}
          <span
            className="dp-opacity-preview"
            style={{ background: currentColor, opacity: currentOpacity }}
          />
        </div>

        {/* ── Stroke history ─────────────────────────────────────────── */}
        <div className="dp-section-label">
          Strokes
          <span className="dp-section-value">{strokeCount}</span>
        </div>
        <div className="dp-stroke-actions">
          <button
            type="button"
            className="dp-action-btn"
            onClick={undoLast}
            disabled={strokeCount === 0}
            aria-label="Undo last stroke"
            title="Undo last stroke (Z)"
          >
            ↩ Undo
          </button>
          <button
            type="button"
            className="dp-action-btn dp-action-btn-danger"
            onClick={clearAll}
            disabled={strokeCount === 0}
            aria-label="Clear all strokes"
            title="Clear all drawings"
          >
            🗑 Clear all
          </button>
        </div>

        {/* ── Keyboard hint ──────────────────────────────────────────── */}
        <div className="dp-hint">
          Z — undo · D — toggle draw mode
        </div>

      </FrostPanel>
    </div>
  );
}

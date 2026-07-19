/**
 * DrawFab — floating action button fixed to the bottom-right corner.
 *
 * Tapping it toggles drawing on/off instantly without needing the panel.
 * When drawing is ON the button pulses and shows the current brush colour.
 * Holding (long-press ≥ 400 ms) opens the full drawing panel instead.
 *
 * States:
 *   off      — neutral, pencil icon, invites interaction
 *   on       — accent tint + pulse ring + current brush colour dot
 *   drawing  — inner dot pulses to show a stroke is being recorded
 *   broken   — never shown here (no camera dependency on this button)
 */

import { useEffect, useRef, useState } from 'react';
import { useDrawingStore } from '../store/drawingStore';

interface Props {
  /** Called when the user long-presses the FAB to open the full panel. */
  onOpenPanel: () => void;
}

const LONG_PRESS_MS = 400;

export function DrawFab({ onOpenPanel }: Props) {
  const drawingEnabled = useDrawingStore((s) => s.drawingEnabled);
  const isDrawing      = useDrawingStore((s) => s.isDrawing);
  const currentColor   = useDrawingStore((s) => s.currentColor);
  const strokeCount    = useDrawingStore((s) => s.strokes.length);
  const toggleDrawing  = useDrawingStore((s) => s.toggleDrawing);
  const undoLast       = useDrawingStore((s) => s.undoLast);

  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longRef    = useRef(false);
  const [pressed, setPressed] = useState(false);

  // Clean up timer on unmount
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const startPress = () => {
    longRef.current = false;
    setPressed(true);
    timerRef.current = setTimeout(() => {
      longRef.current = true;
      onOpenPanel();
      setPressed(false);
    }, LONG_PRESS_MS);
  };

  const endPress = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setPressed(false);
    if (!longRef.current) {
      // Short tap → toggle draw mode
      toggleDrawing();
    }
    longRef.current = false;
  };

  const cancelPress = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setPressed(false);
    longRef.current = false;
  };

  const label = drawingEnabled
    ? isDrawing ? 'Drawing… (tap to stop)' : 'Drawing on (tap to stop, hold for tools)'
    : 'Start drawing (hold for tools)';

  return (
    <div className="draw-fab-root">

      {/* Stroke count badge + undo — only shown when there are strokes */}
      {strokeCount > 0 && (
        <div className="draw-fab-badges">
          <button
            type="button"
            className="draw-fab-undo"
            onClick={undoLast}
            aria-label="Undo last stroke"
            title="Undo (Z)"
          >
            ↩
          </button>
          <span className="draw-fab-count" aria-live="polite">{strokeCount}</span>
        </div>
      )}

      {/* Main FAB */}
      <button
        type="button"
        className={[
          'draw-fab',
          drawingEnabled  ? 'is-on'      : '',
          isDrawing       ? 'is-drawing' : '',
          pressed         ? 'is-pressed' : '',
        ].filter(Boolean).join(' ')}
        style={drawingEnabled ? { '--fab-color': currentColor } as React.CSSProperties : undefined}
        onPointerDown={startPress}
        onPointerUp={endPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        /* Prevent context menu on long-press (mobile) */
        onContextMenu={(e) => e.preventDefault()}
        aria-label={label}
        aria-pressed={drawingEnabled}
        title={label}
      >
        {/* Pulse ring — visible when drawing is ON */}
        {drawingEnabled && <span className="draw-fab-ring" />}

        {/* Icon */}
        <span className="draw-fab-icon" aria-hidden="true">
          {isDrawing ? '●' : '✏'}
        </span>

        {/* Colour dot in corner of the FAB */}
        {drawingEnabled && (
          <span
            className="draw-fab-color-dot"
            style={{ background: currentColor }}
            aria-hidden="true"
          />
        )}
      </button>

    </div>
  );
}

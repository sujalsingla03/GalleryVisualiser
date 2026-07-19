/**
 * FingerCursor — finger-tip cursor overlay.
 *
 * ## Phase 1 performance fix (C)
 *
 * The previous implementation called setState({pos}) + setState({trail}) on
 * every GallerySphere-finger event (30 Hz), causing ~30 React re-renders/sec
 * just to move the cursor.
 *
 * Now: position is applied via direct DOM style mutations on persistent ref
 * elements (ringRef, dotRef, labelRef). React state is only used for:
 *   - drawingEnabled (changes at human speed when user toggles the panel)
 *   - currentColor (changes when user picks a color in the panel)
 *   - visible (boolean, only toggled when pointing starts/stops)
 *
 * The ink-trail is drawn on a persistent <canvas> element via 2D API —
 * again bypassing React rendering entirely for per-frame updates.
 *
 * Result: zero React re-renders during active finger tracking.
 */

import { useEffect, useRef, useState } from 'react';
import { useDrawingStore } from '../store/drawingStore';

/** Trail config */
const TRAIL_MAX    = 14;    // max retained trail positions
const TRAIL_RADIUS = 4;     // base dot radius px
const TRAIL_FADE   = 250;   // ms for trail to fade after finger lifts

interface TrailPoint { x: number; y: number; t: number }

export function FingerCursor() {
  const drawingEnabled = useDrawingStore((s) => s.drawingEnabled);
  const currentColor   = useDrawingStore((s) => s.currentColor);

  // Only two pieces of React state — both change at human speed (button clicks)
  const [visible, setVisible] = useState(false);

  const ringRef  = useRef<HTMLDivElement>(null);
  const dotRef   = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLCanvasElement>(null);

  const trailPoints  = useRef<TrailPoint[]>([]);
  const isDrawingRef = useRef(false);
  const rafFadeRef   = useRef<number>(0);
  const colorRef     = useRef(currentColor);

  // Keep colorRef in sync without re-render
  useEffect(() => {
    colorRef.current = currentColor;
    // Update existing DOM elements' colors immediately
    if (ringRef.current)  ringRef.current.style.borderColor  = currentColor;
    if (dotRef.current)   dotRef.current.style.background     = currentColor;
  }, [currentColor]);

  // Clear state when drawing mode is turned off
  useEffect(() => {
    if (!drawingEnabled) {
      setVisible(false);
      isDrawingRef.current = false;
      trailPoints.current  = [];
      clearTrailCanvas();
    }
  }, [drawingEnabled]);

  function clearTrailCanvas() {
    const c = trailRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, c.width, c.height);
  }

  function drawTrail() {
    const c = trailRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    // Match canvas size to viewport
    if (c.width !== window.innerWidth || c.height !== window.innerHeight) {
      c.width  = window.innerWidth;
      c.height = window.innerHeight;
    }

    ctx.clearRect(0, 0, c.width, c.height);

    const pts = trailPoints.current;
    if (pts.length < 2) return;

    for (let i = 1; i < pts.length; i++) {
      const alpha  = (i / pts.length) * 0.6;
      const radius = TRAIL_RADIUS * (0.4 + (i / pts.length) * 0.6);
      ctx.beginPath();
      ctx.arc(pts[i].x * c.width, pts[i].y * c.height, radius, 0, Math.PI * 2);
      ctx.fillStyle = colorRef.current + Math.round(alpha * 255).toString(16).padStart(2, '0');
      ctx.fill();
    }
  }

  /** Fade trail after finger lifts — runs as its own rAF loop, not the 3D loop. */
  function startFade() {
    cancelAnimationFrame(rafFadeRef.current);
    const startTime = performance.now();
    const step = () => {
      const elapsed = performance.now() - startTime;
      if (elapsed >= TRAIL_FADE) {
        trailPoints.current = [];
        clearTrailCanvas();
        return;
      }
      // Remove oldest points proportional to elapsed time
      const keep = Math.ceil(trailPoints.current.length * (1 - elapsed / TRAIL_FADE));
      trailPoints.current = trailPoints.current.slice(-keep);
      drawTrail();
      rafFadeRef.current = requestAnimationFrame(step);
    };
    rafFadeRef.current = requestAnimationFrame(step);
  }

  // Listen for finger events — move DOM elements directly, never call setState
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ x: number; y: number; drawing: boolean } | null>).detail;

      if (!detail) {
        // Finger lifted
        if (visible) setVisible(false);
        isDrawingRef.current = false;
        startFade();
        return;
      }

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const cx = detail.x * vw;
      const cy = detail.y * vh;

      // Move ring and dot via direct style — zero React overhead
      if (ringRef.current) {
        ringRef.current.style.left = `${cx - 22}px`;
        ringRef.current.style.top  = `${cy - 22}px`;
        ringRef.current.classList.toggle('is-drawing', detail.drawing);
      }
      if (dotRef.current) {
        dotRef.current.style.left = `${cx - 5}px`;
        dotRef.current.style.top  = `${cy - 5}px`;
      }
      if (labelRef.current) {
        labelRef.current.style.left    = `${cx + 18}px`;
        labelRef.current.style.top     = `${cy - 28}px`;
        labelRef.current.style.display = detail.drawing ? 'block' : 'none';
      }

      // Accumulate trail
      if (detail.drawing) {
        cancelAnimationFrame(rafFadeRef.current);
        const pts = trailPoints.current;
        pts.push({ x: detail.x, y: detail.y, t: performance.now() });
        if (pts.length > TRAIL_MAX) pts.shift();
        drawTrail();
      }

      isDrawingRef.current = detail.drawing;

      // Only trigger a React re-render when visibility changes (rare)
      if (!visible) setVisible(true);
    };

    window.addEventListener('GallerySphere-finger', handler);
    return () => {
      window.removeEventListener('GallerySphere-finger', handler);
      cancelAnimationFrame(rafFadeRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!drawingEnabled) return null;

  const color = currentColor;
  const glow  = `0 0 12px 4px ${color}55, 0 0 0 1px ${color}33`;
  const dot   = `0 0 8px 2px ${color}88`;

  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 30, pointerEvents: 'none' }}>
      {/* Trail canvas — drawn via 2D API, not React */}
      <canvas
        ref={trailRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        width={window.innerWidth}
        height={window.innerHeight}
      />

      {/* Glow ring — moved via direct style writes, only rendered once */}
      <div
        ref={ringRef}
        className="finger-cursor-ring"
        style={{
          borderColor: color,
          boxShadow:   glow,
          display:     visible ? 'block' : 'none',
        }}
      />

      {/* Center dot */}
      <div
        ref={dotRef}
        className="finger-cursor-dot"
        style={{
          background: color,
          boxShadow:  dot,
          display:    visible ? 'block' : 'none',
        }}
      />

      {/* Drawing label */}
      <div
        ref={labelRef}
        className="finger-cursor-label"
        style={{ display: 'none' }}
      >
        ✏ drawing
      </div>
    </div>
  );
}

/**
 * FingerCursor — DOM overlay that renders a glowing ring at the live
 * index-fingertip position when drawing mode is active and the hand is
 * pointing.
 *
 * Listens for the 'GallerySphere-finger' CustomEvent dispatched by SpaceScene
 * on every drawStart / drawMove frame. The event detail is either:
 *   { x: number (0-1 norm), y: number (0-1 norm), drawing: boolean }  ← pointing
 *   null                                                                ← not pointing
 *
 * The ring follows the finger in real time. When `drawing` is true the ring
 * pulses and leaves a short ink-trail to show the stroke is being recorded.
 * When drawing mode is off (user turned off the toggle) the cursor is hidden.
 */

import { useEffect, useRef, useState } from 'react';
import { useDrawingStore } from '../store/drawingStore';

interface FingerPos {
  x: number; // viewport fraction 0-1
  y: number;
  drawing: boolean;
}

export function FingerCursor() {
  const drawingEnabled = useDrawingStore((s) => s.drawingEnabled);
  const currentColor   = useDrawingStore((s) => s.currentColor);

  const [pos, setPos]       = useState<FingerPos | null>(null);
  const [trail, setTrail]   = useState<FingerPos[]>([]);
  const trailRef            = useRef<FingerPos[]>([]);
  const rafRef              = useRef<number>(0);

  // Listen for finger-position events from SpaceScene
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<FingerPos | null>).detail;
      if (!detail) {
        setPos(null);
        // Fade trail out
        const drain = () => {
          setTrail((t) => {
            if (t.length === 0) return t;
            const next = t.slice(1);
            trailRef.current = next;
            if (next.length > 0) rafRef.current = requestAnimationFrame(drain);
            return next;
          });
        };
        rafRef.current = requestAnimationFrame(drain);
        return;
      }

      setPos(detail);

      if (detail.drawing) {
        // Append to trail, cap at 12 dots
        const next = [...trailRef.current, detail].slice(-12);
        trailRef.current = next;
        setTrail(next);
      }
    };

    window.addEventListener('GallerySphere-finger', handler);
    return () => {
      window.removeEventListener('GallerySphere-finger', handler);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Clear trail when drawing mode is turned off
  useEffect(() => {
    if (!drawingEnabled) {
      setPos(null);
      setTrail([]);
      trailRef.current = [];
    }
  }, [drawingEnabled]);

  if (!drawingEnabled || !pos) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = pos.x * vw;
  const cy = pos.y * vh;

  return (
    <div
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, zIndex: 30, pointerEvents: 'none' }}
    >
      {/* Ink trail dots */}
      {trail.map((p, i) => {
        const opacity = ((i + 1) / trail.length) * 0.55;
        const size    = 6 + (i / trail.length) * 6;
        return (
          <div
            key={i}
            className="finger-trail-dot"
            style={{
              left:    p.x * vw - size / 2,
              top:     p.y * vh - size / 2,
              width:   size,
              height:  size,
              opacity,
              background: currentColor,
            }}
          />
        );
      })}

      {/* Outer glow ring */}
      <div
        className={`finger-cursor-ring${pos.drawing ? ' is-drawing' : ''}`}
        style={{
          left:        cx - 22,
          top:         cy - 22,
          borderColor: currentColor,
          boxShadow:   `0 0 12px 4px ${currentColor}55, 0 0 0 1px ${currentColor}33`,
        }}
      />

      {/* Inner filled dot */}
      <div
        className="finger-cursor-dot"
        style={{
          left:       cx - 5,
          top:        cy - 5,
          background: currentColor,
          boxShadow:  `0 0 8px 2px ${currentColor}88`,
        }}
      />

      {/* "Drawing" label badge */}
      {pos.drawing && (
        <div
          className="finger-cursor-label"
          style={{ left: cx + 18, top: cy - 28 }}
        >
          ✏ drawing
        </div>
      )}
    </div>
  );
}

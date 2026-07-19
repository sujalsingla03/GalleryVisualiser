/**
 * Drawing store — session-only stroke state.
 *
 * Intentionally NOT wired to IndexedDB / the "Save this space" feature.
 * Drawings are ephemeral: cleared on reload, exactly like the rest of the space.
 *
 * Shape:
 *   drawingEnabled — master toggle; when false draw events are ignored entirely
 *   strokes        — completed strokes (finalised on drawEnd)
 *   livePoints     — points accumulated for the stroke currently being drawn
 *   isDrawing      — true while a drawStart has been received and drawEnd hasn't
 *   currentColor   — active brush color (CSS hex)
 *   currentRadius  — active tube radius in scene units
 *   currentOpacity — stroke opacity 0–1
 *
 * Actions:
 *   toggleDrawing — enable/disable draw mode
 *   beginStroke   — called on drawStart
 *   appendPoint   — called on drawMove (enforces point cap internally)
 *   commitStroke  — called on drawEnd (runs D-P simplification, moves live→strokes)
 *   undoLast      — removes the most-recent completed stroke
 *   clearAll      — removes every stroke (does NOT affect cards/layout)
 *   setColor      — change current brush color
 *   setRadius     — change current brush size
 *   setOpacity    — change current stroke opacity
 */

import { create } from 'zustand';
import { Vector3 } from 'three';
import { douglasPeucker, enforcePointCap } from '../lib/strokeSimplify';

/** Epsilon for Douglas-Peucker final simplification (scene units). */
const DP_EPSILON = 0.03;

/** Minimum points required to keep a stroke (avoid zero-length TubeGeometry). */
const MIN_STROKE_POINTS = 2;

export interface Stroke {
  /** Unique id so React/Three can key on it. */
  id: string;
  /** World-space points. Simplified on commit. */
  points: Vector3[];
  /** Stroke colour as a CSS hex string. */
  color: string;
  /** Tube radius in scene units. */
  radius: number;
  /** Opacity 0–1. */
  opacity: number;
}

/** Preset color palette exposed to the drawing panel. */
export const PALETTE_COLORS = [
  '#ffffff', // white
  '#f87171', // red
  '#fb923c', // orange
  '#fbbf24', // amber
  '#a3e635', // lime
  '#34d399', // emerald
  '#22d3ee', // cyan
  '#60a5fa', // blue
  '#a78bfa', // violet
  '#f472b6', // pink
  '#000000', // black
] as const;

/** Preset brush radii (scene units → tube radius). */
export const BRUSH_SIZES = [
  { label: 'XS', value: 0.010 },
  { label: 'S',  value: 0.018 },
  { label: 'M',  value: 0.030 },
  { label: 'L',  value: 0.050 },
  { label: 'XL', value: 0.080 },
] as const;

interface DrawingState {
  drawingEnabled: boolean;
  strokes: Stroke[];
  livePoints: Vector3[];
  isDrawing: boolean;
  currentColor: string;
  currentRadius: number;
  currentOpacity: number;

  toggleDrawing: () => void;
  setDrawingEnabled: (enabled: boolean) => void;
  beginStroke: (firstPoint: Vector3) => void;
  appendPoint: (point: Vector3) => void;
  commitStroke: () => void;
  undoLast: () => void;
  clearAll: () => void;
  setColor: (color: string) => void;
  setRadius: (radius: number) => void;
  setOpacity: (opacity: number) => void;
}

let _nextId = 0;
function nextId(): string {
  return `stroke-${++_nextId}`;
}

export const useDrawingStore = create<DrawingState>((set, get) => ({
  drawingEnabled: false,
  strokes: [],
  livePoints: [],
  isDrawing: false,
  currentColor: '#ffffff',
  currentRadius: BRUSH_SIZES[1].value,
  currentOpacity: 1.0,

  toggleDrawing: () => {
    const next = !get().drawingEnabled;
    // When disabling mid-stroke, commit whatever is live.
    if (!next && get().isDrawing) {
      get().commitStroke();
    }
    set({ drawingEnabled: next });
  },

  setDrawingEnabled: (enabled) => {
    if (!enabled && get().isDrawing) get().commitStroke();
    set({ drawingEnabled: enabled });
  },

  beginStroke: (firstPoint) => {
    set({ isDrawing: true, livePoints: [firstPoint] });
  },

  appendPoint: (point) => {
    const raw = [...get().livePoints, point];
    const capped = enforcePointCap(raw);
    set({ livePoints: capped });
  },

  commitStroke: () => {
    const { livePoints, strokes, currentColor, currentRadius, currentOpacity } = get();
    const simplified = douglasPeucker(livePoints, DP_EPSILON);
    if (simplified.length >= MIN_STROKE_POINTS) {
      const stroke: Stroke = {
        id: nextId(),
        points: simplified,
        color: currentColor,
        radius: currentRadius,
        opacity: currentOpacity,
      };
      set({ strokes: [...strokes, stroke], livePoints: [], isDrawing: false });
    } else {
      set({ livePoints: [], isDrawing: false });
    }
  },

  undoLast: () => {
    const { strokes } = get();
    if (strokes.length === 0) return;
    set({ strokes: strokes.slice(0, -1) });
  },

  clearAll: () => {
    set({ strokes: [], livePoints: [], isDrawing: false });
  },

  setColor: (color) => set({ currentColor: color }),
  setRadius: (radius) => set({ currentRadius: radius }),
  setOpacity: (opacity) => set({ currentOpacity: Math.max(0.05, Math.min(1, opacity)) }),
}));

/**
 * Drawing store — session-only stroke state.
 *
 * ## Performance architecture (Phase 1 fix)
 *
 * livePoints and isDrawing have been REMOVED from this store.
 * Previously, appendPoint() called set({livePoints}) on every drawMove frame
 * (~60 Hz), which:
 *   - Allocated a new spread array every frame
 *   - Notified ALL Zustand subscribers including DrawingLayer's store.subscribe()
 *     which in turn allocated two new Set()s and two .map() arrays per frame
 *
 * Now: livePoints live entirely in a plain mutable useRef inside DrawingLayer.
 * Zero Zustand writes during active drawing. The store is only written when a
 * stroke is committed (drawEnd), undone, or cleared — events that happen at
 * human-interaction frequency, not rAF frequency.
 *
 * The DrawingLayer store subscriber now uses a strokes-only equality selector
 * so it fires only on actual structural changes (commit / undo / clear).
 *
 * isDrawing is exposed as a read-only signal via a Zustand atom only when it
 * changes at start/end of stroke — not per-frame.
 *
 * Shape:
 *   drawingEnabled — master toggle
 *   strokes        — completed strokes (written only on commit/undo/clear)
 *   isDrawing      — true between beginStroke and commitStroke (UI feedback only)
 *   currentColor   — active brush color (CSS hex)
 *   currentRadius  — active tube radius in scene units
 *   currentOpacity — stroke opacity 0–1
 *
 * Actions:
 *   toggleDrawing  — enable/disable draw mode
 *   setDrawingEnabled
 *   markDrawStart  — sets isDrawing=true (called by DrawingLayer on drawStart)
 *   commitStroke   — accepts the finished, simplified points; sets isDrawing=false
 *   undoLast       — removes most-recent completed stroke
 *   clearAll       — removes every stroke
 *   setColor / setRadius / setOpacity
 */

import { create } from 'zustand';
import { Vector3 } from 'three';

export interface Stroke {
  id: string;
  points: Vector3[];
  color: string;
  radius: number;
  opacity: number;
}

/** Preset color palette exposed to the drawing panel. */
export const PALETTE_COLORS = [
  '#ffffff',
  '#f87171',
  '#fb923c',
  '#fbbf24',
  '#a3e635',
  '#34d399',
  '#22d3ee',
  '#60a5fa',
  '#a78bfa',
  '#f472b6',
  '#000000',
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
  /** True while a stroke is in progress — used only for UI feedback in DrawingPanel. */
  isDrawing: boolean;
  currentColor: string;
  currentRadius: number;
  currentOpacity: number;

  toggleDrawing: () => void;
  setDrawingEnabled: (enabled: boolean) => void;
  /** Called by DrawingLayer when a stroke starts — sets isDrawing flag for panel UI. */
  markDrawStart: () => void;
  /**
   * Called by DrawingLayer when a stroke ends.
   * Receives the already-simplified points so the store stays allocation-free.
   * Returns the new Stroke id, or null if the stroke was too short to keep.
   */
  commitStroke: (points: Vector3[]) => string | null;
  undoLast: () => void;
  clearAll: () => void;
  setColor: (color: string) => void;
  setRadius: (radius: number) => void;
  setOpacity: (opacity: number) => void;
}

const MIN_STROKE_POINTS = 2;
let _nextId = 0;
function nextId(): string {
  return `stroke-${++_nextId}`;
}

export const useDrawingStore = create<DrawingState>((set, get) => ({
  drawingEnabled: false,
  strokes: [],
  isDrawing: false,
  currentColor: '#ffffff',
  currentRadius: BRUSH_SIZES[1].value,
  currentOpacity: 1.0,

  toggleDrawing: () => {
    const next = !get().drawingEnabled;
    if (!next && get().isDrawing) {
      // Disabling mid-stroke — just mark done; DrawingLayer will discard live points
      set({ isDrawing: false });
    }
    set({ drawingEnabled: next });
  },

  setDrawingEnabled: (enabled) => {
    if (!enabled && get().isDrawing) set({ isDrawing: false });
    set({ drawingEnabled: enabled });
  },

  markDrawStart: () => {
    set({ isDrawing: true });
  },

  commitStroke: (points) => {
    if (points.length < MIN_STROKE_POINTS) {
      set({ isDrawing: false });
      return null;
    }
    const { strokes, currentColor, currentRadius, currentOpacity } = get();
    const id = nextId();
    const stroke: Stroke = { id, points, color: currentColor, radius: currentRadius, opacity: currentOpacity };
    set({ strokes: [...strokes, stroke], isDrawing: false });
    return id;
  },

  undoLast: () => {
    const { strokes } = get();
    if (strokes.length === 0) return;
    set({ strokes: strokes.slice(0, -1) });
  },

  clearAll: () => {
    set({ strokes: [], isDrawing: false });
  },

  setColor:   (color)   => set({ currentColor: color }),
  setRadius:  (radius)  => set({ currentRadius: radius }),
  setOpacity: (opacity) => set({ currentOpacity: Math.max(0.05, Math.min(1, opacity)) }),
}));

/**
 * DrawingLayer — Three.js stroke meshes + mouse/touch drawing.
 *
 * ## Phase 1 performance fix (A+B)
 *
 * livePoints now live entirely in a plain mutable useRef (this.livePointsRef).
 * They are NEVER written to Zustand during active drawing.
 * Zero heap allocations from store.set() during a drawMove frame.
 *
 * The store subscriber uses a strokes-reference equality check so it only
 * fires when strokes actually change (commit / undo / clear) — NOT on the
 * isDrawing or color/radius changes that happen in the panel.
 *
 * DrawingLayer owns the full draw lifecycle:
 *   doDrawStart  → livePointsRef = [firstPoint], store.markDrawStart()
 *   doDrawMove   → livePointsRef.push(point) + enforcePointCap in-place +
 *                  rebuild live preview mesh (no store write)
 *   doDrawEnd    → douglasPeucker(livePointsRef) → store.commitStroke(simplified)
 *
 * The live preview mesh is rebuilt each drawMove by swapping TubeGeometry
 * in-place (updateStrokeMesh). Committed strokes are static meshes.
 */

import { useEffect, useRef } from 'react';
import { Vector3, type Scene, type PerspectiveCamera } from 'three';
import { useDrawingStore, type Stroke } from '../store/drawingStore';
import {
  createStrokeMesh,
  updateStrokeMesh,
  type StrokeMesh,
} from '../three/createStrokeMesh';
import { projectOntoDrawingPlane } from '../lib/drawingPlane';
import { douglasPeucker, MAX_RAW_POINTS, decimateStride } from '../lib/strokeSimplify';

const DP_EPSILON = 0.03;

export interface DrawingLayerHandle {
  onDrawStart: (px: number, py: number) => void;
  onDrawMove:  (px: number, py: number) => void;
  onDrawEnd:   () => void;
}

interface Props {
  scene:     Scene;
  camera:    PerspectiveCamera;
  handleRef: React.MutableRefObject<DrawingLayerHandle | null>;
  canvas:    HTMLCanvasElement | null;
}

export function DrawingLayer({ scene, camera, handleRef, canvas }: Props) {
  const meshMap       = useRef<Map<string, StrokeMesh>>(new Map());
  const liveMesh      = useRef<StrokeMesh | null>(null);
  /** Live stroke points — never written to Zustand during drawing. */
  const livePointsRef = useRef<Vector3[]>([]);

  const store = useDrawingStore;

  // ── Sync committed strokes (strokes-ref guard = fires only on commit/undo/clear) ──
  useEffect(() => {
    // Plain subscribe — but guard on strokes reference equality so the heavy
    // Set-construction only runs when strokes actually change, not when
    // isDrawing / currentColor / currentRadius change.
    let prevStrokes = store.getState().strokes;

    const unsub = store.subscribe((state) => {
      if (state.strokes === prevStrokes) return; // ← the key guard: no alloc on non-stroke updates
      const strokes = state.strokes;
      const current  = new Set(strokes.map((s) => s.id));
      const previous = new Set(prevStrokes.map((s) => s.id));
      prevStrokes = strokes;

      for (const stroke of strokes) {
        if (!previous.has(stroke.id) && !meshMap.current.has(stroke.id)) {
          addCommittedMesh(stroke);
        }
      }
      for (const [id, sm] of meshMap.current) {
        if (!current.has(id)) {
          scene.remove(sm.mesh);
          sm.dispose();
          meshMap.current.delete(id);
        }
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      for (const sm of meshMap.current.values()) {
        scene.remove(sm.mesh);
        sm.dispose();
      }
      meshMap.current.clear();
      disposeLiveMesh();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  function disposeLiveMesh(): void {
    if (liveMesh.current) {
      scene.remove(liveMesh.current.mesh);
      liveMesh.current.dispose();
      liveMesh.current = null;
    }
  }

  function addCommittedMesh(stroke: Stroke): void {
    if (stroke.points.length < 2) return;
    const sm = createStrokeMesh(stroke.points, stroke.color, stroke.radius, stroke.opacity);
    scene.add(sm.mesh);
    meshMap.current.set(stroke.id, sm);
  }

  // ── Core draw helpers ──────────────────────────────────────────────────────

  function doDrawStart(px: number, py: number): void {
    const point = projectOntoDrawingPlane(px, py, camera);
    if (!point) return;

    // Reset local point buffer — no store write needed for livePoints
    livePointsRef.current = [point];
    store.getState().markDrawStart();

    disposeLiveMesh();
  }

  function doDrawMove(px: number, py: number): void {
    const point = projectOntoDrawingPlane(px, py, camera);
    if (!point) return;

    // Append directly to the mutable ref — zero allocations, zero store writes
    const pts = livePointsRef.current;
    pts.push(point);

    // In-place point cap: if over limit, decimate and replace the array
    if (pts.length > MAX_RAW_POINTS) {
      livePointsRef.current = decimateStride(pts);
    }

    const live = livePointsRef.current;
    if (live.length < 2) return;

    const { currentColor, currentRadius, currentOpacity } = store.getState();

    if (!liveMesh.current) {
      liveMesh.current = createStrokeMesh(live, currentColor, currentRadius, currentOpacity);
      scene.add(liveMesh.current.mesh);
    } else {
      updateStrokeMesh(liveMesh.current, live, currentRadius);
    }
  }

  function doDrawEnd(): void {
    const pts = livePointsRef.current;

    // Run D-P simplification here (CPU work happens once per stroke, not per frame)
    const simplified = douglasPeucker(pts, DP_EPSILON);

    // Single store write — only here, not during drawing
    store.getState().commitStroke(simplified);

    livePointsRef.current = [];
    disposeLiveMesh();
    // The committed mesh will be added by the strokes subscriber above
  }

  // ── Imperative handle for hand-gesture path ────────────────────────────────
  useEffect(() => {
    handleRef.current = { onDrawStart: doDrawStart, onDrawMove: doDrawMove, onDrawEnd: doDrawEnd };
    return () => { handleRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, camera, handleRef]);

  // ── Mouse / touch listeners ────────────────────────────────────────────────
  useEffect(() => {
    if (!canvas) return;

    const toNorm = (clientX: number, clientY: number): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      return [(clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height];
    };

    let mouseDrawing = false;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (!store.getState().drawingEnabled) return;
      e.stopPropagation();
      mouseDrawing = true;
      const [px, py] = toNorm(e.clientX, e.clientY);
      doDrawStart(px, py);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!mouseDrawing) return;
      const [px, py] = toNorm(e.clientX, e.clientY);
      doDrawMove(px, py);
    };

    const onMouseUp = () => {
      if (!mouseDrawing) return;
      mouseDrawing = false;
      doDrawEnd();
    };

    const onTouchStart = (e: TouchEvent) => {
      if (!store.getState().drawingEnabled) return;
      if (e.touches.length !== 1) return;
      e.stopPropagation();
      const t = e.touches[0];
      const [px, py] = toNorm(t.clientX, t.clientY);
      doDrawStart(px, py);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!store.getState().drawingEnabled) return;
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const t = e.touches[0];
      const [px, py] = toNorm(t.clientX, t.clientY);
      doDrawMove(px, py);
    };

    const onTouchEnd = () => {
      if (!store.getState().drawingEnabled) return;
      doDrawEnd();
    };

    canvas.addEventListener('mousedown',  onMouseDown,  { capture: true });
    window.addEventListener('mousemove',  onMouseMove);
    window.addEventListener('mouseup',    onMouseUp);
    canvas.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
    canvas.addEventListener('touchmove',  onTouchMove,  { capture: true, passive: false });
    canvas.addEventListener('touchend',   onTouchEnd,   { capture: true });

    return () => {
      canvas.removeEventListener('mousedown',  onMouseDown,  { capture: true });
      window.removeEventListener('mousemove',  onMouseMove);
      window.removeEventListener('mouseup',    onMouseUp);
      canvas.removeEventListener('touchstart', onTouchStart, { capture: true });
      canvas.removeEventListener('touchmove',  onTouchMove,  { capture: true });
      canvas.removeEventListener('touchend',   onTouchEnd,   { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, scene, camera]);

  return null;
}

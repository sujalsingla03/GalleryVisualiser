/**
 * DrawingLayer — owns Three.js stroke meshes + mouse/touch drawing.
 *
 * Two input paths feed strokes:
 *   1. Hand gestures — SpaceScene calls onDrawStart/onDrawMove/onDrawEnd via
 *      the imperative handle (DrawingLayerHandle ref).
 *   2. Mouse / touch — this component attaches pointer/touch listeners directly
 *      to the Three.js canvas so drawing works without a webcam.
 *
 * Both paths are gated on drawingEnabled from drawingStore. When drawing mode
 * is off, all pointer events pass through to OrbitControls as normal.
 *
 * Live preview mesh is rebuilt on every drawMove. Committed strokes are static.
 * All geometry+material is disposed on undo / clearAll / unmount.
 */

import { useEffect, useRef } from 'react';
import type { Scene, PerspectiveCamera } from 'three';
import { useDrawingStore, type Stroke } from '../store/drawingStore';
import {
  createStrokeMesh,
  updateStrokeMesh,
  type StrokeMesh,
} from '../three/createStrokeMesh';
import { projectOntoDrawingPlane } from '../lib/drawingPlane';

export interface DrawingLayerHandle {
  onDrawStart: (px: number, py: number) => void;
  onDrawMove:  (px: number, py: number) => void;
  onDrawEnd:   () => void;
}

interface Props {
  scene:     Scene;
  camera:    PerspectiveCamera;
  handleRef: React.MutableRefObject<DrawingLayerHandle | null>;
  /** The Three.js canvas — used to attach mouse/touch listeners. */
  canvas:    HTMLCanvasElement | null;
}

export function DrawingLayer({ scene, camera, handleRef, canvas }: Props) {
  const meshMap  = useRef<Map<string, StrokeMesh>>(new Map());
  const liveMesh = useRef<StrokeMesh | null>(null);

  const store = useDrawingStore;

  // ── Sync committed strokes: add new, dispose removed ──────────────────────
  useEffect(() => {
    const unsub = store.subscribe((state, prev) => {
      const current  = new Set(state.strokes.map((s) => s.id));
      const previous = new Set(prev.strokes.map((s) => s.id));

      for (const stroke of state.strokes) {
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
      if (liveMesh.current) {
        scene.remove(liveMesh.current.mesh);
        liveMesh.current.dispose();
        liveMesh.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  function addCommittedMesh(stroke: Stroke): void {
    if (stroke.points.length < 2) return;
    const sm = createStrokeMesh(stroke.points, stroke.color, stroke.radius, stroke.opacity);
    scene.add(sm.mesh);
    meshMap.current.set(stroke.id, sm);
  }

  // ── Core draw helpers (shared by hand gesture + mouse/touch paths) ─────────
  function doDrawStart(px: number, py: number): void {
    const point = projectOntoDrawingPlane(px, py, camera);
    if (!point) return;
    store.getState().beginStroke(point);
    if (liveMesh.current) {
      scene.remove(liveMesh.current.mesh);
      liveMesh.current.dispose();
      liveMesh.current = null;
    }
  }

  function doDrawMove(px: number, py: number): void {
    const point = projectOntoDrawingPlane(px, py, camera);
    if (!point) return;
    store.getState().appendPoint(point);
    const { livePoints, currentColor, currentRadius, currentOpacity } = store.getState();
    if (livePoints.length < 2) return;
    if (!liveMesh.current) {
      liveMesh.current = createStrokeMesh(livePoints, currentColor, currentRadius, currentOpacity);
      scene.add(liveMesh.current.mesh);
    } else {
      updateStrokeMesh(liveMesh.current, livePoints, currentRadius);
    }
  }

  function doDrawEnd(): void {
    store.getState().commitStroke();
    if (liveMesh.current) {
      scene.remove(liveMesh.current.mesh);
      liveMesh.current.dispose();
      liveMesh.current = null;
    }
  }

  // ── Imperative handle for hand-gesture path ────────────────────────────────
  useEffect(() => {
    handleRef.current = {
      onDrawStart: doDrawStart,
      onDrawMove:  doDrawMove,
      onDrawEnd:   doDrawEnd,
    };
    return () => { handleRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, camera, handleRef]);

  // ── Mouse / touch listeners attached to the Three.js canvas ───────────────
  useEffect(() => {
    if (!canvas) return;

    /** Convert a clientX/Y to normalised [0,1] image-space coords. */
    const toNorm = (clientX: number, clientY: number): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      return [
        (clientX - rect.left) / rect.width,
        (clientY - rect.top)  / rect.height,
      ];
    };

    let mouseDrawing = false;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (!store.getState().drawingEnabled) return;
      e.stopPropagation(); // prevent OrbitControls from starting a pan/rotate
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

    // Touch drawing
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

/**
 * TubeGeometry-based 3D stroke mesh builder.
 *
 * Each stroke is a THREE.Mesh with TubeGeometry along a CatmullRomCurve3.
 * CatmullRom gives smooth curves through the raw points without extra
 * smoothing passes — appropriate for hand-gesture paths which are already
 * low-frequency after Douglas-Peucker simplification.
 *
 * Performance notes:
 * - tubularSegments is capped relative to point count to keep vertex budgets
 *   bounded (a 400-point stroke stays under ~8k triangles).
 * - Strokes do NOT use the OutlinePass / SMAA post-processing chain — they are
 *   added to the scene as plain MeshBasicMaterial geometry. On low-power mode
 *   where outline is null, strokes still render correctly and cheaply.
 * - Every mesh has an explicit .dispose() path (geometry + material) that must
 *   be called when the stroke is removed (clear / undo).
 */

import {
  Mesh,
  MeshBasicMaterial,
  TubeGeometry,
  CatmullRomCurve3,
  Color,
  type Vector3,
} from 'three';

export interface StrokeMesh {
  mesh: Mesh;
  dispose: () => void;
}

/**
 * Tubular segments per unit of path length.
 * Clamped between MIN_SEGS and MAX_SEGS regardless of point count.
 */
const SEGS_PER_POINT = 3;
const MIN_SEGS = 4;
const MAX_SEGS = 600;
/** Radial segments of the tube cross-section. 5 is round enough, cheap to render. */
const RADIAL_SEGS = 5;

/**
 * Build a TubeGeometry stroke mesh from an array of world-space points.
 *
 * @param points  At least 2 points. Caller is responsible for ensuring this.
 * @param color   CSS colour string, e.g. '#ffffff'.
 * @param radius  Tube radius in scene units.
 * @param opacity Opacity 0–1 (default 1).
 */
export function createStrokeMesh(
  points: readonly Vector3[],
  color: string,
  radius: number,
  opacity = 1,
): StrokeMesh {
  // CatmullRomCurve3 requires at least 2 points.
  const safePoints = points.length >= 2 ? points : [points[0], points[0]];

  const curve = new CatmullRomCurve3([...safePoints], false, 'catmullrom', 0.5);

  const tubularSegments = Math.max(
    MIN_SEGS,
    Math.min(MAX_SEGS, safePoints.length * SEGS_PER_POINT),
  );

  const geometry = new TubeGeometry(curve, tubularSegments, radius, RADIAL_SEGS, false);

  const material = new MeshBasicMaterial({
    color: new Color(color),
    toneMapped: false,
    transparent: opacity < 1,
    opacity,
  });

  const mesh = new Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  mesh.userData.kind = 'drawingStroke';

  return {
    mesh,
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * Rebuild the geometry of an existing StrokeMesh with new points.
 * Used for the live preview stroke (updated every drawMove frame).
 * Disposes the old geometry and replaces it in-place on the mesh.
 */
export function updateStrokeMesh(
  strokeMesh: StrokeMesh,
  points: readonly Vector3[],
  radius: number,
): void {
  if (points.length < 2) return;

  const curve = new CatmullRomCurve3([...points], false, 'catmullrom', 0.5);
  const tubularSegments = Math.max(
    MIN_SEGS,
    Math.min(MAX_SEGS, points.length * SEGS_PER_POINT),
  );

  // Dispose old geometry before replacing.
  strokeMesh.mesh.geometry.dispose();
  strokeMesh.mesh.geometry = new TubeGeometry(
    curve,
    tubularSegments,
    radius,
    RADIAL_SEGS,
    false,
  );
}

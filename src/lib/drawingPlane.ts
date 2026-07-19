/**
 * Depth-placement math for 3D drawing strokes.
 *
 * ## Method chosen: Fixed drawing plane at configurable distance from camera
 *
 * ### Why fixed plane, not raycast-onto-card?
 *
 * The raycast-onto-card approach would be more spatially accurate when the
 * fingertip visually overlaps a card, but it has two practical problems in this
 * pipeline:
 *
 *   1. **Depth ambiguity** — MediaPipe's z landmark is camera-relative and
 *      poorly calibrated at typical webcam distances. We cannot reliably decide
 *      "is the fingertip in front of or behind a card?" without a depth camera.
 *      Using a raycast that depends on 2D screen proximity would let strokes
 *      snap onto cards in unexpected ways, breaking the "drawing in space" feel.
 *
 *   2. **Empty-space strokes** — most drawings start away from any card. A
 *      raycast fallback to the fixed plane would create a seam whenever the
 *      stroke crosses a card boundary (depth jumps discontinuously), producing
 *      distorted geometry.
 *
 * A fixed plane gives perfectly smooth, continuous strokes regardless of what
 * is behind the hand, and is trivially unit-testable (deterministic math, no
 * scene state needed).
 *
 * ### Plane definition
 *
 * The drawing plane is a world-space plane perpendicular to the camera's view
 * direction, centred at:
 *
 *   planeOrigin = cameraPosition + cameraForward * DRAWING_PLANE_DISTANCE
 *
 * For each frame, we unproject the normalized image-space pointer (px, py) as
 * a ray from the camera, then intersect it with this plane. The intersection
 * point becomes the next stroke vertex.
 *
 * ### Configurable distance
 *
 * `DRAWING_PLANE_DISTANCE` is exported so callers can override it (e.g. from
 * a future HUD slider) without touching this file.
 */

import { Vector3, type PerspectiveCamera } from 'three';

/** Scene units in front of the camera where the drawing plane sits. */
export const DRAWING_PLANE_DISTANCE = 6;

/**
 * Project a normalized image-space pointer onto the fixed drawing plane.
 *
 * @param px        Normalized x in [0,1] (mirrored: 0 = left of frame).
 * @param py        Normalized y in [0,1] (0 = top of frame).
 * @param camera    The live Three.js PerspectiveCamera.
 * @param distance  Distance from camera to the plane (default: DRAWING_PLANE_DISTANCE).
 * @returns         World-space point on the drawing plane, or null if the ray is
 *                  parallel to the plane (degenerate, should never occur in practice).
 */
export function projectOntoDrawingPlane(
  px: number,
  py: number,
  camera: PerspectiveCamera,
  distance: number = DRAWING_PLANE_DISTANCE,
): Vector3 | null {
  // Convert normalized image coords → NDC → world-space ray direction.
  const ndcX = px * 2 - 1;
  const ndcY = 1 - py * 2;

  // Unproject a point on the near plane to get the ray direction.
  const rayTarget = new Vector3(ndcX, ndcY, 0.5).unproject(camera);
  const rayOrigin = camera.position.clone();
  const rayDir = rayTarget.sub(rayOrigin).normalize();

  // The plane's normal is the camera's forward direction (negated: camera looks down -Z).
  const planeNormal = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();

  // Plane origin: a point on the plane at the configured distance.
  const planeOrigin = camera.position.clone().addScaledVector(planeNormal, distance);

  // Ray-plane intersection: t = ((planeOrigin - rayOrigin) · planeNormal) / (rayDir · planeNormal)
  const denom = rayDir.dot(planeNormal);
  if (Math.abs(denom) < 1e-6) {
    // Ray is parallel to the plane — degenerate, return null.
    return null;
  }

  const t = planeOrigin.clone().sub(rayOrigin).dot(planeNormal) / denom;
  if (t < 0) {
    // Intersection behind the camera — shouldn't happen with a forward plane, but guard it.
    return null;
  }

  return rayOrigin.clone().addScaledVector(rayDir, t);
}

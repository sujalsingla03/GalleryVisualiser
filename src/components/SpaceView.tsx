import { CameraLayer } from './CameraLayer';
import { SpaceScene } from './SpaceScene';
import { SpaceHud } from './SpaceHud';
import { PhotoLightbox } from './PhotoLightbox';
import { SpaceTips } from './SpaceTips';

/** Lazy-loaded so Three.js / MediaPipe stay out of the landing bundle. */
export function SpaceView() {
  return (
    <>
      <CameraLayer />
      <SpaceScene />
      <SpaceHud />
      <SpaceTips />
      <PhotoLightbox />
    </>
  );
}

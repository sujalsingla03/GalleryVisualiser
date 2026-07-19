import type { Camera } from 'three';
import { MOUSE, TOUCH } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { isCoarsePointer } from '../lib/device';

export interface ControlsBundle {
  controls: OrbitControls;
  update: () => void;
  dispose: () => void;
}

export function setupControls(camera: Camera, dom: HTMLElement): ControlsBundle {
  const controls = new OrbitControls(camera, dom);
  const mobile = isCoarsePointer();

  controls.enableDamping = true;
  controls.dampingFactor = 0.18;
  controls.enablePan = true;
  controls.enableZoom = false; // smooth zoom handled in SpaceScene
  controls.panSpeed = 1.0;
  controls.rotateSpeed = mobile ? 0.55 : 0.7;
  controls.screenSpacePanning = true;
  controls.minDistance = 0.01;
  controls.maxDistance = 5000;

  if (mobile) {
    // Phone: drag to orbit the cloud, two fingers to pan; pinch zoom is custom.
    controls.enableRotate = true;
    controls.mouseButtons = {
      LEFT: MOUSE.ROTATE,
      MIDDLE: MOUSE.PAN,
      RIGHT: MOUSE.PAN,
    };
    controls.touches = {
      ONE: TOUCH.ROTATE,
      TWO: TOUCH.PAN,
    };
  } else {
    // Desktop: drag pans (mouse-wheel / trackpad zoom elsewhere).
    controls.enableRotate = false;
    controls.mouseButtons = {
      LEFT: MOUSE.PAN,
      MIDDLE: MOUSE.PAN,
      RIGHT: MOUSE.PAN,
    };
    controls.touches = {
      ONE: TOUCH.PAN,
      TWO: TOUCH.PAN,
    };
  }

  return {
    controls,
    update: () => controls.update(),
    dispose: () => controls.dispose(),
  };
}

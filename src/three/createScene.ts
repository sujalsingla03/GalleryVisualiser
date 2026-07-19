import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  ACESFilmicToneMapping,
  FogExp2,
  Color,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { createOutlinePass } from './passes/outlinePassFactory';
import { preferLowPowerMedia } from '../lib/device';

export interface SceneBundle {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  composer: EffectComposer;
  outline: OutlinePass | null;
  lowPower: boolean;
  resize: (w: number, h: number) => void;
  dispose: () => void;
  setPixelRatioCap: (cap: number) => void;
}

export function createScene(canvas: HTMLCanvasElement): SceneBundle {
  const lowPower = preferLowPowerMedia();
  if (import.meta.env.DEV) {
    console.info(
      `[GallerySphere] low-power=${lowPower} dprCap=${lowPower ? 1.5 : 2} smaa=${!lowPower} outline=${!lowPower}`,
    );
  }

  const scene = new Scene();
  scene.background = null;
  scene.fog = new FogExp2(new Color(0xdde8e4).getHex(), lowPower ? 0.018 : 0.012);

  const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.set(0, 0, 8);

  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: true,
    powerPreference: lowPower ? 'low-power' : 'high-performance',
    preserveDrawingBuffer: true, // needed for local snapshot export
  });
  let dprCap = lowPower ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  renderPass.clearAlpha = 0;
  composer.addPass(renderPass);

  // OutlinePass is expensive — skip entirely on low-power devices.
  let outline: OutlinePass | null = null;
  if (!lowPower) {
    outline = createOutlinePass(scene, camera, window.innerWidth, window.innerHeight);
    composer.addPass(outline);
  }

  if (!lowPower) {
    const smaa = new SMAAPass(window.innerWidth, window.innerHeight);
    composer.addPass(smaa);
  }

  composer.addPass(new OutputPass());

  function resize(w: number, h: number) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
  }

  function setPixelRatioCap(cap: number) {
    dprCap = cap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
  }

  function dispose() {
    composer.dispose();
    renderer.dispose();
  }

  return { scene, camera, renderer, composer, outline, lowPower, resize, dispose, setPixelRatioCap };
}

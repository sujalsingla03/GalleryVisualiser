import { useEffect, useRef } from 'react';
import {
  Group,
  Raycaster,
  Vector2,
  type Object3D,
  type Intersection,
} from 'three';
import { createScene } from '../three/createScene';
import { createStarField } from '../three/createStarField';
import { createPhotoCard, type PhotoCard } from '../three/createPhotoCard';
import { setupControls } from '../three/orbitControlsFactory';
import { computeLayout } from '../lib/computeLayout';
import { usePhotoStore } from '../store/photoStore';

function pickGridDims(count: number): { cols: number; rows: number } {
  const perLayerTarget = Math.max(6, Math.ceil(Math.sqrt(count) * 1.2));
  const cols = Math.max(2, Math.ceil(Math.sqrt(perLayerTarget)));
  const rows = Math.max(2, Math.ceil(perLayerTarget / cols));
  return { cols, rows };
}

export function SpaceScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photos = usePhotoStore((s) => s.photos);
  const setSelected = usePhotoStore((s) => s.setSelected);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bundle = createScene(canvas);
    const { scene, camera, composer, outline, resize } = bundle;

    const stars = createStarField(2500, 80);
    scene.add(stars.points);

    const cardsRoot = new Group();
    scene.add(cardsRoot);

    const cards: PhotoCard[] = [];
    if (photos.length > 0) {
      const { cols, rows } = pickGridDims(photos.length);
      const slots = computeLayout(photos.length, {
        cols,
        rows,
        spacing: 1.6,
        jitter: 0.35,
      });
      for (let i = 0; i < photos.length; i++) {
        const card = createPhotoCard(photos[i]);
        const { x, y, z } = slots[i].position;
        card.group.position.set(x, y, z);
        cardsRoot.add(card.group);
        cards.push(card);
      }
    }

    if (cards.length > 0) {
      const span = Math.max(2, Math.cbrt(cards.length) * 1.6);
      camera.position.set(0, 0, span * 2.5);
      camera.lookAt(0, 0, 0);
    }

    const controlsBundle = setupControls(camera, canvas);

    const targets: Object3D[] = cards.map((c) => c.mesh);

    const raycaster = new Raycaster();
    const pointer = new Vector2();
    let pointerInCanvas = false;
    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      pointerInCanvas = true;
    };
    const onPointerLeave = () => {
      pointerInCanvas = false;
    };
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);

    const onClick = () => {
      if (!pointerInCanvas) return;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length > 0) {
        const id = hits[0].object.userData.photoId as string | undefined;
        if (id) setSelected(id);
      }
    };
    canvas.addEventListener('click', onClick);

    const onResize = () => resize(window.innerWidth, window.innerHeight);
    onResize();
    window.addEventListener('resize', onResize);

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      controlsBundle.update();

      for (const c of cards) {
        c.group.quaternion.copy(camera.quaternion);
      }

      if (pointerInCanvas) {
        raycaster.setFromCamera(pointer, camera);
        const hits: Intersection[] = raycaster.intersectObjects(targets, false);
        outline.selectedObjects = hits.length > 0 ? [hits[0].object] : [];
      } else {
        outline.selectedObjects = [];
      }

      composer.render();
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('click', onClick);
      controlsBundle.dispose();
      cards.forEach((c) => c.dispose());
      stars.dispose();
      bundle.dispose();
    };
  }, [photos, setSelected]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100vw', height: '100vh', display: 'block', cursor: 'grab' }}
    />
  );
}

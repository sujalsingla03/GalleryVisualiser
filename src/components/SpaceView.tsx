import { useRef, useState, useEffect } from 'react';
import { CameraLayer } from './CameraLayer';
import { SpaceScene, type SceneContextRef } from './SpaceScene';
import { SpaceHud } from './SpaceHud';
import { PhotoLightbox } from './PhotoLightbox';
import { SpaceTips } from './SpaceTips';
import { DrawingLayer, type DrawingLayerHandle } from './DrawingLayer';
import { DrawingPanel } from './DrawingPanel';
import { FingerCursor } from './FingerCursor';
import { DrawFab } from './DrawFab';
import type { PerspectiveCamera, Scene } from 'three';

export function SpaceView() {
  const drawingHandleRef = useRef<DrawingLayerHandle | null>(null);
  const sceneContextRef  = useRef<SceneContextRef>({ scene: null, camera: null, canvas: null });

  const [sceneReady, setSceneReady]       = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (sceneContextRef.current.scene && sceneContextRef.current.camera) {
        setSceneReady(true);
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const scene  = sceneContextRef.current.scene  as Scene            | null;
  const camera = sceneContextRef.current.camera as PerspectiveCamera | null;
  const canvas = sceneContextRef.current.canvas as HTMLCanvasElement | null;

  return (
    <>
      <CameraLayer />
      <SpaceScene
        drawingHandleRef={drawingHandleRef}
        sceneContextRef={sceneContextRef}
      />

      {/* Three.js stroke meshes + mouse/touch input */}
      {sceneReady && scene && camera && (
        <DrawingLayer
          scene={scene}
          camera={camera}
          handleRef={drawingHandleRef}
          canvas={canvas}
        />
      )}

      {/* Drawing tool palette — visible when panelOpen */}
      <DrawingPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
      />

      {/* Live finger-tip cursor overlay (hand-tracking only) */}
      <FingerCursor />

      {/* Bottom-right corner draw FAB */}
      <DrawFab onOpenPanel={() => setPanelOpen(true)} />

      {/* Pass setPanelOpen down so the HUD ✏ button can toggle the panel */}
      <SpaceHud
        onToggleDrawPanel={() => setPanelOpen((v) => !v)}
        drawPanelOpen={panelOpen}
      />
      <SpaceTips />
      <PhotoLightbox />
    </>
  );
}

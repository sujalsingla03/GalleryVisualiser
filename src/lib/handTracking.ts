import type { HandFrame, HandLandmark } from './gestureRecognizer';
import { preferLowPowerMedia } from './device';

/** Same-origin assets — never load WASM/models from a CDN. */
const WASM_BASE = `${import.meta.env.BASE_URL}mediapipe/wasm`;
const MODEL_URL = `${import.meta.env.BASE_URL}mediapipe/hand_landmarker.task`;

export type HandStartPhase = 'camera' | 'model';

type FrameListener = (frame: HandFrame) => void;

export class HandTracker {
  private landmarker: Awaited<
    ReturnType<typeof import('@mediapipe/tasks-vision').HandLandmarker.createFromOptions>
  > | null = null;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private listeners = new Set<FrameListener>();
  private running = false;
  private rafHandle: number | null = null;
  private frameSkip = 0;
  private lowPower = false;

  /**
   * Start webcam + load MediaPipe model. Resolves once tracking is live.
   * Throws if webcam permission denied or model fails to load.
   * MediaPipe is dynamically imported so the landing page stays lean.
   */
  async start(onPhase?: (phase: HandStartPhase) => void): Promise<void> {
    if (this.running) return;

    this.lowPower = preferLowPowerMedia();

    onPhase?.('camera');
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: this.lowPower ? 640 : 960 },
        height: { ideal: this.lowPower ? 480 : 540 },
        facingMode: 'user',
        frameRate: { ideal: this.lowPower ? 24 : 30, max: 30 },
      },
      audio: false,
    });
    this.video = document.createElement('video');
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.setAttribute('playsinline', 'true');
    this.video.setAttribute('webkit-playsinline', 'true');
    await this.video.play();

    onPhase?.('model');
    const { HandLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);

    let landmarker;
    try {
      landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
      });
    } catch {
      // Some mobile GPUs reject the GPU delegate — fall back to CPU.
      landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
      });
    }
    this.landmarker = landmarker;

    this.running = true;
    this.frameSkip = 0;
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.rafHandle != null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.landmarker) {
      this.landmarker.close();
      this.landmarker = null;
    }
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
  }

  onFrame(listener: FrameListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.video;
  }

  private tick = (): void => {
    if (!this.running || !this.landmarker || !this.video) return;

    // On phones, run inference every other frame to keep the UI smooth.
    const skipRate = this.lowPower ? 2 : 1;
    this.frameSkip = (this.frameSkip + 1) % skipRate;

    if (this.frameSkip === 0 && this.video.readyState >= 2) {
      const result = this.landmarker.detectForVideo(this.video, performance.now());

      const hands = result.landmarks.map((landmarks, i) => ({
        landmarks: landmarks.map(
          (l) => ({ x: 1 - l.x, y: l.y, z: l.z }) as HandLandmark,
        ),
        handedness: (result.handedness[i]?.[0]?.categoryName ?? 'Right') as 'Left' | 'Right',
      }));

      const frame: HandFrame = { hands, timestamp: performance.now() };
      this.listeners.forEach((l) => l(frame));
    }
    this.rafHandle = requestAnimationFrame(this.tick);
  };
}

export const handTracker = new HandTracker();

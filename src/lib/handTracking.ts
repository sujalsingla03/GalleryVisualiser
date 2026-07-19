import type { HandFrame, HandLandmark } from './gestureRecognizer';
import { preferLowPowerMedia } from './device';
import { isDebugQuery } from './motion';

/** Same-origin assets — never load WASM/models from a CDN. */
const WASM_BASE = `${import.meta.env.BASE_URL}mediapipe/wasm`;
const MODEL_URL = `${import.meta.env.BASE_URL}mediapipe/hand_landmarker.task`;

export type HandStartPhase = 'camera' | 'model';

type FrameListener = (frame: HandFrame) => void;

// ---------------------------------------------------------------------------
// [DEBUG] Landmark inference rate monitor
// Activated only when ?debug=1 is in the URL.
// ---------------------------------------------------------------------------
class LandmarkRateMonitor {
  private enabled: boolean;
  private count = 0;
  private windowStart = 0;
  /** Most recently measured inference Hz. Read by SpaceScene for the overlay. */
  hz = 0;

  constructor() {
    this.enabled = isDebugQuery();
  }

  tick(nowMs: number): void {
    if (!this.enabled) return;
    if (this.windowStart === 0) {
      this.windowStart = nowMs;
    }
    this.count++;
    const elapsed = nowMs - this.windowStart;
    if (elapsed >= 1000) {
      this.hz = Math.round((this.count * 1000) / elapsed);
      console.info(`[DEBUG][HandTracker] landmark-inference Hz=${this.hz}`);
      this.count = 0;
      this.windowStart = nowMs;
    }
  }

  /** Log the actual video resolution that MediaPipe is receiving. */
  logFeedResolution(video: HTMLVideoElement): void {
    if (!this.enabled) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    console.info(
      `[DEBUG][HandTracker] camera-feed resolution fed to MediaPipe: ${vw}×${vh}` +
        ` (readyState=${video.readyState}, lowPower=${preferLowPowerMedia()})`,
    );
  }

  reset(): void {
    this.count = 0;
    this.windowStart = 0;
    this.hz = 0;
  }
}

export const landmarkRateMonitor = new LandmarkRateMonitor();

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
  /** How many consecutive rAF ticks have been skipped (for debug/5 — feed resolution check). */
  private debugResLoggedAt = 0;

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
    landmarkRateMonitor.reset();

    this.running = true;
    this.frameSkip = 0;
    this.debugResLoggedAt = 0;
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
      const now = performance.now();

      // [DEBUG] Diagnostic 5 — log camera feed resolution periodically so we can confirm
      // adaptive quality stepdown does NOT change what MediaPipe actually reads.
      // Log once at start and then every 5 s.
      if (isDebugQuery() && now - this.debugResLoggedAt > 5000) {
        landmarkRateMonitor.logFeedResolution(this.video);
        this.debugResLoggedAt = now;
      }

      const result = this.landmarker.detectForVideo(this.video, now);

      const hands = result.landmarks.map((landmarks, i) => ({
        landmarks: landmarks.map(
          (l) => ({ x: 1 - l.x, y: l.y, z: l.z }) as HandLandmark,
        ),
        handedness: (result.handedness[i]?.[0]?.categoryName ?? 'Right') as 'Left' | 'Right',
      }));

      const frame: HandFrame = { hands, timestamp: performance.now() };

      // [DEBUG] Diagnostic 1 — track inference rate
      landmarkRateMonitor.tick(frame.timestamp);

      this.listeners.forEach((l) => l(frame));
    }
    this.rafHandle = requestAnimationFrame(this.tick);
  };
}

export const handTracker = new HandTracker();

/**
 * Copies MediaPipe WASM from node_modules into public/ so hand tracking
 * loads from the same origin (no CDN). Run automatically via postinstall.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcWasm = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const destDir = join(root, 'public', 'mediapipe');
const destWasm = join(destDir, 'wasm');
const modelPath = join(destDir, 'hand_landmarker.task');
const modelUrl =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

if (!existsSync(srcWasm)) {
  console.warn('[sync-mediapipe] @mediapipe/tasks-vision not installed — skip WASM copy');
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
cpSync(srcWasm, destWasm, { recursive: true });
console.log('[sync-mediapipe] WASM copied to public/mediapipe/wasm');

if (!existsSync(modelPath)) {
  console.log('[sync-mediapipe] Downloading hand_landmarker.task…');
  const res = await fetch(modelUrl);
  if (!res.ok) {
    console.error(`[sync-mediapipe] Model download failed: ${res.status}`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const { writeFileSync } = await import('node:fs');
  writeFileSync(modelPath, buf);
  console.log(`[sync-mediapipe] Model saved (${(buf.length / 1e6).toFixed(1)} MB)`);
} else {
  console.log('[sync-mediapipe] Model already present');
}

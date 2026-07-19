import { useCallback, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { FrostPanel } from './ui/FrostPanel';
import { useViewStore } from '../store/viewStore';
import { usePhotoStore } from '../store/photoStore';
import { loadPhotoWithHash } from '../lib/loadPhoto';

const ACCEPTED_EXT = /\.(jpe?g|png|webp)$/i;
const ACCEPTED_MIME = /^image\/(jpeg|png|webp)$/i;
const DECODE_CONCURRENCY = 4;

function isImageFile(file: File): boolean {
  if (ACCEPTED_MIME.test(file.type)) return true;
  if (file.type === '' || file.type === 'application/octet-stream') {
    return ACCEPTED_EXT.test(file.name);
  }
  return ACCEPTED_EXT.test(file.name);
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onItemDone?: (completed: number, total: number) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let completed = 0;

  async function run(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
      completed += 1;
      onItemDone?.(completed, items.length);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}

export function LandingScreen() {
  const setView = useViewStore((s) => s.setView);
  const setProgress = useViewStore((s) => s.setProgress);
  const setPhotos = usePhotoStore((s) => s.setPhotos);
  const [dragOver, setDragOver] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const ingest = useCallback(
    async (files: File[]) => {
      const images = files.filter(isImageFile);
      if (images.length === 0) return;

      setProgress(0, images.length);
      setView('processing');

      type Loaded = Awaited<ReturnType<typeof loadPhotoWithHash>>;
      const settled = await mapPool(
        images,
        DECODE_CONCURRENCY,
        async (file) => {
          try {
            return await loadPhotoWithHash(file);
          } catch (err) {
            console.warn(`Skipping ${file.name}:`, err);
            return null;
          }
        },
        (done, total) => setProgress(done, total),
      );

      const photos: Loaded['photo'][] = [];
      const accepted: File[] = [];
      const hashes: string[] = [];
      for (let i = 0; i < settled.length; i++) {
        const r = settled[i];
        if (!r) continue;
        photos.push(r.photo);
        accepted.push(images[i]);
        hashes.push(r.contentHash);
      }
      setPhotos(photos, accepted, hashes);
      setView('space');
    },
    [setView, setProgress, setPhotos],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      ingest(Array.from(e.dataTransfer.files));
    },
    [ingest],
  );

  const onPick = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      ingest(Array.from(files));
      e.target.value = '';
    },
    [ingest],
  );

  return (
    <div className="landing-root w-full h-full flex flex-col items-center justify-center gap-5 sm:gap-8 px-4 sm:px-6">
      <div className="flex flex-col items-center gap-2 sm:gap-3 text-center max-w-2xl">
        <p className="landing-brand">PinViz</p>
        <p className="landing-tagline">
          Your photos in a private 3D gallery — works great on phone. Nothing is uploaded.
        </p>
      </div>

      <FrostPanel className={`landing-drop${dragOver ? ' is-dragover' : ''}`}>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className="landing-drop-label"
        >
          <input
            ref={galleryRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            onChange={onPick}
            style={{ display: 'none' }}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPick}
            style={{ display: 'none' }}
          />
          <div className="landing-drop-title">
            <span className="landing-drop-desktop">Drop photos here</span>
            <span className="landing-drop-mobile">Add photos to start</span>
          </div>
          <div className="landing-drop-hint">
            JPG, PNG, or WebP. Everything stays on this device.
          </div>
          <div className="landing-actions">
            <button
              type="button"
              className="landing-action primary"
              onClick={() => galleryRef.current?.click()}
            >
              Choose from gallery
            </button>
            <button
              type="button"
              className="landing-action"
              onClick={() => cameraRef.current?.click()}
            >
              Take a photo
            </button>
          </div>
        </div>
      </FrostPanel>

      <div className="landing-howto">
        <div className="landing-howto-title">On your phone</div>
        <ol>
          <li>Open this site in Chrome / Safari</li>
          <li>Add photos from gallery or camera</li>
          <li>Drag to spin · pinch to zoom · tap to open</li>
          <li>Try Orbit, Cloud/Grid/Wall, and optional Hands AR</li>
        </ol>
      </div>

      <p className="landing-badge">Local · Private · Mobile-ready</p>
    </div>
  );
}

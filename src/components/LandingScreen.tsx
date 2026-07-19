import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { FrostPanel } from './ui/FrostPanel';
import { useViewStore } from '../store/viewStore';
import { usePhotoStore } from '../store/photoStore';
import { loadPhotoWithHash } from '../lib/loadPhoto';
import {
  loadSpaceSession,
  blobToCanvas,
  type SavedSpaceMeta,
} from '../lib/sessionStore';
import type { Photo } from '../types/photo';

const ACCEPTED_EXT = /\.(jpe?g|png|webp)$/i;
const ACCEPTED_MIME = /^image\/(jpeg|png|webp)$/i;
const DECODE_CONCURRENCY = 4;
const MAX_PHOTOS = 400;

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
  const setLayout = usePhotoStore((s) => s.setLayout);
  const [dragOver, setDragOver] = useState(false);
  const [limitMsg, setLimitMsg] = useState<string | null>(null);
  const [savedMeta, setSavedMeta] = useState<SavedSpaceMeta | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadSpaceSession()
      .then((rec) => {
        if (!cancelled && rec) {
          setSavedMeta({
            savedAt: rec.savedAt,
            photoCount: rec.photoCount,
            layoutMode: rec.layoutMode,
          });
        }
      })
      .catch(() => {
        /* IndexedDB unavailable */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ingest = useCallback(
    async (files: File[]) => {
      let images = files.filter(isImageFile);
      if (images.length === 0) return;

      if (images.length > MAX_PHOTOS) {
        setLimitMsg(`Only the first ${MAX_PHOTOS} photos will be used (${images.length} selected).`);
        images = images.slice(0, MAX_PHOTOS);
      } else {
        setLimitMsg(null);
      }

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

  const continueSaved = useCallback(async () => {
    const rec = await loadSpaceSession();
    if (!rec) return;
    setProgress(0, rec.photoCount);
    setView('processing');
    const photos: Photo[] = [];
    for (let i = 0; i < rec.canvases.length; i++) {
      const canvas = await blobToCanvas(rec.canvases[i]);
      const blobUrl = URL.createObjectURL(rec.canvases[i]);
      photos.push({
        id: `saved-${i}-${rec.names[i]}`,
        name: rec.names[i] ?? `photo-${i}`,
        blobUrl,
        canvas,
        aspectRatio: rec.aspects[i] ?? canvas.width / canvas.height,
      });
      setProgress(i + 1, rec.photoCount);
    }
    setPhotos(photos, [], photos.map((_, i) => `saved-${i}`));
    setLayout(rec.layout);
    setView('space');
  }, [setView, setProgress, setPhotos, setLayout]);

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
        <p className="landing-brand">GallerySphere</p>
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
            JPG, PNG, or WebP · up to {MAX_PHOTOS} photos · stays on this device
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

      {savedMeta && (
        <button type="button" className="landing-action primary" onClick={() => void continueSaved()}>
          Continue saved space ({savedMeta.photoCount} photos)
        </button>
      )}

      {limitMsg && (
        <p className="landing-limit" role="status">
          {limitMsg}
        </p>
      )}

      <div className="landing-howto">
        <div className="landing-howto-title">On your phone</div>
        <ol>
          <li>Open this site in Chrome / Safari (HTTPS)</li>
          <li>Add photos from gallery or camera</li>
          <li>Drag to spin · pinch to zoom · tap to open</li>
          <li>Use Orbit, layouts, Save, and optional Hands AR</li>
        </ol>
      </div>

      <p className="landing-badge">Local · Private · Mobile-ready</p>
    </div>
  );
}

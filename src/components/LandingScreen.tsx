import { useCallback, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { FrostPanel } from './ui/FrostPanel';
import { useViewStore } from '../store/viewStore';
import { usePhotoStore } from '../store/photoStore';
import { loadPhotoWithHash } from '../lib/loadPhoto';

const ACCEPTED = /\.(jpe?g|png|webp)$/i;
const DECODE_CONCURRENCY = 4;

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

  const ingest = useCallback(
    async (files: File[]) => {
      const jpgs = files.filter((f) => ACCEPTED.test(f.name));
      if (jpgs.length === 0) return;

      setProgress(0, jpgs.length);
      setView('processing');

      type Loaded = Awaited<ReturnType<typeof loadPhotoWithHash>>;
      const settled = await mapPool(
        jpgs,
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
        accepted.push(jpgs[i]);
        hashes.push(r.contentHash);
      }
      setPhotos(photos, accepted, hashes);
      setView('space');
    },
    [setView, setProgress, setPhotos],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      setDragOver(false);
      const items = e.dataTransfer.files;
      ingest(Array.from(items));
    },
    [ingest],
  );

  const onPick = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      ingest(Array.from(files));
    },
    [ingest],
  );

  return (
    <div className="landing-root w-full h-full flex flex-col items-center justify-center gap-8 px-6">
      <div className="flex flex-col items-center gap-3 text-center max-w-2xl">
        <p
          className="landing-brand"
          style={{
            fontSize: 'var(--font-size-hero-large)',
            fontWeight: 700,
            letterSpacing: '-0.03em',
            color: 'var(--text-primary)',
          }}
        >
          PinViz
        </p>
        <p
          style={{
            fontSize: 'var(--font-size-lg)',
            color: 'var(--text-secondary)',
            maxWidth: 480,
            lineHeight: 1.5,
          }}
        >
          Your photos, floating in your space — private AR that never leaves this device.
        </p>
      </div>

      <FrostPanel
        className="landing-drop"
        style={{
          width: 'min(560px, 90vw)',
          padding: '48px 32px',
          textAlign: 'center',
          borderStyle: 'dashed',
          borderColor: dragOver ? 'var(--color-accent)' : 'var(--border-medium)',
          transition: `border-color var(--duration-color) var(--ease-translate), transform var(--duration-color) var(--ease-translate)`,
          transform: dragOver ? 'scale(1.01)' : 'scale(1)',
        }}
      >
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={{ display: 'block', cursor: 'pointer' }}
        >
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            onChange={onPick}
            style={{ display: 'none' }}
          />
          <div
            style={{
              fontSize: 'var(--font-size-xl)',
              color: 'var(--text-primary)',
              marginBottom: 8,
            }}
          >
            Drop photos here
          </div>
          <div
            style={{
              fontSize: 'var(--font-size-md)',
              color: 'var(--text-tertiary)',
              lineHeight: 1.5,
            }}
          >
            JPG, PNG, or WebP. Click to browse. No accounts, no uploads, no network —
            everything stays in memory on your machine.
          </div>
        </label>
      </FrostPanel>

      <p
        style={{
          fontSize: 'var(--font-size-sm)',
          color: 'var(--text-tertiary)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        Local · Private · Offline-ready
      </p>
    </div>
  );
}

import { useCallback, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { FrostPanel } from './ui/FrostPanel';
import { useSpaceStore } from '../store/spaceStore';
import { useViewStore } from '../store/viewStore';
import { usePhotoStore } from '../store/photoStore';
import { loadPhotoWithHash } from '../lib/loadPhoto';
import type { PhotoSlot } from '../lib/computeLayout';
import type { Photo } from '../types/photo';

const ACCEPTED = /\.(jpe?g|png|webp)$/i;

export function ReattachScreen() {
  const space = useSpaceStore((s) => s.pendingSpace);
  const setView = useViewStore((s) => s.setView);
  const setProgress = useViewStore((s) => s.setProgress);
  const setPhotos = usePhotoStore((s) => s.setPhotos);
  const setLayout = usePhotoStore((s) => s.setLayout);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ingest = useCallback(
    async (files: File[]) => {
      if (!space) return;
      const candidates = files.filter((f) => ACCEPTED.test(f.name));
      if (candidates.length === 0) {
        setError('No JPG/PNG/WebP files in that selection.');
        return;
      }
      setError(null);
      setProgress(0, space.photo_meta.length);
      setView('processing');

      // Index saved meta by content hash for matching
      const metaByHash = new Map(space.photo_meta.map((m) => [m.contentHash, m]));

      const matchedPhotos: Photo[] = [];
      const matchedSlots: PhotoSlot[] = [];
      let processed = 0;

      for (const file of candidates) {
        try {
          const { photo, contentHash } = await loadPhotoWithHash(file);
          const meta = metaByHash.get(contentHash);
          if (meta) {
            matchedPhotos.push(photo);
            matchedSlots.push({
              index: matchedPhotos.length - 1,
              position: meta.position,
              scale: meta.scale,
            });
            metaByHash.delete(contentHash);
          }
        } catch (err) {
          console.warn(`Skipping ${file.name}:`, err);
        }
        processed++;
        setProgress(Math.min(processed, space.photo_meta.length), space.photo_meta.length);
      }

      if (matchedPhotos.length === 0) {
        setError(
          `No photos in that folder match this saved space. ` +
            `Make sure you're picking the same files you originally dropped.`,
        );
        setView('reattach');
        return;
      }

      setPhotos(matchedPhotos, matchedSlots.map(() => ''));
      setLayout(matchedSlots);
      setView('space');
    },
    [space, setView, setProgress, setPhotos, setLayout],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLLabelElement>) => {
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
    },
    [ingest],
  );

  if (!space) {
    setView('spaces-list');
    return null;
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-8 px-6">
      <div className="flex flex-col items-center gap-3 text-center max-w-2xl">
        <h1
          style={{
            fontSize: 'var(--font-size-hero-medium)',
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          {space.name}
        </h1>
        <p
          style={{
            fontSize: 'var(--font-size-lg)',
            color: 'var(--text-secondary)',
            maxWidth: 520,
          }}
        >
          Drop the same folder you used to create this space ({space.photo_meta.length} photos).
          Photos stay on your device — we just match them to the saved layout.
        </p>
      </div>

      <FrostPanel
        style={{
          width: 'min(560px, 90vw)',
          padding: '48px 32px',
          textAlign: 'center',
          borderStyle: 'dashed',
          borderColor: dragOver ? 'var(--color-accent)' : 'var(--border-medium)',
          transition: 'border-color var(--duration-color) var(--ease-translate)',
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
            Drop the photos here
          </div>
          <div
            style={{
              fontSize: 'var(--font-size-md)',
              color: 'var(--text-tertiary)',
              lineHeight: 1.5,
            }}
          >
            JPG, PNG, or WebP. We match by content hash, so renamed files still work.
          </div>
        </label>
      </FrostPanel>

      {error && (
        <div style={{ color: 'var(--color-system-red)', fontSize: 'var(--font-size-md)', textAlign: 'center', maxWidth: 520 }}>
          {error}
        </div>
      )}

      <button
        onClick={() => setView('spaces-list')}
        style={{
          background: 'transparent',
          color: 'var(--text-tertiary)',
          border: 'none',
          fontSize: 'var(--font-size-md)',
          cursor: 'pointer',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        ← Back to spaces
      </button>
    </div>
  );
}

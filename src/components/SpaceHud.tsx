import { useState } from 'react';
import { FrostPanel } from './ui/FrostPanel';
import { useViewStore } from '../store/viewStore';
import { usePhotoStore } from '../store/photoStore';
import { SaveSpaceModal } from './SaveSpaceModal';

export function SpaceHud() {
  const setView = useViewStore((s) => s.setView);
  const triggerReset = useViewStore((s) => s.triggerReset);
  const photos = usePhotoStore((s) => s.photos);
  const hashes = usePhotoStore((s) => s.hashes);
  const clear = usePhotoStore((s) => s.clear);
  const [showSave, setShowSave] = useState(false);

  const onClear = () => {
    clear();
    setView('landing');
  };

  // Only allow Save when this space was loaded from local files (has hashes).
  const canSave = photos.length > 0 && hashes.length === photos.length && hashes.every((h) => h);

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 24,
          left: 24,
          zIndex: 10,
          display: 'flex',
          gap: 12,
        }}
      >
        <FrostPanel style={{ padding: '8px 14px' }}>
          <button
            onClick={onClear}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: 'var(--font-size-md)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            ← New space
          </button>
        </FrostPanel>
        <FrostPanel style={{ padding: '8px 14px' }}>
          <button
            onClick={triggerReset}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: 'var(--font-size-md)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            ⊙ Reset view
          </button>
        </FrostPanel>
        {canSave && (
          <FrostPanel style={{ padding: '8px 14px' }}>
            <button
              onClick={() => setShowSave(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-accent)',
                fontSize: 'var(--font-size-md)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              ⬛ Save space
            </button>
          </FrostPanel>
        )}
        <FrostPanel style={{ padding: '8px 14px' }}>
          <span
            style={{
              fontSize: 'var(--font-size-md)',
              color: 'var(--text-secondary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
          </span>
        </FrostPanel>
      </div>
      {showSave && <SaveSpaceModal onClose={() => setShowSave(false)} />}
    </>
  );
}

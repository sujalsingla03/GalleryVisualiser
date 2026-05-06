import { useState } from 'react';
import { FrostPanel } from './ui/FrostPanel';
import { useSpaceStore } from '../store/spaceStore';
import { usePhotoStore } from '../store/photoStore';

export function SaveSpaceModal({ onClose }: { onClose: () => void }) {
  const photos = usePhotoStore((s) => s.photos);
  const hashes = usePhotoStore((s) => s.hashes);
  const layout = usePhotoStore((s) => s.layout);
  const saveCurrent = useSpaceStore((s) => s.saveCurrent);

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = photos.length > 0 && hashes.length === photos.length && hashes.every((h) => h);

  const onSave = async () => {
    if (!canSave || !layout) {
      setError(
        !layout
          ? 'Layout not ready yet — please wait a moment and try again.'
          : 'This space cannot be re-saved (it was loaded from a saved space). Make a new one.',
      );
      return;
    }
    setBusy(true);
    setError(null);
    const photoMeta = photos.map((p, i) => ({
      name: p.name,
      size: 0,
      contentHash: hashes[i],
      aspectRatio: p.aspectRatio,
      scale: layout[i].scale,
      position: layout[i].position,
    }));
    const seed = Math.floor(Math.random() * 1_000_000_000);
    const result = await saveCurrent(name || 'Untitled space', seed, photoMeta);
    setBusy(false);
    if (result.error) setError(result.error);
    else onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20, 20, 20, 0.4)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <FrostPanel style={{ width: 'min(420px, 90vw)', padding: 28 }}>
          <div
            style={{
              fontSize: 'var(--font-size-xl)',
              color: 'var(--text-primary)',
              marginBottom: 16,
              fontWeight: 600,
            }}
          >
            Save this space
          </div>
          <input
            type="text"
            placeholder="Name this space"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: 'var(--font-size-lg)',
              fontFamily: 'inherit',
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-button)',
              color: 'var(--text-primary)',
              marginBottom: 16,
              outline: 'none',
            }}
          />
          {error && (
            <div
              style={{
                color: 'var(--color-system-red)',
                fontSize: 'var(--font-size-md)',
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                padding: '8px 16px',
                borderRadius: 'var(--radius-button)',
                fontSize: 'var(--font-size-md)',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={busy || !canSave}
              style={{
                background: 'var(--color-accent)',
                color: 'var(--text-on-accent)',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 'var(--radius-button)',
                fontSize: 'var(--font-size-md)',
                cursor: 'pointer',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                opacity: busy || !canSave ? 0.5 : 1,
              }}
            >
              {busy ? '…' : 'Save'}
            </button>
          </div>
        </FrostPanel>
      </div>
    </div>
  );
}

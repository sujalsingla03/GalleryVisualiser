import { useEffect } from 'react';
import { usePhotoStore } from '../store/photoStore';

export function PhotoLightbox() {
  const selectedId = usePhotoStore((s) => s.selectedId);
  const photos = usePhotoStore((s) => s.photos);
  const setSelected = usePhotoStore((s) => s.setSelected);

  const photo = selectedId ? photos.find((p) => p.id === selectedId) : null;

  useEffect(() => {
    if (!photo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photo, setSelected]);

  if (!photo) return null;

  return (
    <div className="lightbox" onClick={() => setSelected(null)} role="dialog" aria-modal="true">
      <img
        src={photo.blobUrl}
        alt={photo.name}
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
    </div>
  );
}

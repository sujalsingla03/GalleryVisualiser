import { useEffect } from 'react';
import { usePhotoStore } from '../store/photoStore';

export function PhotoLightbox() {
  const selectedId = usePhotoStore((s) => s.selectedId);
  const photos = usePhotoStore((s) => s.photos);
  const setSelected = usePhotoStore((s) => s.setSelected);

  const photo = selectedId ? photos.find((p) => p.id === selectedId) : null;
  const index = photo ? photos.findIndex((p) => p.id === photo.id) : -1;

  useEffect(() => {
    if (!photo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
      if (e.key === 'ArrowRight' && index >= 0 && index < photos.length - 1) {
        setSelected(photos[index + 1].id);
      }
      if (e.key === 'ArrowLeft' && index > 0) {
        setSelected(photos[index - 1].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photo, setSelected, index, photos]);

  if (!photo) return null;

  const goPrev = () => {
    if (index > 0) setSelected(photos[index - 1].id);
  };
  const goNext = () => {
    if (index >= 0 && index < photos.length - 1) setSelected(photos[index + 1].id);
  };

  return (
    <div className="lightbox" onClick={() => setSelected(null)} role="dialog" aria-modal="true">
      <button
        type="button"
        className="lightbox-close"
        aria-label="Close"
        onClick={() => setSelected(null)}
      >
        ✕
      </button>
      {index > 0 && (
        <button
          type="button"
          className="lightbox-nav lightbox-prev"
          aria-label="Previous photo"
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
        >
          ‹
        </button>
      )}
      {index >= 0 && index < photos.length - 1 && (
        <button
          type="button"
          className="lightbox-nav lightbox-next"
          aria-label="Next photo"
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
        >
          ›
        </button>
      )}
      <img
        src={photo.blobUrl}
        alt={photo.name}
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
      <div className="lightbox-caption" onClick={(e) => e.stopPropagation()}>
        {index + 1} / {photos.length}
      </div>
    </div>
  );
}

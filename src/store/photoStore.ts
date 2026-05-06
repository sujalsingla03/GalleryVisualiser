import { create } from 'zustand';
import type { Photo } from '../types/photo';
import type { PhotoSlot } from '../lib/computeLayout';

interface PhotoState {
  photos: Photo[];
  hashes: string[];           // parallel array — one content hash per photo
  selectedId: string | null;
  layout: PhotoSlot[] | null;
  setPhotos: (photos: Photo[], hashes: string[]) => void;
  setLayout: (layout: PhotoSlot[] | null) => void;
  clear: () => void;
  setSelected: (id: string | null) => void;
}

export const usePhotoStore = create<PhotoState>((set, get) => ({
  photos: [],
  hashes: [],
  selectedId: null,
  layout: null,
  setPhotos: (photos, hashes) => set({ photos, hashes }),
  setLayout: (layout) => set({ layout }),
  clear: () => {
    for (const p of get().photos) {
      URL.revokeObjectURL(p.blobUrl);
    }
    set({ photos: [], hashes: [], selectedId: null, layout: null });
  },
  setSelected: (id) => set({ selectedId: id }),
}));

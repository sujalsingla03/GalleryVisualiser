export interface PhotoMeta {
  name: string;
  size: number;
  contentHash: string;
  aspectRatio: number;
  scale: number;
  position: { x: number; y: number; z: number };
}

export interface SavedSpace {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  layout_seed: number;
  photo_meta: PhotoMeta[];
}

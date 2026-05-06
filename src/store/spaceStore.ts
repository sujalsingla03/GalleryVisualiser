import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { SavedSpace, PhotoMeta } from '../types/space';

interface SpaceState {
  list: SavedSpace[];
  loadingList: boolean;
  pendingSpace: SavedSpace | null; // a saved space we're trying to reattach photos for
  fetchList: () => Promise<{ error: string | null }>;
  saveCurrent: (
    name: string,
    layoutSeed: number,
    photoMeta: PhotoMeta[],
  ) => Promise<{ error: string | null; id: string | null }>;
  deleteSpace: (id: string) => Promise<{ error: string | null }>;
  setPendingSpace: (space: SavedSpace | null) => void;
}

export const useSpaceStore = create<SpaceState>((set) => ({
  list: [],
  loadingList: false,
  pendingSpace: null,

  fetchList: async () => {
    set({ loadingList: true });
    const { data, error } = await supabase
      .from('spaces')
      .select('*')
      .order('updated_at', { ascending: false });
    set({ loadingList: false, list: (data as SavedSpace[]) ?? [] });
    return { error: error?.message ?? null };
  },

  saveCurrent: async (name, layoutSeed, photoMeta) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: 'Not signed in', id: null };
    const { data, error } = await supabase
      .from('spaces')
      .insert({
        user_id: user.id,
        name,
        layout_seed: layoutSeed,
        photo_meta: photoMeta,
      })
      .select()
      .single();
    return { error: error?.message ?? null, id: (data as SavedSpace | null)?.id ?? null };
  },

  deleteSpace: async (id) => {
    const { error } = await supabase.from('spaces').delete().eq('id', id);
    return { error: error?.message ?? null };
  },

  setPendingSpace: (space) => set({ pendingSpace: space }),
}));

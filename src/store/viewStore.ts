import { create } from 'zustand';

export type View = 'landing' | 'globe';

interface ViewState {
  view: View;
  setView: (v: View) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  view: 'landing',
  setView: (v) => set({ view: v }),
}));

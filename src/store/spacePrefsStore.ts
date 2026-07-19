import { create } from 'zustand';
import type { LayoutMode } from '../lib/computeLayout';

const TIPS_KEY = 'pinviz.tipsDismissed';

function readTipsDismissed(): boolean {
  try {
    return localStorage.getItem(TIPS_KEY) === '1';
  } catch {
    return false;
  }
}

interface SpacePrefsState {
  autoOrbit: boolean;
  layoutMode: LayoutMode;
  layoutNonce: number;
  tipsVisible: boolean;
  toggleAutoOrbit: () => void;
  setLayoutMode: (mode: LayoutMode) => void;
  cycleLayoutMode: () => void;
  reshuffle: () => void;
  dismissTips: () => void;
}

const MODES: LayoutMode[] = ['scatter', 'grid', 'spiral', 'wall'];

export const useSpacePrefsStore = create<SpacePrefsState>((set, get) => ({
  autoOrbit: true,
  layoutMode: 'scatter',
  layoutNonce: 0,
  tipsVisible: !readTipsDismissed(),
  toggleAutoOrbit: () => set((s) => ({ autoOrbit: !s.autoOrbit })),
  setLayoutMode: (mode) => set({ layoutMode: mode, layoutNonce: get().layoutNonce + 1 }),
  cycleLayoutMode: () => {
    const cur = get().layoutMode;
    const next = MODES[(MODES.indexOf(cur) + 1) % MODES.length];
    set({ layoutMode: next, layoutNonce: get().layoutNonce + 1 });
  },
  reshuffle: () => set((s) => ({ layoutNonce: s.layoutNonce + 1 })),
  dismissTips: () => {
    try {
      localStorage.setItem(TIPS_KEY, '1');
    } catch {
      /* ignore */
    }
    set({ tipsVisible: false });
  },
}));

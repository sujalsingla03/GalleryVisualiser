import { create } from 'zustand';
import type { LayoutMode } from '../lib/computeLayout';
import { prefersReducedMotion } from '../lib/motion';

const TIPS_KEY = 'pinviz.tipsDismissed';
const THEME_KEY = 'pinviz.theme';
const REDUCED_MOTION_KEY = 'pinviz.reducedMotion';

export type ThemeId = 'teal' | 'gallery' | 'night';
export type QualityTier = 'high' | 'balanced' | 'low';

function readTipsDismissed(): boolean {
  try {
    return localStorage.getItem(TIPS_KEY) === '1';
  } catch {
    return false;
  }
}

function readTheme(): ThemeId {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'gallery' || v === 'night' || v === 'teal') return v;
  } catch {
    /* ignore */
  }
  return 'teal';
}

function readReducedMotionOverride(): boolean | null {
  try {
    const v = localStorage.getItem(REDUCED_MOTION_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* ignore */
  }
  return null;
}

interface SpacePrefsState {
  autoOrbit: boolean;
  layoutMode: LayoutMode;
  layoutNonce: number;
  tipsVisible: boolean;
  theme: ThemeId;
  /** Explicit HUD override; null = follow OS prefers-reduced-motion. */
  reducedMotionOverride: boolean | null;
  stopNonce: number;
  qualityTier: QualityTier;
  qualityLocked: boolean;
  toggleAutoOrbit: () => void;
  setLayoutMode: (mode: LayoutMode) => void;
  cycleLayoutMode: () => void;
  reshuffle: () => void;
  dismissTips: () => void;
  setTheme: (theme: ThemeId) => void;
  cycleTheme: () => void;
  setReducedMotionOverride: (value: boolean | null) => void;
  toggleReducedMotion: () => void;
  stopAllMotion: () => void;
  setQualityTier: (tier: QualityTier, locked?: boolean) => void;
  /** Effective reduced-motion (override or OS). */
  effectiveReducedMotion: () => boolean;
}

const MODES: LayoutMode[] = ['scatter', 'grid', 'spiral', 'wall', 'sphere', 'timeline'];
const THEMES: ThemeId[] = ['teal', 'gallery', 'night'];

export const useSpacePrefsStore = create<SpacePrefsState>((set, get) => ({
  autoOrbit: !prefersReducedMotion(),
  layoutMode: 'scatter',
  layoutNonce: 0,
  tipsVisible: !readTipsDismissed(),
  theme: readTheme(),
  reducedMotionOverride: readReducedMotionOverride(),
  stopNonce: 0,
  qualityTier: 'high',
  qualityLocked: false,
  toggleAutoOrbit: () => set((s) => ({ autoOrbit: !s.autoOrbit })),
  setLayoutMode: (mode) => set({ layoutMode: mode, layoutNonce: get().layoutNonce + 1 }),
  cycleLayoutMode: () => {
    const cur = get().layoutMode;
    const idx = MODES.indexOf(cur);
    const next = MODES[(idx >= 0 ? idx + 1 : 0) % MODES.length];
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
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
    document.documentElement.dataset.theme = theme;
    set({ theme });
  },
  cycleTheme: () => {
    const cur = get().theme;
    const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
    get().setTheme(next);
  },
  setReducedMotionOverride: (value) => {
    try {
      if (value === null) localStorage.removeItem(REDUCED_MOTION_KEY);
      else localStorage.setItem(REDUCED_MOTION_KEY, value ? '1' : '0');
    } catch {
      /* ignore */
    }
    set({ reducedMotionOverride: value });
  },
  toggleReducedMotion: () => {
    const cur = get().effectiveReducedMotion();
    get().setReducedMotionOverride(!cur);
  },
  stopAllMotion: () => set((s) => ({ stopNonce: s.stopNonce + 1, autoOrbit: false })),
  setQualityTier: (tier, locked = false) => set({ qualityTier: tier, qualityLocked: locked }),
  effectiveReducedMotion: () => {
    const o = get().reducedMotionOverride;
    if (o !== null) return o;
    return prefersReducedMotion();
  },
}));

/** Apply persisted theme attribute on boot. */
export function applyStoredTheme(): void {
  const theme = useSpacePrefsStore.getState().theme;
  document.documentElement.dataset.theme = theme;
}

export type LayoutMode = 'scatter' | 'grid' | 'spiral' | 'wall';

export interface LayoutOptions {
  spread?: number;
  depthRatio?: number;
  scaleMin?: number;
  scaleMax?: number;
  minXyDistance?: number;
  maxPlacementAttempts?: number;
  mode?: LayoutMode;
}

export interface PhotoSlot {
  index: number;
  position: { x: number; y: number; z: number };
  scale: number;
}

function gaussian(rng: () => number): number {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function randomScale(scaleMin: number, scaleMax: number, rng: () => number): number {
  return scaleMin + rng() * (scaleMax - scaleMin);
}

function layoutScatter(
  count: number,
  options: LayoutOptions,
  rng: () => number,
): PhotoSlot[] {
  const spread = options.spread ?? Math.max(2.5, Math.cbrt(count) * 1.4);
  const depthRatio = options.depthRatio ?? 0.6;
  const scaleMin = options.scaleMin ?? 0.5;
  const scaleMax = options.scaleMax ?? 2.0;
  const minXyDistance = options.minXyDistance ?? 1.2;
  const maxAttempts = options.maxPlacementAttempts ?? 50;
  const minXyDistSq = minXyDistance * minXyDistance;
  const slots: PhotoSlot[] = [];

  for (let i = 0; i < count; i++) {
    let x = 0;
    let y = 0;
    let placed = false;
    for (let attempt = 0; attempt < maxAttempts && !placed; attempt++) {
      x = gaussian(rng) * spread;
      y = gaussian(rng) * spread;
      let conflicts = false;
      for (let j = 0; j < slots.length; j++) {
        const dx = slots[j].position.x - x;
        const dy = slots[j].position.y - y;
        if (dx * dx + dy * dy < minXyDistSq) {
          conflicts = true;
          break;
        }
      }
      if (!conflicts) placed = true;
    }
    slots.push({
      index: i,
      position: { x, y, z: gaussian(rng) * spread * depthRatio },
      scale: randomScale(scaleMin, scaleMax, rng),
    });
  }
  return slots;
}

function layoutGrid(count: number, options: LayoutOptions, rng: () => number): PhotoSlot[] {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const gap = options.spread ? options.spread / Math.max(cols, 1) : 1.8;
  const scaleMin = options.scaleMin ?? 0.7;
  const scaleMax = options.scaleMax ?? 1.15;
  const slots: PhotoSlot[] = [];
  const originX = -((cols - 1) * gap) / 2;
  const originY = ((rows - 1) * gap) / 2;

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const jitter = 0.12;
    slots.push({
      index: i,
      position: {
        x: originX + col * gap + (rng() - 0.5) * jitter,
        y: originY - row * gap + (rng() - 0.5) * jitter,
        z: (rng() - 0.5) * 0.6,
      },
      scale: randomScale(scaleMin, scaleMax, rng),
    });
  }
  return slots;
}

function layoutSpiral(count: number, options: LayoutOptions, rng: () => number): PhotoSlot[] {
  const scaleMin = options.scaleMin ?? 0.55;
  const scaleMax = options.scaleMax ?? 1.6;
  const step = 0.55;
  const slots: PhotoSlot[] = [];

  for (let i = 0; i < count; i++) {
    const t = i + 1;
    const angle = t * 0.55;
    const radius = step * Math.sqrt(t) * (options.spread ? options.spread / 3 : 1.4);
    slots.push({
      index: i,
      position: {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius * 0.85,
        z: Math.sin(angle * 0.7) * radius * 0.35 + (rng() - 0.5) * 0.4,
      },
      scale: randomScale(scaleMin, scaleMax, rng),
    });
  }
  return slots;
}

/** Flat gallery wall facing the viewer — great for phones. */
function layoutWall(count: number, options: LayoutOptions, rng: () => number): PhotoSlot[] {
  const cols = Math.ceil(Math.sqrt(count * 1.4));
  const rows = Math.ceil(count / cols);
  const gapX = 1.55;
  const gapY = 1.35;
  const scaleMin = options.scaleMin ?? 0.75;
  const scaleMax = options.scaleMax ?? 1.05;
  const slots: PhotoSlot[] = [];
  const originX = -((cols - 1) * gapX) / 2;
  const originY = ((rows - 1) * gapY) / 2;

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    slots.push({
      index: i,
      position: {
        x: originX + col * gapX + (rng() - 0.5) * 0.08,
        y: originY - row * gapY + (rng() - 0.5) * 0.08,
        z: 0,
      },
      scale: randomScale(scaleMin, scaleMax, rng),
    });
  }
  return slots;
}

export function computeLayout(
  count: number,
  options: LayoutOptions = {},
  rng: () => number = Math.random,
): PhotoSlot[] {
  if (count <= 0) return [];
  const mode = options.mode ?? 'scatter';
  switch (mode) {
    case 'grid':
      return layoutGrid(count, options, rng);
    case 'spiral':
      return layoutSpiral(count, options, rng);
    case 'wall':
      return layoutWall(count, options, rng);
    case 'scatter':
    default:
      return layoutScatter(count, options, rng);
  }
}

export const LAYOUT_MODE_LABELS: Record<LayoutMode, string> = {
  scatter: 'Cloud',
  grid: 'Grid',
  spiral: 'Spiral',
  wall: 'Wall',
};

export const LAYOUT_MODES: LayoutMode[] = ['scatter', 'grid', 'spiral', 'wall'];

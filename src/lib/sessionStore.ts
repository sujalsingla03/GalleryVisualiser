/** IndexedDB session persistence for downscaled canvases + layout (opt-in). */

import type { PhotoSlot } from './computeLayout';

const DB_NAME = 'GallerySphere-session';
const DB_VERSION = 1;
const STORE = 'spaces';
const KEY = 'latest';

export interface SavedSpaceMeta {
  savedAt: number;
  photoCount: number;
  layoutMode: string;
}

export interface SavedSpaceRecord extends SavedSpaceMeta {
  layout: PhotoSlot[];
  /** PNG blobs of downscaled textures (privacy: not full-res originals). */
  canvases: Blob[];
  names: string[];
  aspects: number[];
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))),
      'image/png',
      0.92,
    );
  });
}

export async function saveSpaceSession(input: {
  layout: PhotoSlot[];
  canvases: HTMLCanvasElement[];
  names: string[];
  aspects: number[];
  layoutMode: string;
}): Promise<void> {
  const blobs = await Promise.all(input.canvases.map(canvasToBlob));
  const record: SavedSpaceRecord = {
    savedAt: Date.now(),
    photoCount: blobs.length,
    layoutMode: input.layoutMode,
    layout: input.layout,
    canvases: blobs,
    names: input.names,
    aspects: input.aspects,
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
  });
  db.close();
}

export async function loadSpaceSession(): Promise<SavedSpaceRecord | null> {
  const db = await openDb();
  const record = await new Promise<SavedSpaceRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as SavedSpaceRecord | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
  });
  db.close();
  return record;
}

export async function clearSpaceSession(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
  });
  db.close();
}

export async function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return canvas;
}

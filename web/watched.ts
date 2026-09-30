import { useSyncExternalStore } from 'react';

// Watched state lives in this browser only: { videoId: markedAtMs }.
const KEY = 'nl-watched-v1';
const listeners = new Set<() => void>();
let state: Record<string, number> = load();

function load(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: keep in memory */ }
  listeners.forEach(l => l());
}
addEventListener('storage', e => { if ((e as StorageEvent).key === KEY) { state = load(); listeners.forEach(l => l()); } });

export const useWatched = () => useSyncExternalStore(cb => (listeners.add(cb), () => listeners.delete(cb)), () => state);

export function setWatched(ids: string[], on: boolean) {
  const next = { ...state };
  for (const id of ids) on ? (next[id] = Date.now()) : delete next[id];
  state = next; save();
}

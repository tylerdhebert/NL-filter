import { useSyncExternalStore } from 'react';

// An ordered, per-browser playlist of video ids.
const KEY = 'nl-queue-v1';
const listeners = new Set<() => void>();
let queue: string[] = load();

function load(): string[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function commit(next: string[]) {
  queue = next;
  try { localStorage.setItem(KEY, JSON.stringify(queue)); } catch { /* private mode: keep in memory */ }
  listeners.forEach(l => l());
}
addEventListener('storage', e => { if ((e as StorageEvent).key === KEY) { queue = load(); listeners.forEach(l => l()); } });

export const useQueue = () => useSyncExternalStore(cb => (listeners.add(cb), () => listeners.delete(cb)), () => queue);
export const setQueue = (ids: string[]) => commit(ids);
export const enqueue = (ids: string[]) => { const have = new Set(queue); commit([...queue, ...ids.filter(id => !have.has(id))]); };
export const dequeue = (ids: string[]) => { const drop = new Set(ids); commit(queue.filter(id => !drop.has(id))); };
export const clearQueue = () => commit([]);

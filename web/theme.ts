import { useSyncExternalStore } from 'react';

// Follows the OS until the toggle is used, then remembers the choice. index.html applies it before first paint.
type Theme = 'light' | 'dark';
const KEY = 'nl-theme';
const media = matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();
let pref: Theme | '' = read();

function read(): Theme | '' {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : ''; } catch { return ''; }
}
const resolved = (): Theme => pref || (media.matches ? 'dark' : 'light');
function apply() { document.documentElement.dataset.theme = resolved(); listeners.forEach(l => l()); }
media.addEventListener('change', () => { if (!pref) apply(); });

export const useTheme = () => useSyncExternalStore(cb => (listeners.add(cb), () => listeners.delete(cb)), resolved);

// Swaps the theme with a circle growing out of the toggle, where the browser supports view transitions.
export function toggleTheme(from?: HTMLElement | null) {
  pref = resolved() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(KEY, pref); } catch { /* private mode: this session only */ }
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };
  if (!doc.startViewTransition || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return apply();
  const r = from?.getBoundingClientRect(), x = r ? r.left + r.width / 2 : innerWidth / 2, y = r ? r.top + r.height / 2 : 0;
  const root = document.documentElement.style;
  root.setProperty('--vt-x', x + 'px'); root.setProperty('--vt-y', y + 'px');
  root.setProperty('--vt-r', Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 'px');
  // The theme still applies if the browser skips the animation; only the reveal is lost.
  const t = doc.startViewTransition(apply);
  t.ready.catch(() => {}); t.finished.catch(() => {});
}

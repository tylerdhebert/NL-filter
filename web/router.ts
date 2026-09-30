import { useSyncExternalStore } from 'react';

// Hash routes (#/videos?..., #/games?..., #/streams?...) so the app works from file:// and static hosting alike.
export type Path = 'videos' | 'games' | 'streams';
export type Route = { path: Path; params: URLSearchParams };

const listeners = new Set<() => void>();
let cached = { hash: '', route: parse('') };

function parse(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  return { path: path === 'games' || path === 'streams' ? path : 'videos', params: new URLSearchParams(query) };
}
function current(): Route {
  if (cached.hash !== location.hash) cached = { hash: location.hash, route: parse(location.hash) };
  return cached.route;
}
const notify = () => listeners.forEach(l => l());
addEventListener('hashchange', notify);

export const useRoute = () => useSyncExternalStore(cb => (listeners.add(cb), () => listeners.delete(cb)), current);

export function href(path: Path, params?: Record<string, string | undefined> | URLSearchParams) {
  const p = params instanceof URLSearchParams ? params : new URLSearchParams(Object.entries(params ?? {}).filter((e): e is [string, string] => !!e[1]));
  const q = p.toString();
  return '#/' + path + (q ? '?' + q : '');
}

// push: discrete actions (clicks) get a history entry; typing replaces in place.
export function navigate(path: Path, params: URLSearchParams | Record<string, string | undefined>, mode: 'push' | 'replace' = 'push') {
  const next = href(path, params);
  if (next === location.hash) return;
  if (mode === 'push') location.hash = next;
  else { history.replaceState(null, '', next); notify(); }
}

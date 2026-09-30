export type Kind = 'vod' | 'fresh' | 'unknown';
export type Video = { id: string; title: string; published: string; dur: number; views: number; kind: Kind; game: string; people: string[]; streamDate?: string };
export type Game = { name: string; steamId?: string; header?: string; shelf?: string; tags: string[]; count: number };
export type Person = { name: string; label?: string; count: number };
export type Data = { generatedAt: string; shelves: string[]; games: Record<string, Game>; people: Record<string, Person>; videos: Video[] };

declare global { interface Window { NL_DATA?: Data } }
export const data = window.NL_DATA;

export const KINDS: Kind[] = ['vod', 'fresh', 'unknown'];
export const KIND_LABEL: Record<Kind, string> = { vod: 'VOD', fresh: 'Fresh', unknown: 'Unknown' };

// Categories read alphabetically, with the catch-all last.
export const CATEGORIES = data ? [...data.shelves].sort((a, b) => +(a === 'Everything Else') - +(b === 'Everything Else') || a.localeCompare(b)) : [];

export const fmt = new Intl.NumberFormat();
export const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
export const date = (value: string) => new Date(value.slice(0, 10) + 'T12:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
export const plural = (n: number, word: string, many = word + 's') => fmt.format(n) + ' ' + (n === 1 ? word : many);
export const duration = (sec: number) => {
  const s = Math.floor(sec), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
};
export const watchUrl = (id: string) => 'https://www.youtube.com/watch?v=' + encodeURIComponent(id);
// YouTube builds a temporary playlist from up to 50 ids, no account needed.
export const PLAYLIST_MAX = 50;
export const playlistUrl = (ids: string[]) => 'https://www.youtube.com/watch_videos?video_ids=' + ids.slice(0, PLAYLIST_MAX).join(',');
export const VIDEO_BY_ID = new Map((data?.videos ?? []).map(v => [v.id, v]));
export const thumbUrl = (id: string) => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`;
export const FIRST_DAY = (data?.videos ?? []).reduce((m, v) => v.published < m ? v.published : m, '9999').slice(0, 10);

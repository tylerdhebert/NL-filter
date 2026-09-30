import { data as maybeData, type Video } from './data';

const data = maybeData!;
export type Stream = { day: string; videos: Video[]; runtime: number; games: [string, number][]; people: string[] };

// One entry per stream day (NL streams once a day), videos in upload order, newest stream first.
export const STREAMS: Stream[] = (() => {
  const byDay = new Map<string, Video[]>();
  for (const v of data?.videos ?? []) if (v.streamDate) (byDay.get(v.streamDate) ?? byDay.set(v.streamDate, []).get(v.streamDate)!).push(v);
  return [...byDay].map(([day, videos]) => {
    videos.sort((a, b) => a.published.localeCompare(b.published));
    const games = new Map<string, number>();
    for (const v of videos) games.set(v.game, (games.get(v.game) ?? 0) + 1);
    return { day, videos, runtime: videos.reduce((s, v) => s + v.dur, 0), games: [...games].sort((a, b) => b[1] - a[1]), people: [...new Set(videos.flatMap(v => v.people))] };
  }).sort((a, b) => b.day.localeCompare(a.day));
})();
export const STREAM_BY_DAY = new Map(STREAMS.map(s => [s.day, s]));

export const longDate = (day: string) => new Date(day + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
export const runtimeLabel = (sec: number) => sec >= 3600 ? `${Math.floor(sec / 3600)}h ${Math.round(sec % 3600 / 60)}m` : `${Math.round(sec / 60)}m`;
// Compact form for calendar cells: 2h41 / 48m.
export const runtimeShort = (sec: number) => sec >= 3600 ? `${Math.floor(sec / 3600)}h${String(Math.round(sec % 3600 / 60)).padStart(2, '0')}` : `${Math.round(sec / 60)}m`;

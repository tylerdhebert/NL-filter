export type Video = { id: string; title: string; description: string; publishedAt: string; durationSec: number; views: number; likes: number; isShort: boolean };
const cutoff = '2021-01-01';
export const calls = { playlistItems: 0, videos: 0 };
async function api(path: keyof typeof calls, params: Record<string, string>): Promise<any> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('Set YOUTUBE_API_KEY in .env');
  const url = new URL('https://www.googleapis.com/youtube/v3/' + path);
  url.search = new URLSearchParams({ ...params, key }).toString();
  for (let attempt = 0; ; attempt++) {
    calls[path]++;
    const response = await fetch(url);
    if (response.ok) return response.json();
    if (attempt >= 3 || (response.status < 500 && response.status !== 429)) throw new Error(`YouTube ${path}: ${response.status} ${await response.text()}`);
    await Bun.sleep(1000 * 2 ** attempt);
  }
}
export function duration(value: string): number {
  const m = value.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
  if (!m) throw new Error(`Unexpected duration: ${value}`);
  return Number(m[1] || 0) * 86400 + Number(m[2] || 0) * 3600 + Number(m[3] || 0) * 60 + Number(m[4] || 0);
}
async function page(playlistId: string, pageToken: string) {
  return api('playlistItems', { part: 'contentDetails', playlistId, maxResults: '50', ...(pageToken ? { pageToken } : {}) });
}
export async function crawlYoutube(cached: Video[], full: boolean): Promise<Video[]> {
  const shorts = new Set<string>();
  let token = '';
  do {
    const p = await page('UUSH3tNpTOHsTnkmbwztCs30sA', token);
    for (const item of p.items) shorts.add(item.contentDetails.videoId);
    token = p.nextPageToken || '';
  } while (token);
  console.log(`Shorts playlist: ${shorts.size} IDs`);
  const known = new Map(cached.map(v => [v.id, v]));
  const wanted = new Set<string>();
  token = '';
  do {
    const p = await page('UU3tNpTOHsTnkmbwztCs30sA', token);
    let reachedCutoff = false;
    for (const item of p.items) {
      const d = item.contentDetails;
      if (d.videoPublishedAt && d.videoPublishedAt < cutoff) { reachedCutoff = true; break; }
      if (full || !known.has(d.videoId)) wanted.add(d.videoId);
    }
    if (reachedCutoff || (!full && p.items.length && p.items.every((i: any) => known.has(i.contentDetails.videoId)))) break;
    token = p.nextPageToken || '';
    if (wanted.size && wanted.size % 1000 === 0) console.log(`Uploads queued: ${wanted.size}`);
  } while (token);
  const output = full ? new Map<string, Video>() : known;
  const ids = [...wanted];
  console.log(`Fetching metadata for ${ids.length} videos`);
  for (let i = 0; i < ids.length; i += 50) {
    const data = await api('videos', { part: 'snippet,contentDetails,statistics', id: ids.slice(i, i + 50).join(',') });
    for (const v of data.items) {
      if (v.snippet.publishedAt < cutoff) continue;
      output.set(v.id, { id: v.id, title: v.snippet.title, description: v.snippet.description, publishedAt: v.snippet.publishedAt, durationSec: duration(v.contentDetails.duration), views: Number(v.statistics.viewCount || 0), likes: Number(v.statistics.likeCount || 0), isShort: false });
    }
    if ((i + 50) % 1000 === 0) console.log(`Metadata fetched: ${i + 50}/${ids.length}`);
  }
  return [...output.values()].filter(v => v.publishedAt >= cutoff).map(v => ({ ...v, isShort: shorts.has(v.id) || v.durationSec < 120 })).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
}

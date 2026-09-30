import type { Video } from './youtube';
import { steamIds, type SteamCache } from './steam';
import { meaningfulTags, shelfFor } from './shelves';
export type Game = { name: string; steamId?: string; shelf?: string; tags: string[]; header?: string; count: number };
export function clean(value: string): string {
  let s = value.replace(/\(?#ad\)?/gi, '').replace(/\s+(?:w\/|with|ft\.?|feat\.?|vs\.?|versus)\s.*$/i, '')
    .replace(/(?:\s+S\d+)?\s*[:|–—-]?\s+Episode\s+#?\d+\b.*$/i, '').trim();
  let before: string;
  do { before = s; s = s.replace(/\s+(?:#\d+|\d+\/\d+|finale|daily|demo|playtest|co-?op|races?|summoning|multiplayer)\s*$/i, '').replace(/[!?.:\s]+$/, '').trim(); } while (s !== before);
  return s;
}
export const norm = (s: string) => clean(s).toLowerCase().replace(/[’']/g, '').replace(/^the\s+/, '').replace(/&/g, 'and').replace(/\+/g, ' plus ').replace(/[^a-z0-9]+/g, '');
export function titleName(title: string): string | undefined {
  const t = title.replace(/\(?#ad\)?/gi, '').trim();
  const m = t.match(/^(.*)\(([^()]*)\)?\s*$/);
  if (!m) return;
  const suffix = m[2].trim();
  if (/^(?:episode|game|part|round|day|match|week|run)\s*#?\d+\b|^#?\d+(?:\s*[:.-].*)?$|^finale$/i.test(suffix)) return clean(m[1]) || undefined;
  if (/^(?:#?ad|sponsored|not clickbait|ft\.?\s.*|feat\.?\s.*)$/i.test(suffix)) return;
  return clean(suffix) || undefined;
}
const lineName = (d: string) => clean(d.split('\n')[0].match(/^(.+?)\s+(?:is\s+)?(?:out\s+|now\s+)?(?:available\s+)?on\s+(?:the\s+)?(?:Steam|Switch|Epic|itch|GOG|Nintendo|Xbox|PlayStation|PS|Origin)\s*:/i)?.[1] || '') || undefined;
export function resolveGames(videos: Video[], steam: SteamCache) {
  const parent = (id: string): string => steam[id]?.type === 'demo' && steam[id]?.fullgame ? String(steam[id]!.fullgame!.appid) : id;
  const candidates = videos.map(v => ({ v, title: titleName(v.title), line: lineName(v.description), ids: [...new Set(steamIds(v.description).map(parent))] }));
  const aliases = new Map<string, string>();
  // Learn each signal independently; both name -> app and app -> name must agree.
  for (const signal of ['line', 'title'] as const) {
    const votes = new Map<string, Map<string, number>>(), totals = new Map<string, number>();
    for (const c of candidates) {
      if (steamIds(c.v.description).length !== 1 || !c[signal]) continue;
      const name = norm(c[signal]!), id = c.ids[0];
      const bucket = votes.get(name) || new Map<string, number>();
      bucket.set(id, (bucket.get(id) || 0) + 1); votes.set(name, bucket);
      totals.set(id, (totals.get(id) || 0) + 1);
    }
    for (const [name, bucket] of votes) {
      const [id, count] = [...bucket].sort((a,b) => b[1]-a[1])[0];
      if (count / [...bucket.values()].reduce((a,b) => a+b,0) >= .6 && count / totals.get(id)! >= .6) aliases.set(name, id);
    }
  }
  for (const [id, game] of Object.entries(steam)) if (game) aliases.set(norm(game.name), parent(id));
  const rows = candidates.map(c => {
    const id = (c.title && aliases.get(norm(c.title))) || (c.ids.length === 1 ? c.ids[0] : undefined) || (c.line && aliases.get(norm(c.line))) || undefined;
    const name = c.title || c.line;
    // Miscellaneous is the creator's DLE segment, even if its description links a game.
    if (name && norm(name) === 'miscellaneous') return { video: c.v, key: 'name:dles', name: 'DLEs', steamId: undefined };
    if (id && steam[id]) return { video: c.v, key: 'steam:' + id, name: steam[id]!.name, steamId: id };
    const merged = name && aliases.get(norm(name));
    if (merged && steam[merged]) return { video: c.v, key: 'steam:' + merged, name: steam[merged]!.name, steamId: merged };
    if (name && ['dles', 'dlesbattle'].includes(norm(name))) return { video: c.v, key: 'name:dles', name: 'DLEs', steamId: undefined };
    return { video: c.v, key: name ? 'name:' + norm(name) : 'other', name: name || 'Other', steamId: undefined };
  });
  const words = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/[™®]/g, '').replace(/&/g, ' and ').replace(/\+/g, ' plus ').replace(/[^a-z0-9]+/g, ' ').trim();
  const known = new Map<string, { key: string; name: string; steamId?: string }>();
  for (const [id, g] of Object.entries(steam)) if (g && steam[parent(id)]) {
    const canonical = parent(id);
    known.set(words(g.name), { key: 'steam:' + canonical, name: steam[canonical]!.name, steamId: canonical });
  }
  for (const r of rows) if (r.key !== 'other') known.set(words(r.name), r);
  for (const [index, c] of candidates.entries()) {
    const r = rows[index];
    if (c.title && r.steamId && aliases.get(norm(c.title)) === r.steamId) known.set(words(c.title), r);
  }
  const vocab = [...known.keys()].filter(n => n.length >= 5).sort((a,b) => b.length-a.length);
  for (const r of rows) if (r.key === 'other') {
    const t = ' ' + words(r.video.title) + ' ';
    const hit = vocab.find(n => t.includes(' ' + n + ' '));
    if (hit) { const g = known.get(hit)!; r.key = g.key; r.name = g.name; r.steamId = g.steamId; }
  }
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.key, (counts.get(r.key) || 0) + 1);
  for (const r of rows) if (!/#ad/i.test(r.video.title) && !r.steamId && r.key !== 'name:dles' && r.key !== 'other' && counts.get(r.key)! <= 2) {
    const prefix = r.video.title.replace(/\(?#ad\)?/gi, '').trim().match(/^(.*)\(([^()]*)\)?\s*$/)?.[1];
    if (!prefix) continue;
    const t = ' ' + words(prefix) + ' ';
    const hit = vocab.find(n => t.includes(' ' + n + ' '));
    if (hit) { const g = known.get(hit)!; if ((counts.get(g.key) || 0) >= 5) { r.key = g.key; r.name = g.name; r.steamId = g.steamId; } }
  }
  for (const r of rows) if (r.key === 'other' && /\bdles?\b/i.test(r.video.title)) { r.key = 'name:dles'; r.name = 'DLEs'; }
  const spellings = new Map<string, Map<string, number>>();
  const games: Record<string, Game> = {};
  for (const r of rows) {
    const tags = meaningfulTags(r.steamId ? steam[r.steamId]?.tags || [] : []);
    const g = games[r.key] ||= { name: r.name, ...(r.steamId ? { steamId: r.steamId, header: steam[r.steamId]?.header } : {}), ...(r.key !== 'other' ? { shelf: shelfFor(r.key, tags) } : {}), tags: tags.slice(0, 8), count: 0 };
    g.count++;
    const names = spellings.get(r.key) || new Map<string, number>();
    names.set(r.name, (names.get(r.name) || 0) + 1); spellings.set(r.key, names);
  }
  for (const [key, names] of spellings) if (!games[key].steamId) games[key].name = [...names].sort((a,b) => b[1]-a[1])[0][0];
  return { games, keys: new Map(rows.map(r => [r.video.id, r.key])) };
}

import { mkdir, rename } from 'node:fs/promises';
import { crawlYoutube, calls, type Video } from './youtube';
import { loadSteam, steamIds } from './steam';
import { classify, peopleIn } from './classify';
import { resolveGames } from './games';
import { SHELVES } from './shelves';
const root = import.meta.dir + '/..';
async function write(path: string, content: string) { await Bun.write(path + '.tmp', content); await rename(path + '.tmp', path); }
await mkdir(root + '/data', { recursive: true });
await mkdir(root + '/site', { recursive: true });
const cacheFile = Bun.file(root + '/data/videos.json');
const cached: Video[] = await cacheFile.exists() ? await cacheFile.json() : [];
const all = await crawlYoutube(cached, process.argv.includes('--full'));
await write(root + '/data/videos.json', JSON.stringify(all));
console.log(`YouTube API calls: playlistItems=${calls.playlistItems}, videos=${calls.videos}, total=${calls.playlistItems + calls.videos}`);
const videos = all.filter(v => !v.isShort);
const steam = await loadSteam([...new Set(videos.flatMap(v => steamIds(v.description)))], root + '/data/steam.json');
const { games, keys } = resolveGames(videos, steam);
const people: Record<string, { name: string; label?: string; count: number }> = {};
const nameVotes = new Map<string, Map<string, number>>(), labelVotes = new Map<string, Map<string, number>>();
function vote(store: Map<string, Map<string, number>>, key: string, value: string) { const m = store.get(key) || new Map<string, number>(); m.set(value, (m.get(value) || 0) + 1); store.set(key, m); }
const years: Record<string, { vod: number; fresh: number; unknown: number; both: number }> = {};
const rows = videos.map(v => {
  const { kind, both, streamDate } = classify(v.description, v.publishedAt);
  const year = years[v.publishedAt.slice(0,4)] ||= { vod: 0, fresh: 0, unknown: 0, both: 0 };
  year[kind]++; if (both) year.both++;
  const collaborators = peopleIn(v.description);
  for (const p of collaborators) {
    (people[p.key] ||= { name: p.name, count: 0 }).count++;
    vote(nameVotes, p.key, p.name); if (p.label) vote(labelVotes, p.key, p.label);
  }
  return { id: v.id, title: v.title, published: v.publishedAt, dur: v.durationSec, views: v.views, kind, game: keys.get(v.id)!, people: collaborators.map(p => p.key), ...(streamDate ? { streamDate } : {}) };
});
for (const [key, names] of nameVotes) people[key].name = [...names].sort((a,b) => b[1]-a[1])[0][0];
for (const [key, labels] of labelVotes) people[key].label = [...labels].sort((a,b) => b[1]-a[1])[0][0];
console.log('\nYear  VOD  Fresh  Unknown  Both');
for (const [year, n] of Object.entries(years)) console.log(`${year}  ${n.vod}  ${n.fresh}  ${n.unknown}  ${n.both}`);
console.log('\nUnknown samples (up to 5 per year):');
for (const year of Object.keys(years)) for (const v of rows.filter(v => v.kind === 'unknown' && v.published.startsWith(year)).slice(0,5)) console.log(`${year} ${v.id} ${v.title}`);
console.log(`\nGames: ${rows.filter(v => v.game !== 'other').length}/${rows.length} resolved; ${Object.keys(games).filter(k => k !== 'other').length} distinct games; ${Object.values(games).filter(g => g.steamId).length} Steam games`);
console.log('Top 40 games:');
for (const g of Object.values(games).sort((a,b) => b.count-a.count).slice(0,40)) console.log(`${g.count}\t${g.name}`);
console.log('\nUnresolved titles:');
for (const v of rows.filter(v => v.game === 'other')) console.log(v.title);
console.log('\nShelves:');
for (const shelf of SHELVES) {
  const list = Object.values(games).filter(g => g.shelf === shelf).sort((a,b) => b.count-a.count);
  console.log(`${shelf}: ${list.length} games, ${list.reduce((n,g) => n+g.count, 0)} videos`);
  console.log(list.slice(0,8).map(g => `${g.name} (${g.count})`).join('; '));
}
await write(root + '/site/videos.js', 'window.NL_DATA = ' + JSON.stringify({ generatedAt: new Date().toISOString(), shelves: SHELVES, games, people, videos: rows }) + ';\n');
console.log(`\nSaved ${all.length} cached uploads, ${rows.length} site videos, ${Object.keys(people).length} people.`);

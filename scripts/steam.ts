export type Steam = { name: string; type: string; fullgame?: { appid: string | number; name?: string } | null; genres: string[]; tags?: [string, number][]; header?: string; release?: string };
export type SteamCache = Record<string, Steam | null>;
export const steamIds = (description: string) => [...new Set([...description.matchAll(/store\.steampowered\.com\/app\/(\d+)/gi)].map(m => m[1]))];
export function parseSteamTags(html: string, id: string): [string, number][] {
  const modal = new RegExp(`InitAppTagModal\\(\\s*${id}\\s*,\\s*`).exec(html);
  if (!modal) return [];
  const start = modal.index + modal[0].length;
  if (html[start] !== '[') throw new Error(`Missing Steam tag array for ${id}`);
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === '[') depth++;
    else if (c === ']' && --depth === 0) {
      const tags = JSON.parse(html.slice(start, i + 1)) as { name: string; count: number }[];
      if (!tags.every(t => typeof t.name === 'string' && typeof t.count === 'number')) throw new Error(`Invalid Steam tags for ${id}`);
      return tags.slice(0, 20).map(t => [t.name, t.count]);
    }
  }
  throw new Error(`Unterminated Steam tag array for ${id}`);
}
async function fetchSteamTags(id: string): Promise<[string, number][]> {
  for (let failures = 0; ; ) {
    await Bun.sleep(1200);
    try {
      const response = await fetch(`https://store.steampowered.com/app/${id}/`, {
        headers: { 'Accept-Language': 'en', Cookie: 'birthtime=0; lastagecheckage=1-0-1990; wants_mature_content=1' },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 429 || response.status === 403) { console.log(`Steam tags ${response.status}; waiting 60s (${id})`); await Bun.sleep(60_000); continue; }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return parseSteamTags(await response.text(), id);
    } catch (error) {
      if (++failures >= 4) { console.log(`Steam tags ${id}: ${error}; storing []`); return []; }
      await Bun.sleep(5000);
    }
  }
}
export async function loadSteam(ids: string[], path: string): Promise<SteamCache> {
  const file = Bun.file(path);
  const cache: SteamCache = await file.exists() ? await file.json() : {};
  const queue = new Set(ids);
  for (const entry of Object.values(cache)) if (entry?.type === 'demo' && entry.fullgame) queue.add(String(entry.fullgame.appid));
  let fetched = 0;
  for (const id of queue) {
    if (Object.hasOwn(cache, id)) continue;
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&l=english&cc=us`);
      if (response.status === 429 || response.status === 403) { console.log(`Steam ${response.status}; waiting 60s (${id})`); await Bun.sleep(60_000); continue; }
      if (!response.ok) {
        if (attempt >= 4) throw new Error(`Steam ${id}: HTTP ${response.status}`);
        await Bun.sleep(5000); continue;
      }
      const json = await response.json() as any;
      if (!json || !json[id] || typeof json[id].success !== 'boolean') throw new Error(`Unexpected Steam response for ${id}`);
      const d = json[id].data;
      cache[id] = json[id].success && d ? { name: d.name, type: d.type, fullgame: d.fullgame || null, genres: d.genres?.map((g: any) => g.description) || [], header: d.header_image, release: d.release_date?.date } : null;
      if (cache[id]?.type === 'demo' && cache[id]?.fullgame) queue.add(String(cache[id]!.fullgame!.appid));
      await Bun.write(path, JSON.stringify(cache));
      fetched++;
      if (fetched % 20 === 0) console.log(`Steam fetched: ${fetched}; cached: ${Object.keys(cache).length}; queued IDs: ${queue.size}`);
      await Bun.sleep(1600);
      break;
    }
  }
  let tagsFetched = 0;
  const pending = Object.entries(cache).filter(([, entry]) => entry && !Object.hasOwn(entry, 'tags'));
  for (const [id, entry] of pending) {
    entry!.tags = await fetchSteamTags(id);
    await Bun.write(path, JSON.stringify(cache));
    if (++tagsFetched % 20 === 0) console.log(`Steam tags fetched: ${tagsFetched}/${pending.length}`);
  }
  console.log(`Steam: ${fetched} fetched, ${Object.keys(cache).length} cached; tags fetched: ${tagsFetched}`);
  return cache;
}

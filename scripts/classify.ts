export type Kind = 'vod' | 'fresh' | 'unknown';
export function classify(description: string, published: string): { kind: Kind; both: boolean; streamDate?: string } {
  const lines = description.split(/\r?\n/);
  const fresh = lines.some(l => /\b(?:fresh|made|bespoke)\b.*\byoutube\b|\bI RECORDED this!.*not a stream vod|\boriginal content, not a VOD\b/i.test(l));
  const vodLine = lines.find(l => /\b(?:from|taken from) my (?:(?:twitch|live)\s*)?stream\b|\bVOD from my Twitch\b|\boriginally streamed on my Twitch channel\b|\bDan and I streamed\b/i.test(l));
  const kind = fresh ? 'fresh' : vodLine ? 'vod' : 'unknown';
  let streamDate: string | undefined;
  const match = vodLine?.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th|h)*(?:,?\s+(20\d{2}))?\b/i);
  if (match) {
    const month = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(match[1].slice(0,3).toLowerCase());
    let year = Number(match[3] || published.slice(0,4));
    const make = () => new Date(Date.UTC(year, month, Number(match[2])));
    if (!match[3] && make().toISOString().slice(0,10) > published.slice(0,10)) year--;
    const date = make();
    if (date.getUTCMonth() === month && date.getUTCDate() === Number(match[2])) streamDate = date.toISOString().slice(0,10);
  }
  const numeric = vodLine?.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (!streamDate && numeric) {
    const date = new Date(Date.UTC(Number(numeric[3]), Number(numeric[1]) - 1, Number(numeric[2])));
    if (date.getUTCMonth() === Number(numeric[1]) - 1 && date.getUTCDate() === Number(numeric[2])) streamDate = date.toISOString().slice(0,10);
  }
  return { kind, both: fresh && !!vodLine, ...(kind === 'vod' && streamDate ? { streamDate } : {}) };
}
export function peopleIn(description: string): { key: string; name: string; label?: string }[] {
  const found = new Map<string, { key: string; name: string; label?: string }>();
  for (const line of description.split(/\r?\n/)) {
    for (const match of line.matchAll(/\btwitch\.tv\/([\w]+)/gi)) {
      const name = match[1], key = name.toLowerCase();
      if (key === 'northernlion') continue;
      const prefix = line.slice(0, match.index).replace(/https?:\/\/(?:www\.)?$/i, '').trim();
      const label = prefix.match(/^([\w .'-]{1,40})\s*:\s*$/)?.[1]?.trim();
      found.set(key, { ...found.get(key), key, name, ...(label ? { label } : {}) });
    }
  }
  return [...found.values()];
}

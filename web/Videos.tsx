import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useDragControls, type DragControls } from 'motion/react';
import { plural, FIRST_DAY, CATEGORIES, KINDS, KIND_LABEL, compact, data as maybeData, date, duration, fmt, watchUrl, type Kind, type Video } from './data';
import { setWatched, useWatched } from './watched';
import { dequeue, enqueue, useQueue } from './queue';
import { STREAMS, STREAM_BY_DAY, longDate, runtimeLabel } from './streamData';
import { href, navigate } from './router';
import { Check, GelSelect, Section, jelly, menuMotion, soft, spring, useDismiss, usePlace, type Option } from './ui';
import { Calendar, monthOf, type DayStat } from './Calendar';
import { createPortal } from 'react-dom';

const data = maybeData!;
export const VIDEO_SORTS: Option[] = [
  { value: 'newest', label: 'Newest' }, { value: 'oldest', label: 'Oldest' }, { value: 'views', label: 'Most viewed' }, { value: 'longest', label: 'Longest' },
];
const WATCHED: Option[] = [{ value: '', label: 'All' }, { value: 'hide', label: 'Unwatched' }, { value: 'only', label: 'Watched' }];
const BATCH = 60;
type SetParams = (patch: Record<string, string>, mode?: 'push' | 'replace') => void;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date().toLocaleDateString('en-CA');
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };
// Presets are computed when the panel renders, so "30 days" always means the last 30 days.
const DATE_PRESETS = () => [
  { label: 'Any', from: '', to: '' }, { label: '30 days', from: daysAgo(30), to: '' },
  { label: '6 months', from: daysAgo(182), to: '' }, { label: 'This year', from: today().slice(0, 4) + '-01-01', to: '' },
];
const rangeLabel = (from: string, to: string) => from && to ? `${date(from)} – ${date(to)}` : from ? 'Since ' + date(from) : to ? 'Until ' + date(to) : '';
function read(p: URLSearchParams) {
  const kinds = p.has('kind') ? p.get('kind')!.split(',').filter((k): k is Kind => KINDS.includes(k as Kind)) : ['vod' as Kind];
  return {
    kinds, q: p.get('q') ?? '', day: /^\d{4}-\d{2}-\d{2}$/.test(p.get('day') ?? '') ? p.get('day')! : '',
    game: data.games[p.get('game') ?? ''] ? p.get('game')! : '', person: data.people[p.get('person') ?? ''] ? p.get('person')! : '',
    category: CATEGORIES.includes(p.get('category') ?? '') ? p.get('category')! : '',
    from: ISO.test(p.get('from') ?? '') ? p.get('from')! : '', to: ISO.test(p.get('to') ?? '') ? p.get('to')! : '',
    watched: p.get('watched') === 'hide' || p.get('watched') === 'only' ? p.get('watched')! : '',
    sort: VIDEO_SORTS.some(s => s.value === p.get('sort')) ? p.get('sort')! : 'newest',
  };
}
export const activeFilterCount = (p: URLSearchParams) => {
  const s = read(p);
  return [s.game, s.person, s.category, s.day, s.watched, s.from || s.to].filter(Boolean).length + (s.kinds.join() !== 'vod' ? 1 : 0);
};
const SORTERS: Record<string, (a: Video, b: Video) => number> = {
  newest: (a, b) => b.published.localeCompare(a.published), oldest: (a, b) => a.published.localeCompare(b.published),
  views: (a, b) => b.views - a.views, longest: (a, b) => b.dur - a.dur,
};

export function Videos({ params, set, mobile, sheet, closeSheet }: { params: URLSearchParams; set: SetParams; mobile: boolean; sheet: boolean; closeSheet: () => void }) {
  const s = useMemo(() => read(params), [params]);
  const watched = useWatched();
  const queue = useQueue(), queued = useMemo(() => new Set(queue), [queue]);
  const q = s.q.toLowerCase();
  // Everything except the type and watched filters, so their chip counts stay honest.
  const undated = useMemo(() => data.videos.filter(v =>
    (!s.game || v.game === s.game) && (!s.person || v.people.includes(s.person)) && (!s.category || data.games[v.game].shelf === s.category)
    && (!s.day || v.streamDate === s.day) && (!q || v.title.toLowerCase().includes(q))), [s.game, s.person, s.category, s.day, q]);
  const base = useMemo(() => undated.filter(v => (!s.from || v.published.slice(0, 10) >= s.from) && (!s.to || v.published.slice(0, 10) <= s.to)), [undated, s.from, s.to]);
  // Upload days for the date picker, counting the chosen types.
  const dayStats = useMemo(() => {
    const m = new Map<string, DayStat>();
    for (const v of undated) if (s.kinds.includes(v.kind)) { const d = v.published.slice(0, 10), x = m.get(d) ?? { count: 0, runtime: 0 }; x.count++; x.runtime += v.dur; m.set(d, x); }
    return m;
  }, [undated, s.kinds.join()]);
  const watchedOk = (v: Video) => !s.watched || (s.watched === 'hide') !== !!watched[v.id];
  const counts = useMemo(() => {
    const kind: Record<string, number> = {}, seen = { '': 0, hide: 0, only: 0 };
    for (const v of base) {
      if (watchedOk(v)) kind[v.kind] = (kind[v.kind] ?? 0) + 1;
      if (s.kinds.includes(v.kind)) { seen['']++; watched[v.id] ? seen.only++ : seen.hide++; }
    }
    return { kind, seen };
  }, [base, watched, s.kinds.join(), s.watched]);
  const results = useMemo(() => base.filter(v => s.kinds.includes(v.kind) && watchedOk(v)).sort((a, b) => SORTERS[s.sort](a, b) || a.id.localeCompare(b.id)),
    [base, watched, s.kinds.join(), s.watched, s.sort]);

  // The grid re-mounts (and re-animates) when the filters change, not when a card is marked watched.
  const filterKey = [s.kinds.join(), s.game, s.person, s.category, s.day, q, s.watched, s.sort, s.from, s.to].join('|');
  const [shown, setShown] = useState(BATCH);
  useEffect(() => setShown(BATCH), [filterKey]);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current; if (!el) return;
    const io = new IntersectionObserver(e => { if (e.some(x => x.isIntersecting)) setShown(n => n + BATCH); }, { rootMargin: '800px' });
    io.observe(el); return () => io.disconnect();
  }, [filterKey]);

  const game = s.game ? data.games[s.game] : null;
  // Streams are listed newest first, so the previous stream is the next entry.
  const stream = s.day ? STREAM_BY_DAY.get(s.day) : undefined, at = stream ? STREAMS.indexOf(stream) : -1;
  const older = at >= 0 ? STREAMS[at + 1] : undefined, newer = at > 0 ? STREAMS[at - 1] : undefined;
  const chips: [string, string][] = ([
    ['game', game?.name], ['person', s.person ? data.people[s.person].name : ''], ['category', s.category],
    ['day', s.day ? 'Stream ' + date(s.day) : ''], ['range', rangeLabel(s.from, s.to)], ['watched', s.watched ? (s.watched === 'hide' ? 'Unwatched' : 'Watched') : ''],
  ] as [string, string | undefined][]).filter((c): c is [string, string] => !!c[1]);
  const openDay = (day: string) => set({ day, game: '', person: '', category: '', q: '', kind: 'vod,fresh,unknown', sort: 'oldest' });

  const drag = useDragControls();
  const filters = <Filters s={s} set={set} counts={counts} mobile={mobile} dayStats={dayStats} />;
  return (
    <div className="layout">
      {!mobile && <aside className="filters gel" aria-label="Filters">{filters}</aside>}
      {mobile && (
        <AnimatePresence>
          {sheet && <motion.div key="scrim" className="scrim" onClick={closeSheet} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />}
          {sheet && (
            <motion.aside key="sheet" className="filters gel sheet" aria-label="Filters" initial={{ y: '105%' }} animate={{ y: 0 }} exit={{ y: '105%' }} transition={soft}
              drag="y" dragControls={drag} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0.05, bottom: 0.6 }}
              onDragEnd={(_, i) => { if (i.offset.y > 90 || i.velocity.y > 500) closeSheet(); }}>
              <SheetHead onClose={closeSheet} drag={drag} onReset={() => navigate('videos', {})} canReset={params.toString() !== ''} />
              {filters}
            </motion.aside>
          )}
        </AnimatePresence>
      )}
      <main>
        <div className="status">
          <span className="count" role="status" aria-live="polite">{fmt.format(results.length)} videos</span>
          <div className="active-filters">
            <AnimatePresence mode="popLayout" initial={false}>
              {chips.map(([key, label]) => (
                <motion.button key={key} type="button" layout aria-label={`Clear ${key === 'person' ? 'co-streamer' : key === 'range' ? 'date' : key} filter: ${label}`}
                  initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={jelly}
                  onClick={() => set(key === 'range' ? { from: '', to: '' } : { [key]: '' })}>{label} ×</motion.button>
              ))}
            </AnimatePresence>
          </div>
        </div>
        <AnimatePresence initial={false} mode="popLayout">
          {stream && (
            <motion.section key={'stream-' + s.day} className="banner gel stream-banner" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0, marginBottom: 22 }}
              exit={{ opacity: 0, y: 8 }} transition={soft}>
              <div className="banner-inner">
                <motion.button type="button" className="stream-nav" disabled={!older} onClick={() => older && set({ day: older.day })} whileTap={{ scale: 0.92 }} transition={jelly}
                  aria-label={older ? 'Previous stream, ' + longDate(older.day) : 'No older stream'}><span>←</span><small>{older ? longDate(older.day) : 'Oldest'}</small></motion.button>
                <div>
                  <h1>Stream · {longDate(stream.day)}</h1>
                  <p>{plural(stream.videos.length, 'video')} · {runtimeLabel(stream.runtime)} · {stream.games.map(([g]) => data.games[g].name).join(', ')}</p>
                  <a className="shelf-link" href={href('streams')}>All streams →</a>
                </div>
                <motion.button type="button" className="stream-nav" disabled={!newer} onClick={() => newer && set({ day: newer.day })} whileTap={{ scale: 0.92 }} transition={jelly}
                  aria-label={newer ? 'Next stream, ' + longDate(newer.day) : 'No newer stream'}><span>→</span><small>{newer ? longDate(newer.day) : 'Latest'}</small></motion.button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {game && (
            <motion.section key={s.game} className="banner gel" initial={{ opacity: 0, height: 0, marginBottom: 0 }} animate={{ opacity: 1, height: 'auto', marginBottom: 22 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }} transition={soft}>
              <div className="banner-inner">
                {game.header && <img src={game.header} alt="" onError={e => (e.currentTarget.hidden = true)} />}
                <div><h1>{game.name}</h1><p>{[game.shelf, ...game.tags.slice(0, 4)].filter(Boolean).join(' · ')}</p></div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
        <div className="grid" key={filterKey}>
          <AnimatePresence initial={false}>
            {results.slice(0, shown).map((v, i) => (
              <Card key={v.id} v={v} i={i % BATCH} watched={!!watched[v.id]} queued={queued.has(v.id)} onGame={() => set({ game: v.game })} onDay={openDay} />
            ))}
          </AnimatePresence>
        </div>
        {!results.length && <p className="empty">No videos match these filters.</p>}
        {shown < results.length && <div ref={sentinel} className="sentinel" aria-hidden="true" />}
      </main>
    </div>
  );
}

// Sheet header, pinned while the sheet scrolls: optional reset on the left, title in the middle, Done on the right.
export function SheetHead({ onClose, drag, title = 'Filters', onReset, canReset }: { onClose: () => void; drag: DragControls; title?: string; onReset?: () => void; canReset?: boolean }) {
  return (
    <div className="sheet-head" onPointerDown={e => drag.start(e)}>
      <span className="grip" aria-hidden="true" />
      <span className="sheet-side">{onReset && <button type="button" className="sheet-reset" disabled={!canReset} onClick={onReset}>Reset</button>}</span>
      <b>{title}</b>
      <span className="sheet-side end"><button type="button" onClick={onClose}>Done</button></span>
    </div>
  );
}

export const Card = memo(function Card({ v, i, watched, queued, onGame, onDay }: { v: Video; i: number; watched: boolean; queued: boolean; onGame: () => void; onDay?: (d: string) => void }) {
  return (
    <motion.article className={'card' + (watched ? ' is-watched' : '')} layout="position"
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0, transition: { ...soft, delay: Math.min(i, 24) * 0.012 } }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.18 } }}>
      <div className="thumb">
        <a href={watchUrl(v.id)} target="_blank" rel="noopener noreferrer" aria-label={v.title} tabIndex={-1}>
          <img src={`https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg`} alt="" loading="lazy" width={320} height={180} />
          <span className="duration">{duration(v.dur)}</span>
        </a>
        <AnimatePresence>{watched && <motion.span key="w" className="watched-badge" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={spring}>Watched</motion.span>}</AnimatePresence>
        <motion.button type="button" className="watch-btn" aria-pressed={watched} aria-label={watched ? 'Mark as unwatched' : 'Mark as watched'}
          title={watched ? 'Mark as unwatched' : 'Mark as watched'} whileTap={{ scale: 0.8 }} transition={jelly} onClick={() => setWatched([v.id], !watched)}>
          <Check on={watched} />
        </motion.button>
        <motion.button type="button" className="queue-btn" aria-pressed={queued} aria-label={queued ? 'Remove from queue' : 'Add to queue'}
          title={queued ? 'Remove from queue' : 'Add to queue'} whileTap={{ scale: 0.8 }} transition={jelly} onClick={() => queued ? dequeue([v.id]) : enqueue([v.id])}>
          <motion.svg viewBox="0 0 16 16" aria-hidden="true" initial={false} animate={{ rotate: queued ? 45 : 0 }} transition={jelly}>
            <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </motion.svg>
        </motion.button>
      </div>
      <h3><a href={watchUrl(v.id)} target="_blank" rel="noopener noreferrer">{v.title}</a></h3>
      <button type="button" className="game" onClick={onGame}>{data.games[v.game].name}</button>
      <div className="meta" title={fmt.format(v.views) + ' views'}>{compact.format(v.views)} views · {date(v.published)}</div>
      {v.streamDate && onDay && <button type="button" className="card-stream" onClick={() => onDay(v.streamDate!)}>stream · {date(v.streamDate)}</button>}
    </motion.article>
  );
});

function Filters({ s, set, counts, mobile, dayStats }: { s: ReturnType<typeof read>; set: SetParams; counts: { kind: Record<string, number>; seen: Record<string, number> }; mobile: boolean; dayStats: Map<string, DayStat> }) {
  const [gameQuery, setGameQuery] = useState(''), [personQuery, setPersonQuery] = useState('');
  const games = useMemo(() => Object.entries(data.games).sort((a, b) => b[1].count - a[1].count || a[1].name.localeCompare(b[1].name)), []);
  const people = useMemo(() => Object.entries(data.people).sort((a, b) => b[1].count - a[1].count), []);
  const toggleKind = (k: Kind) => set({ kind: (s.kinds.includes(k) ? s.kinds.filter(x => x !== k) : KINDS.filter(x => x === k || s.kinds.includes(x))).join(',') || 'none' });
  return (
    <>
      <Section title="Type">
        <div className="chips">
          {KINDS.map(k => (
            <motion.button key={k} type="button" aria-pressed={s.kinds.includes(k)} onClick={() => toggleKind(k)} whileTap={{ scaleX: 0.92, scaleY: 0.86 }} transition={jelly}>
              {KIND_LABEL[k]}<small>{fmt.format(counts.kind[k] ?? 0)}</small>
            </motion.button>
          ))}
        </div>
      </Section>
      <Section title="Watched">
        <div className="chips" role="radiogroup" aria-label="Watched">
          {WATCHED.map(w => (
            <motion.button key={w.value} type="button" role="radio" aria-checked={s.watched === w.value} aria-pressed={s.watched === w.value}
              onClick={() => set({ watched: w.value })} whileTap={{ scaleX: 0.92, scaleY: 0.86 }} transition={jelly}>
              {w.label}<small>{fmt.format(counts.seen[w.value] ?? 0)}</small>
            </motion.button>
          ))}
        </div>
      </Section>
      <Section title="Game">
        <input type="search" value={gameQuery} onChange={e => setGameQuery(e.target.value)} placeholder="Search games" aria-label="Search games" />
        <Facet entries={games} query={gameQuery} selected={s.game} onPick={k => set({ game: s.game === k ? '' : k })} />
      </Section>
      <Section title="Co-streamer" defaultOpen={false}>
        <input type="search" value={personQuery} onChange={e => setPersonQuery(e.target.value)} placeholder="Search people" aria-label="Search co-streamers" />
        <Facet entries={people} query={personQuery} selected={s.person} onPick={k => set({ person: s.person === k ? '' : k })} />
      </Section>
      <Section title="Date">
        <div className="chips chips-4">
          {DATE_PRESETS().map(p => {
            const on = s.from === p.from && s.to === p.to;
            return (
              <motion.button key={p.label} type="button" aria-pressed={on} onClick={() => set({ from: p.from, to: p.to })} whileTap={{ scaleX: 0.92, scaleY: 0.86 }} transition={jelly}>{p.label}</motion.button>
            );
          })}
        </div>
        <DateRange from={s.from} to={s.to} stats={dayStats} onRange={(from, to) => set({ from, to })} />
      </Section>
      <Section title="Category">
        <GelSelect label="Category" value={s.category} onChange={v => set({ category: v })}
          options={[{ value: '', label: 'All categories' }, ...CATEGORIES.map(c => ({ value: c, label: c }))]} />
      </Section>
      {mobile
        ? <div className="sheet-pad" />
        : <motion.a className="reset" href="#/videos" whileTap={{ scaleX: 0.94, scaleY: 0.88 }} transition={jelly}>Reset filters</motion.a>}
    </>
  );
}

// Keeps a typed range the right way round; an empty side stays empty.
const ordered = (a: string, b: string): [string, string] => a && b && a > b ? [b, a] : [a, b];

// MM/DD/YYYY only. Slashes appear as digits are typed (a slash only once a digit follows it, so backspace just works).
const mask = (raw: string) => { const d = raw.replace(/\D/g, '').slice(0, 8); return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('/'); };
const toMask = (iso: string) => iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : '';
function fromMask(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return null;
  const [mo, d, y] = [+m[1], +m[2], +m[3]], dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? dt.toLocaleDateString('en-CA') : null;
}

function DateField({ label, value, onCommit }: { label: string; value: string; onCommit: (day: string) => void }) {
  const shown = toMask(value);
  const [text, setText] = useState(shown), [bad, setBad] = useState(0);
  useEffect(() => setText(shown), [shown]);
  const reject = () => { setBad(n => n + 1); setText(shown); };
  // Commits as soon as the eighth digit lands; an emptied field clears that end of the range.
  const change = (raw: string) => {
    const next = mask(raw);
    setText(next);
    if (next.length === 10) { const d = fromMask(next); d ? d !== value && onCommit(d) : reject(); }
  };
  const settle = (raw: string) => {
    const next = mask(raw);
    if (!next) { if (value) onCommit(''); return; }
    if (next.length < 10) setText(shown);
  };
  return (
    <label className="date-field">
      <small>{label}</small>
      <motion.input type="text" inputMode="numeric" autoComplete="off" value={text} placeholder="MM/DD/YYYY" maxLength={10} aria-label={label + ' date, MM/DD/YYYY'}
        animate={bad ? { x: bad % 2 ? [0, -6, 6, -4, 4, 0] : [0, 6, -6, 4, -4, 0] } : { x: 0 }} transition={{ duration: 0.35 }}
        onChange={e => change(e.target.value)} onBlur={e => settle(e.currentTarget.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); settle(e.currentTarget.value); } if (e.key === 'Escape' && text !== shown) { e.stopPropagation(); setText(shown); } }} />
    </label>
  );
}

function DateRange({ from, to, stats, onRange }: { from: string; to: string; stats: Map<string, DayStat>; onRange: (from: string, to: string) => void }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null), pop = useRef<HTMLDivElement>(null);
  const place = usePlace(open, btn, pop, { prefer: 'right' });
  const close = (focus = false) => { setOpen(false); if (focus) btn.current?.focus(); };
  useDismiss(open, [btn, pop], () => close(), '.dd-menu');
  const enabled = useMemo(() => new Set(stats.keys()), [stats]);
  const inRange = useMemo(() => {
    if (!from || !to) return null;
    let n = 0, sec = 0;
    for (const [d, x] of stats) if (d >= from && d <= to) { n += x.count; sec += x.runtime; }
    return { n, sec };
  }, [stats, from, to]);
  return (
    <>
      <button ref={btn} type="button" className="dd-btn range-btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        <span>{rangeLabel(from, to) || 'Pick dates'}</span>
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div ref={pop} key="cal" role="dialog" aria-label="Choose upload dates" className="dd-menu gel cal-pop" {...menuMotion(false, true)}
              style={{ ...menuMotion(false, true).style, top: place?.top, left: place?.left, visibility: place ? 'visible' : 'hidden' }}
              onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); } }}>
              <Calendar mode="range" noun="video" stats={stats} enabled={enabled} first={monthOf(FIRST_DAY)} last={monthOf(today())} from={from} to={to} onRange={onRange} />
              <div className="cal-pop-side">
                <DateField label="From" value={from} onCommit={d => onRange(...ordered(d, to))} />
                <DateField label="To" value={to} onCommit={d => onRange(...ordered(from, d))} />
                <AnimatePresence initial={false}>
                  {inRange && (
                    <motion.p key="sum" aria-live="polite" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={spring}>
                      <b>{plural(inRange.n, 'video')}</b><small>{runtimeLabel(inRange.sec)}</small>
                    </motion.p>
                  )}
                </AnimatePresence>
                <span className="cal-pop-actions">
                  <button type="button" disabled={!from && !to} onClick={() => onRange('', '')}>Clear</button>
                  <button type="button" className="done" onClick={() => close(true)}>Done</button>
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>, document.body)}
    </>
  );
}

function Facet({ entries, query, selected, onPick }: { entries: [string, { name: string; label?: string; count: number }][]; query: string; selected: string; onPick: (k: string) => void }) {
  const q = query.toLowerCase();
  const matches = entries.filter(([key, g]) => (g.name + ' ' + (g.label ?? '') + ' ' + key).toLowerCase().includes(q));
  return (
    <div className="facet">
      {matches.map(([key, g]) => (
        <button key={key} type="button" aria-pressed={selected === key} onClick={() => onPick(key)}>
          <span>{g.label ? g.label + ' · ' + g.name : g.name}</span><small>{fmt.format(g.count)}</small>
        </button>
      ))}
      {!matches.length && <p>No matches.</p>}
    </div>
  );
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { CATEGORIES, PLAYLIST_MAX, data as maybeData, date, fmt, playlistUrl, plural, type Game, type Video } from './data';
import { href } from './router';
import { useWatched } from './watched';
import { PlayIcon, SearchIcon, jelly, menuMotion, soft, spring, useDismiss, usePlace, type Option } from './ui';

const data = maybeData!;
export const GAME_SORTS: Option[] = [{ value: 'videos', label: 'Most videos' }, { value: 'recent', label: 'Recently uploaded' }, { value: 'name', label: 'A–Z' }];
type Entry = Game & { key: string; videos: Video[]; vods: number; last: string };

// Every game with its videos oldest-first, so "play" means "watch the run in order".
const ENTRIES: Entry[] = (() => {
  const byGame = new Map<string, Video[]>();
  for (const v of data.videos) if (v.game !== 'other') (byGame.get(v.game) ?? byGame.set(v.game, []).get(v.game)!).push(v);
  return [...byGame].map(([key, videos]) => {
    videos.sort((a, b) => a.published.localeCompare(b.published));
    return { ...data.games[key], key, videos, vods: videos.filter(v => v.kind === 'vod').length, last: videos[videos.length - 1].published };
  });
})();
const SORTERS: Record<string, (a: Entry, b: Entry) => number> = {
  videos: (a, b) => b.videos.length - a.videos.length || a.name.localeCompare(b.name),
  recent: (a, b) => b.last.localeCompare(a.last) || b.videos.length - a.videos.length,
  name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
};
const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return 192 + Math.abs(h) % 44; };

export function Games({ params }: { params: URLSearchParams }) {
  const q = (params.get('q') ?? '').toLowerCase();
  const sort = SORTERS[params.get('sort') ?? ''] ? params.get('sort')! : 'videos';
  const watched = useWatched();
  const groups = useMemo(() => CATEGORIES.map(name => ({
    name, list: ENTRIES.filter(g => g.shelf === name && g.name.toLowerCase().includes(q)).sort(SORTERS[sort]),
  })).filter(g => g.list.length), [q, sort]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const sections = useRef(new Map<string, HTMLElement>());
  const total = groups.reduce((n, g) => n + g.list.length, 0);

  return (
    <main className="games">
      <p className="games-count" role="status" aria-live="polite">{plural(total, 'game')} across {plural(groups.length, 'category', 'categories')}</p>
      {groups.map(g => (
        <Category key={g.name} name={g.name} list={g.list} watched={watched} expanded={expanded.has(g.name)}
          register={el => el ? sections.current.set(g.name, el) : sections.current.delete(g.name)}
          toggle={() => setExpanded(s => { const n = new Set(s); n.has(g.name) ? n.delete(g.name) : n.add(g.name); return n; })} />
      ))}
      {!groups.length && <p className="empty">No games match that search.</p>}
      <JumpPill names={groups.map(g => g.name)} counts={Object.fromEntries(groups.map(g => [g.name, g.list.length]))} sections={sections.current} />
    </main>
  );
}

const ROWS = 3, PAD = { top: 8, side: 10, bottom: 20 };
function Category({ name, list, watched, expanded, toggle, register }: { name: string; list: Entry[]; watched: Record<string, number>; expanded: boolean; toggle: () => void; register: (el: HTMLElement | null) => void }) {
  const section = useRef<HTMLElement>(null), grid = useRef<HTMLDivElement>(null);
  const [m, setM] = useState({ full: 0, clamp: 0, limit: Infinity });
  const [ready, setReady] = useState(false); // first measurement snaps into place; later changes animate
  useLayoutEffect(() => {
    const el = grid.current!;
    const measure = () => {
      const style = getComputedStyle(el), limit = style.gridTemplateColumns.split(' ').length * ROWS;
      const cut = el.children[limit] as HTMLElement | undefined, top = el.getBoundingClientRect().top;
      const full = el.offsetHeight, clamp = cut ? cut.getBoundingClientRect().top - top - (parseFloat(style.rowGap) || 0) : full;
      setM(prev => prev.full === full && prev.clamp === clamp && prev.limit === limit ? prev : { full, clamp, limit });
    };
    measure(); const t = setTimeout(() => setReady(true), 60);
    const ro = new ResizeObserver(measure); ro.observe(el); return () => { clearTimeout(t); ro.disconnect(); };
  }, []);
  const extra = list.length - m.limit;
  const height = m.full ? (expanded ? m.full : m.clamp) + PAD.top + PAD.bottom : undefined;
  const onToggle = () => {
    if (expanded && section.current && section.current.getBoundingClientRect().top < 90) section.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toggle();
  };
  return (
    <section className="shelf" ref={el => { section.current = el; register(el); }} aria-labelledby={'cat-' + name}>
      <div className="shelf-head">
        <h2 id={'cat-' + name}>{name}</h2><span>{plural(list.length, 'game')}</span>
        <a className="shelf-link" href={href('videos', { category: name })}>Browse videos →</a>
      </div>
      <div className={'clamp' + (ready ? ' ready' : '')}
        style={{ height, padding: `${PAD.top}px ${PAD.side}px ${PAD.bottom}px`, margin: `-${PAD.top}px -${PAD.side}px -${PAD.bottom}px` }}>
        <div className="tiles" ref={grid}>
          {list.map((g, i) => <Tile key={g.key} g={g} watched={watched} hidden={!expanded && i >= m.limit} />)}
        </div>
      </div>
      {extra > 0 && (
        <motion.button type="button" className="more-toggle" aria-expanded={expanded} onClick={onToggle} whileTap={{ scaleX: 0.93, scaleY: 0.88 }} transition={jelly} layout>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={expanded ? 'less' : 'more'} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring}>
              {expanded ? 'Show less' : `View ${fmt.format(extra)} more`}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      )}
    </section>
  );
}

function Tile({ g, watched, hidden }: { g: Entry; watched: Record<string, number>; hidden: boolean }) {
  const seen = g.videos.filter(v => watched[v.id]).length;
  // Play the unwatched VODs in upload order; games without VODs play everything unwatched.
  const pool = g.vods ? g.videos.filter(v => v.kind === 'vod') : g.videos;
  const queue = pool.filter(v => !watched[v.id]).map(v => v.id);
  const [broken, setBroken] = useState(false);
  return (
    <div className="tile" inert={hidden}>
      <a className="tile-link" href={href('videos', { game: g.key })}>
        <span className={'art' + (!g.header || broken ? ' blank' : '')} style={{ '--h': hue(g.name) } as React.CSSProperties}>
          {g.header && !broken ? <img src={g.header} alt="" loading="lazy" onError={() => setBroken(true)} /> : <span>{g.name}</span>}
        </span>
        <b>{g.name}</b>
        <small>{plural(g.videos.length, 'video')} · {plural(g.vods, 'VOD')}</small>
        <small className="latest">Latest {date(g.last)}</small>
        {g.tags.length > 0 && <small className="tags">{g.tags.slice(0, 3).join(' · ')}</small>}
        {seen > 0 && (
          <span className="progress" aria-label={`${seen} of ${g.videos.length} watched`}>
            <motion.i initial={false} animate={{ width: (seen / g.videos.length) * 100 + '%' }} transition={soft} />
            <small>{fmt.format(seen)} of {fmt.format(g.videos.length)} watched</small>
          </span>
        )}
      </a>
      {queue.length > 0 && (
        <motion.a className="tile-play" href={playlistUrl(queue)} target="_blank" rel="noopener noreferrer" whileTap={{ scale: 0.85 }} transition={jelly}
          aria-label={`Play ${g.name} unwatched ${g.vods ? 'VODs' : 'videos'} in order`} title={`Play ${Math.min(queue.length, PLAYLIST_MAX)} unwatched ${g.vods ? 'VODs' : 'videos'}, oldest first`}>
          <PlayIcon />
        </motion.a>
      )}
    </div>
  );
}

// Floating pill: shows the category in view, opens a filterable list upward.
function JumpPill({ names, counts, sections }: { names: string[]; counts: Record<string, number>; sections: Map<string, HTMLElement> }) {
  const [active, setActive] = useState(names[0] ?? '');
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [cursor, setCursor] = useState(0);
  const btn = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const options = names.filter(n => n.toLowerCase().includes(query.trim().toLowerCase()));
  const place = usePlace(open, btn, menu, { prefer: 'up', minWidth: 280, deps: [options.length] });
  useDismiss(open, [btn, menu], () => setOpen(false));

  useEffect(() => {
    const spy = () => {
      const line = (document.querySelector('header')?.getBoundingClientRect().bottom ?? 0) + 60;
      let current = names[0] ?? '';
      for (const n of names) { const el = sections.get(n); if (el && el.getBoundingClientRect().top <= line) current = n; }
      setActive(current);
    };
    spy(); addEventListener('scroll', spy, { passive: true }); return () => removeEventListener('scroll', spy);
  }, [names.join('|')]);
  useEffect(() => { if (open) { setQuery(''); setCursor(Math.max(0, names.indexOf(active))); requestAnimationFrame(() => input.current?.focus()); } }, [open]);
  useEffect(() => { menu.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' }); }, [cursor, open, place]);

  const pick = (n: string) => {
    setOpen(false); btn.current?.focus();
    sections.get(n)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  };
  const onKey = (e: React.KeyboardEvent) => {
    const move = (n: number) => { e.preventDefault(); if (options.length) setCursor((n + options.length) % options.length); };
    if (e.key === 'ArrowDown') move(cursor + 1); else if (e.key === 'ArrowUp') move(cursor - 1);
    else if (e.key === 'Enter') { e.preventDefault(); if (options[cursor]) pick(options[cursor]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };
  if (!names.length) return null;
  return (
    <div className="jump">
      <motion.button ref={btn} type="button" className="jump-btn gel" aria-haspopup="listbox" aria-expanded={open} aria-label={`Jump to category (current: ${active})`}
        onClick={() => setOpen(o => !o)} whileTap={{ scaleX: 0.94, scaleY: 0.88 }} transition={jelly} layout>
        <small>Jump to</small>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={active} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={spring}>{active}</motion.span>
        </AnimatePresence>
        <motion.i className="chev" animate={{ rotate: open ? 0 : 180 }} transition={spring} />
      </motion.button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div ref={menu} key="jump" className="dd-menu gel jump-menu" {...menuMotion(true)}
              style={{ ...menuMotion(true).style, top: place?.top, left: place?.left, visibility: place ? 'visible' : 'hidden' }}>
              <label className="search"><SearchIcon />
                <input ref={input} type="search" value={query} placeholder="Filter categories" aria-label="Filter categories" role="combobox"
                  aria-expanded="true" aria-controls="jump-list" aria-autocomplete="list" aria-activedescendant={options[cursor] ? 'jump-' + cursor : undefined}
                  onChange={e => { setQuery(e.target.value); setCursor(0); }} onKeyDown={onKey} />
              </label>
              <div className="jump-list" id="jump-list" role="listbox" aria-label="Categories">
                {options.map((n, i) => (
                  <button key={n} id={'jump-' + i} type="button" role="option" tabIndex={-1} aria-selected={n === active} className={i === cursor ? 'active' : undefined}
                    onPointerMove={() => setCursor(i)} onClick={() => pick(n)}>{n}<small>{fmt.format(counts[n])}</small></button>
                ))}
                {!options.length && <p className="jump-empty">No categories match.</p>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>, document.body)}
    </div>
  );
}

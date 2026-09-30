import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'motion/react';
import { data, date } from './data';
import { href, navigate, useRoute, type Path } from './router';
import { GelSelect, SearchIcon, spring, useMedia } from './ui';
import { Videos, VIDEO_SORTS, activeFilterCount } from './Videos';
import { Games, GAME_SORTS } from './Games';
import { QueueTray } from './QueueTray';
import { toggleTheme, useTheme } from './theme';
import { Streams, STREAM_SORTS } from './Streams';

const TITLES: Record<Path, string> = { videos: 'Videos · LetourneauHub', games: 'Games · LetourneauHub', streams: 'Streams · LetourneauHub' };
const PAGES: { path: Path; label: string; search: string; sortLabel: string }[] = [
  { path: 'videos', label: 'Videos', search: 'Search titles', sortLabel: 'Sort videos' },
  { path: 'games', label: 'Games', search: 'Search games', sortLabel: 'Sort games' },
  { path: 'streams', label: 'Streams', search: 'Search streams by game, person or title', sortLabel: 'Sort streams' },
];
const scrollMemory: Partial<Record<Path, number>> = {};
const queryMemory: Partial<Record<Path, string>> = {}; // each view keeps its filters when you switch away and back

export function App() {
  const route = useRoute();
  const mobile = useMedia('(max-width: 760px)');
  const [sheet, setSheet] = useState(false);
  const theme = useTheme();
  const prev = useRef(route.path);

  useEffect(() => { document.title = TITLES[route.path]; }, [route.path]);
  // Remember where each view was scrolled so switching back lands in the same place.
  useLayoutEffect(() => {
    if (prev.current !== route.path) { scrollMemory[prev.current] = scrollY; prev.current = route.path; setSheet(false); }
  }, [route.path]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheet(false);
      if (e.key === '/' && !/^(INPUT|SELECT|TEXTAREA)$/.test((document.activeElement as HTMLElement)?.tagName)) { e.preventDefault(); document.getElementById('search')?.focus(); }
    };
    addEventListener('keydown', key); return () => removeEventListener('keydown', key);
  }, []);

  if (!data) return <p className="empty">Video data could not be loaded. Run <code>bun run crawl</code>, then reopen this page.</p>;
  const { path, params } = route;
  queryMemory[path] = params.toString();
  const set = (patch: Record<string, string>, mode: 'push' | 'replace' = 'push') => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k);
    navigate(path, p, mode);
  };
  const sorts = { videos: VIDEO_SORTS, games: GAME_SORTS, streams: STREAM_SORTS }[path];
  const page = PAGES.find(p => p.path === path)!;
  const sort = params.get('sort') && sorts.some(s => s.value === params.get('sort')) ? params.get('sort')! : sorts[0].value;
  const filters = path === 'videos' ? activeFilterCount(params) : 0;

  return (
    <MotionConfig reducedMotion="user">
      <header className="bar gel">
        <a className="brand" href={href('videos')} aria-label="LetourneauHub — all videos"><span className="logo">LH</span><span className="wordmark"><b>LetourneauHub</b><span>Northernlion VOD archive</span></span></a>
        <LayoutGroup id="nav">
          <nav className="nav" aria-label="Pages">
            {PAGES.map(({ path: p, label }) => (
              <a key={p} href={href(p, new URLSearchParams(queryMemory[p] ?? ''))} aria-current={p === path ? 'page' : undefined}>
                {p === path && <motion.span layoutId="nav-pill" className="nav-pill" transition={spring} />}
                <span className="nav-label">{label}</span>
              </a>
            ))}
          </nav>
        </LayoutGroup>
        <div className="tools">
          <label className="search">
            <SearchIcon />
            <input id="search" type="search" value={params.get('q') ?? ''} placeholder={page.search} aria-label={page.search} onChange={e => set({ q: e.target.value }, 'replace')} />
            <kbd aria-hidden="true">/</kbd>
          </label>
          <GelSelect className="sort" label={page.sortLabel} value={sort} options={sorts}
            onChange={v => set({ sort: v === sorts[0].value ? '' : v })} />
        </div>
        <small className="updated">updated {date(data.generatedAt)}</small>
        {/* Right-hand controls stay flush to the edge; Filters (videos, mobile) slots in to the left of the theme toggle. */}
        <div className="bar-end">
          <AnimatePresence initial={false} mode="popLayout">
            {mobile && path === 'videos' && (
              <motion.button key="filters" type="button" className="filters-btn" aria-expanded={sheet} onClick={() => setSheet(s => !s)} aria-label="Filters"
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={spring}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11l-4.2 5v4l-2.6 1.2V8.5z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
                <span className="filters-label">Filters</span>
                <AnimatePresence>{filters > 0 && <motion.b key="n" className="badge" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={spring}>{filters}</motion.b>}</AnimatePresence>
              </motion.button>
            )}
          </AnimatePresence>
          <motion.button type="button" className="theme-btn" aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={theme === "dark" ? "Light mode" : "Dark mode"}
            onClick={e => toggleTheme(e.currentTarget)} whileTap={{ scale: 0.85 }} transition={spring}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.svg key={theme} viewBox="0 0 20 20" aria-hidden="true" initial={{ rotate: -90, scale: 0.4, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} exit={{ rotate: 90, scale: 0.4, opacity: 0 }} transition={spring}>
                {theme === "dark"
                  ? <path d="M15.5 12.6A6.5 6.5 0 0 1 7.4 4.5a6.5 6.5 0 1 0 8.1 8.1Z" fill="currentColor" />
                  : <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="10" cy="10" r="3.4" fill="currentColor" stroke="none" /><path d="M10 1.8v2M10 16.2v2M1.8 10h2M16.2 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4" /></g>}
              </motion.svg>
            </AnimatePresence>
          </motion.button>
        </div>
      </header>
      <AnimatePresence mode="wait" initial={false} onExitComplete={() => scrollTo(0, scrollMemory[path] ?? 0)}>
        <motion.div key={path} className="view" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: [0.2, 0.7, 0.3, 1] }}>
          {path === 'videos'
            ? <Videos params={params} set={set} mobile={mobile} sheet={sheet} closeSheet={() => setSheet(false)} />
            : path === 'games' ? <Games params={params} /> : <Streams params={params} />}
        </motion.div>
      </AnimatePresence>
      <QueueTray mobile={mobile} />
    </MotionConfig>
  );
}

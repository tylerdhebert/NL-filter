import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { data as maybeData, playlistUrl, plural } from './data';
import { href, navigate } from './router';
import { enqueue, useQueue } from './queue';
import { useWatched } from './watched';
import { STREAMS, STREAM_BY_DAY, longDate, runtimeLabel, type Stream } from './streamData';
import { Calendar, monthLabel, monthOf, type DayStat } from './Calendar';
import { Card, SheetHead } from './Videos';
import { PlayIcon, jelly, soft, spring, useMedia, type Option } from './ui';

const data = maybeData!;
export const STREAM_SORTS: Option[] = [{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }];
const STREAM_STATS = new Map<string, DayStat>(STREAMS.map(s => [s.day, { count: s.videos.length, runtime: s.runtime }]));
const FIRST_MONTH = monthOf(STREAMS[STREAMS.length - 1]?.day ?? '2021-01-01'), LAST_MONTH = monthOf(STREAMS[0]?.day ?? '2021-01-01');

export function Streams({ params }: { params: URLSearchParams }) {
  const q = (params.get('q') ?? '').trim().toLowerCase();
  const sort = params.get('sort') === 'oldest' ? 'oldest' : 'newest';
  const mobile = useMedia('(max-width: 900px)');
  // Search matches a game played, a co-streamer, or any video title.
  const list = useMemo(() => {
    const hits = STREAMS.filter(s => !q
      || s.games.some(([g]) => data.games[g].name.toLowerCase().includes(q))
      || s.people.some(p => (data.people[p].name + ' ' + (data.people[p].label ?? '')).toLowerCase().includes(q))
      || s.videos.some(v => v.title.toLowerCase().includes(q)));
    return sort === 'oldest' ? [...hits].reverse() : hits;
  }, [q, sort]);
  const matching = useMemo(() => new Set(list.map(s => s.day)), [list]);
  const wanted = params.get('day') ?? '';
  const stream = (matching.has(wanted) ? STREAM_BY_DAY.get(wanted) : undefined) ?? list[0];
  const [sheet, setSheet] = useState(false);
  const pick = (day: string) => { setSheet(false); navigate('streams', { ...Object.fromEntries(params), day }); };

  const picker = <Picker list={list} matching={matching} selected={stream?.day} onPick={pick} />;
  const drag = useDragControls();
  return (
    <div className="layout streams-layout">
      {!mobile && <aside className="stream-picker gel" aria-label="Pick a stream">{picker}</aside>}
      {mobile && (
        <AnimatePresence>
          {sheet && <motion.div key="scrim" className="scrim" onClick={() => setSheet(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />}
          {sheet && (
            <motion.aside key="sheet" className="stream-picker gel sheet" aria-label="Pick a stream" initial={{ y: '105%' }} animate={{ y: 0 }} exit={{ y: '105%' }} transition={soft}
              drag="y" dragControls={drag} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0.05, bottom: 0.6 }}
              onDragEnd={(_, i) => { if (i.offset.y > 90 || i.velocity.y > 500) setSheet(false); }}>
              <SheetHead title="Streams" onClose={() => setSheet(false)} drag={drag} />
              {picker}
            </motion.aside>
          )}
        </AnimatePresence>
      )}
      <main>
        {stream
          ? <Detail key={stream.day} s={stream} list={list} onPick={pick} onBrowse={mobile ? () => setSheet(true) : undefined} />
          : <p className="empty">No streams match that search.</p>}
      </main>
    </div>
  );
}

function Picker({ list, matching, selected, onPick }: { list: Stream[]; matching: Set<string>; selected?: string; onPick: (day: string) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' }); }, [selected]);
  const groups = useMemo(() => {
    const out: { month: string; items: Stream[] }[] = [];
    for (const s of list) { const m = monthOf(s.day); if (out.at(-1)?.month !== m) out.push({ month: m, items: [] }); out.at(-1)!.items.push(s); }
    return out;
  }, [list]);

  return (
    <>
      <Calendar mode="single" noun="stream" stats={STREAM_STATS} enabled={matching} first={FIRST_MONTH} last={LAST_MONTH} value={selected} onPick={onPick} />
      <div className="stream-list" ref={listRef} role="list" aria-label="Streams">
        {groups.map(g => (
          <section key={g.month} role="presentation">
            <h3 className="stream-month">{monthLabel(g.month)} {g.month.slice(0, 4)}<small>{plural(g.items.length, 'stream')}</small></h3>
            {g.items.map(s => (
              <button key={s.day} type="button" role="listitem" className="stream-item" aria-current={s.day === selected} onClick={() => onPick(s.day)}>
                <span className="stream-item-date"><b>{new Date(s.day + 'T12:00:00').getDate()}</b><small>{new Date(s.day + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })}</small></span>
                <span className="stream-item-text">
                  <span>{s.games.map(([g]) => data.games[g].name).join(', ')}</span>
                  <small>{plural(s.videos.length, 'video')} · {runtimeLabel(s.runtime)}</small>
                </span>
              </button>
            ))}
          </section>
        ))}
        {!list.length && <p className="jump-empty">No streams match.</p>}
      </div>
    </>
  );
}

function Detail({ s, list, onPick, onBrowse }: { s: Stream; list: Stream[]; onPick: (d: string) => void; onBrowse?: () => void }) {
  const watched = useWatched();
  const queue = useQueue(), queued = useMemo(() => new Set(queue), [queue]);
  const ids = s.videos.map(v => v.id), seen = ids.filter(id => watched[id]).length, missing = ids.filter(id => !queued.has(id));
  // Previous/next follow the calendar, not the list sort: older is always to the left.
  const byDate = useMemo(() => [...list].sort((a, b) => a.day.localeCompare(b.day)), [list]);
  const at = byDate.indexOf(s), older = byDate[at - 1], newer = byDate[at + 1];
  const [flash, setFlash] = useState(false);
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(false), 1400); return () => clearTimeout(t); }, [flash]);
  const label = flash ? 'Queued' : missing.length === 0 ? 'In queue' : missing.length < ids.length ? `Queue ${missing.length} more` : 'Queue stream';

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={soft}>
      <section className="banner gel stream-head">
        <div className="stream-head-top">
          <motion.button type="button" className="stream-nav" disabled={!older} onClick={() => older && onPick(older.day)} whileTap={{ scale: 0.92 }} transition={jelly}
            aria-label={older ? 'Previous stream, ' + longDate(older.day) : 'No older stream'}><span>←</span><small>{older ? longDate(older.day) : 'Oldest'}</small></motion.button>
          <div className="stream-head-title">
            <h1>{longDate(s.day)}</h1>
            <p>{plural(s.videos.length, 'video')} · {runtimeLabel(s.runtime)}{seen ? ` · ${seen} of ${ids.length} watched` : ''}</p>
          </div>
          <motion.button type="button" className="stream-nav" disabled={!newer} onClick={() => newer && onPick(newer.day)} whileTap={{ scale: 0.92 }} transition={jelly}
            aria-label={newer ? 'Next stream, ' + longDate(newer.day) : 'No newer stream'}><span>→</span><small>{newer ? longDate(newer.day) : 'Latest'}</small></motion.button>
        </div>
        <div className="stream-games">
          {s.games.map(([g, n]) => <a key={g} className="stream-game" href={href('videos', { game: g, kind: 'vod,fresh,unknown' })}>{data.games[g].name}{n > 1 && <small>×{n}</small>}</a>)}
          {s.people.length > 0 && <span className="stream-people">with {s.people.map(p => data.people[p].label ?? data.people[p].name).join(', ')}</span>}
        </div>
        <div className="stream-actions">
          {onBrowse && <motion.button type="button" className="queue-all" onClick={onBrowse} whileTap={{ scaleX: 0.93, scaleY: 0.88 }} transition={jelly}>Browse streams</motion.button>}
          <motion.button type="button" className="queue-all" disabled={!missing.length && !flash} onClick={() => { enqueue(missing); setFlash(true); }} whileTap={{ scaleX: 0.93, scaleY: 0.88 }} transition={jelly}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring}>{label}</motion.span>
            </AnimatePresence>
          </motion.button>
          <motion.a className="play-all" href={playlistUrl(ids)} target="_blank" rel="noopener noreferrer" whileTap={{ scale: 0.93 }} transition={jelly}><PlayIcon />Play stream</motion.a>
        </div>
      </section>
      <div className="grid">
        {s.videos.map((v, i) => (
          <Card key={v.id} v={v} i={i} watched={!!watched[v.id]} queued={queued.has(v.id)} onGame={() => navigate('videos', { game: v.game })} />
        ))}
      </div>
    </motion.div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, Reorder, motion, useDragControls } from 'motion/react';
import { PLAYLIST_MAX, VIDEO_BY_ID, data as maybeData, duration, fmt, playlistUrl, plural, thumbUrl, watchUrl } from './data';
import { clearQueue, dequeue, setQueue, useQueue } from './queue';
import { useWatched } from './watched';
import { PlayIcon, jelly, soft, spring } from './ui';

const data = maybeData!;

export function QueueTray({ mobile }: { mobile: boolean }) {
  const queue = useQueue().filter(id => VIDEO_BY_ID.has(id));
  const watched = useWatched();
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [limit, setLimit] = useState(100); // long queues render in pages
  useEffect(() => { if (!queue.length) setOpen(false); }, [queue.length]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('keydown', key); return () => removeEventListener('keydown', key);
  }, [open]);
  useEffect(() => { if (!confirmClear) return; const t = setTimeout(() => setConfirmClear(false), 2500); return () => clearTimeout(t); }, [confirmClear]);

  const seen = queue.filter(id => watched[id]);
  const runtime = queue.reduce((s, id) => s + (VIDEO_BY_ID.get(id)?.dur ?? 0), 0);
  const chunks = Array.from({ length: Math.ceil(queue.length / PLAYLIST_MAX) }, (_, i) => queue.slice(i * PLAYLIST_MAX, (i + 1) * PLAYLIST_MAX));
  const move = (id: string, by: number) => {
    const i = queue.indexOf(id), j = i + by;
    if (j < 0 || j >= queue.length) return;
    const next = [...queue]; [next[i], next[j]] = [next[j], next[i]]; setQueue(next);
  };
  const hours = runtime >= 3600 ? `${Math.floor(runtime / 3600)}h ${Math.round(runtime % 3600 / 60)}m` : `${Math.round(runtime / 60)}m`;

  return (
    <>
      <AnimatePresence>
        {queue.length > 0 && (
          <motion.button key="fab" type="button" className="queue-fab gel" aria-expanded={open} aria-controls="queue-panel" onClick={() => setOpen(o => !o)}
            initial={{ opacity: 0, scale: 0.6, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6, y: 20 }} transition={jelly}
            whileTap={{ scaleX: 0.92, scaleY: 0.86 }}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h9M2 8h9M2 12h6M13 10v5M10.5 12.5h5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
            Queue
            <motion.b key={queue.length} className="badge" initial={{ scale: 1.5 }} animate={{ scale: 1 }} transition={jelly}>{fmt.format(queue.length)}</motion.b>
          </motion.button>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {open && mobile && <motion.div key="scrim" className="scrim" onClick={() => setOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />}
        {open && (
          <motion.aside key="panel" id="queue-panel" className={'queue gel' + (mobile ? ' sheet' : '')} aria-label="Queue"
            initial={mobile ? { y: '105%' } : { x: '110%' }} animate={mobile ? { y: 0 } : { x: 0 }} exit={mobile ? { y: '105%' } : { x: '110%' }} transition={soft}>
            <div className="queue-head">
              <div><b>Queue</b><small>{plural(queue.length, 'video')} · {hours}</small></div>
              <button type="button" className="icon-btn" aria-label="Close queue" onClick={() => setOpen(false)}>×</button>
            </div>
            <div className="queue-actions">
              <AnimatePresence initial={false}>
                {seen.length > 0 && (
                  <motion.button key="seen" type="button" layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={jelly}
                    onClick={() => dequeue(seen)}>Remove {fmt.format(seen.length)} watched</motion.button>
                )}
              </AnimatePresence>
              <motion.button type="button" layout className={confirmClear ? 'danger' : undefined} onClick={() => confirmClear ? (clearQueue(), setConfirmClear(false)) : setConfirmClear(true)}>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span key={String(confirmClear)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring}>
                    {confirmClear ? 'Tap again to clear' : 'Clear'}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
            </div>
            <motion.div className="queue-scroll" layoutScroll>
            <Reorder.Group as="ol" axis="y" values={queue.slice(0, limit)} onReorder={next => setQueue([...next, ...queue.slice(limit)])} className="queue-list">
              <AnimatePresence initial={false}>
                {queue.slice(0, limit).map((id, i) => <Item key={id} id={id} index={i} watched={!!watched[id]} move={by => move(id, by)} chunkStart={i > 0 && i % PLAYLIST_MAX === 0} />)}
              </AnimatePresence>
            </Reorder.Group>
            {queue.length > limit && <button type="button" className="queue-more" onClick={() => setLimit(l => l + 100)}>{queue.length - limit > 100 ? `Show 100 more of ${fmt.format(queue.length - limit)}` : `Show ${fmt.format(queue.length - limit)} more`}</button>}
            </motion.div>
            <div className="queue-play">
              {chunks.map((ids, i) => (
                <motion.a key={i} className="play-all" href={playlistUrl(ids)} target="_blank" rel="noopener noreferrer" whileTap={{ scale: 0.93 }} transition={jelly} layout>
                  <PlayIcon />{chunks.length === 1 ? 'Play queue' : `Play ${i * PLAYLIST_MAX + 1}–${i * PLAYLIST_MAX + ids.length}`}
                </motion.a>
              ))}
              {chunks.length > 1 && <small>YouTube plays up to {PLAYLIST_MAX} at a time, so longer queues come in parts.</small>}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

function Item({ id, index, watched, move, chunkStart }: { id: string; index: number; watched: boolean; move: (by: number) => void; chunkStart: boolean }) {
  const v = VIDEO_BY_ID.get(id)!;
  const drag = useDragControls();
  const ref = useRef<HTMLLIElement>(null);
  return (
    <Reorder.Item ref={ref} value={id} as="li" dragListener={false} dragControls={drag} className={'queue-item' + (watched ? ' is-watched' : '') + (chunkStart ? ' chunk-start' : '')}
      initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40, height: 0, paddingTop: 0, paddingBottom: 0 }} transition={soft}
      whileDrag={{ scale: 1.03, boxShadow: '0 18px 30px -14px rgb(8 64 120 / .45)' }} tabIndex={0}
      aria-label={`${index + 1}. ${v.title}. Alt plus arrow keys to reorder.`}
      onKeyDown={e => { if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); move(e.key === 'ArrowUp' ? -1 : 1); requestAnimationFrame(() => ref.current?.focus()); } }}>
      <span className="grip" aria-hidden="true" onPointerDown={e => { e.preventDefault(); drag.start(e); }} title="Drag to reorder"><i /><i /><i /></span>
      <span className="queue-n">{index + 1}</span>
      <a className="queue-thumb" href={watchUrl(id)} target="_blank" rel="noopener noreferrer" tabIndex={-1}>
        <img src={thumbUrl(id)} alt="" loading="lazy" width={96} height={54} />
      </a>
      <span className="queue-text">
        <a href={watchUrl(id)} target="_blank" rel="noopener noreferrer">{v.title}</a>
        <small>{data.games[v.game].name} · {duration(v.dur)}{watched ? ' · watched' : ''}</small>
      </span>
      <button type="button" className="icon-btn" aria-label={`Remove ${v.title} from queue`} onClick={() => dequeue([id])}>×</button>
    </Reorder.Item>
  );
}

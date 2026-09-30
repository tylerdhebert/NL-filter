import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, type Transition } from 'motion/react';

export const spring: Transition = { type: 'spring', stiffness: 520, damping: 30 };
export const jelly: Transition = { type: 'spring', stiffness: 560, damping: 22 };
export const soft: Transition = { type: 'spring', stiffness: 360, damping: 36 };

export function useMedia(query: string) {
  return useSyncExternalStore(cb => { const m = matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); }, () => matchMedia(query).matches);
}

// Close a floating layer on outside press, page scroll or resize.
export function useDismiss(open: boolean, refs: RefObject<HTMLElement | null>[], close: () => void, ignore?: string, closeOnScroll = true) {
  const latest = useRef(close); latest.current = close;
  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) => refs.some(r => r.current?.contains(t as Node)) || (!!ignore && t instanceof Element && !!t.closest(ignore));
    const press = (e: PointerEvent) => { if (!inside(e.target)) latest.current(); };
    const scroll = (e: Event) => { if (closeOnScroll && !inside(e.target) && !inside(document.activeElement)) latest.current(); };
    const resize = () => latest.current();
    addEventListener('pointerdown', press); addEventListener('scroll', scroll, true); addEventListener('resize', resize);
    return () => { removeEventListener('pointerdown', press); removeEventListener('scroll', scroll, true); removeEventListener('resize', resize); };
  }, [open]);
}

type Place = { top: number; left: number; minWidth: number; maxHeight: number; up: boolean; side?: boolean };
// Fixed position next to an anchor: below/above (flipping when there's no room), or beside it for tall panels.
export function usePlace(open: boolean, anchor: RefObject<HTMLElement | null>, layer: RefObject<HTMLElement | null>, opts: { minWidth?: number; prefer?: 'down' | 'up' | 'right'; align?: 'start' | 'end'; deps?: unknown[] } = {}) {
  const [place, setPlace] = useState<Place | null>(null);
  useLayoutEffect(() => {
    if (!open) { setPlace(null); return; }
    const a = anchor.current?.getBoundingClientRect(), el = layer.current;
    if (!a || !el) return;
    if (opts.prefer === 'right') {
      // Beside the anchor, centred on it and kept inside the viewport; the full window height is available.
      el.style.maxHeight = innerHeight - 24 + 'px';
      const h = el.offsetHeight, w = el.offsetWidth, top = Math.max(12, Math.min(a.top + a.height / 2 - h / 2, innerHeight - h - 12));
      if (innerWidth - a.right - 20 >= w) return setPlace({ top, left: a.right + 12, minWidth: 0, maxHeight: innerHeight - 24, up: false, side: true });
      // Too narrow to sit beside: centre it on screen instead of clamping it against an edge.
      return setPlace({ top, left: Math.max(8, (innerWidth - w) / 2), minWidth: 0, maxHeight: innerHeight - 24, up: false, side: true });
    }
    const below = innerHeight - a.bottom - 14, above = a.top - 14;
    const up = opts.prefer === 'up' ? above > 160 || above > below : below < 220 && above > below;
    const maxHeight = Math.min(440, up ? above : below);
    el.style.maxHeight = maxHeight + 'px'; el.style.minWidth = Math.max(a.width, opts.minWidth ?? 0) + 'px';
    const h = el.offsetHeight, w = el.offsetWidth;
    const left = Math.max(8, Math.min(opts.align === 'end' ? a.right - w : a.left, innerWidth - w - 8));
    setPlace({ top: up ? a.top - 6 - h : a.bottom + 6, left, minWidth: Math.max(a.width, opts.minWidth ?? 0), maxHeight, up });
  }, [open, ...(opts.deps ?? [])]);
  return place;
}

export const menuMotion = (up: boolean, side = false) => ({
  initial: side ? { opacity: 0, scaleX: 0.7, scaleY: 0.94 } : { opacity: 0, scaleX: 0.94, scaleY: 0.6 },
  animate: { opacity: 1, scaleX: 1, scaleY: 1, transition: jelly },
  exit: { opacity: 0, scaleX: 0.97, scaleY: 0.9, transition: { duration: 0.12 } },
  style: { transformOrigin: side ? 'left center' : up ? 'bottom center' : 'top center' },
});

export type Option = { value: string; label: string };
export function GelSelect({ value, options, onChange, label, className }: { value: string; options: Option[]; onChange: (v: string) => void; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const place = usePlace(open, btn, menu);
  const close = (focus = false) => { setOpen(false); if (focus) btn.current?.focus(); };
  useDismiss(open, [btn, menu], () => close());
  useEffect(() => { if (place) (menu.current?.querySelector('[aria-selected=true]') as HTMLElement ?? menu.current?.firstElementChild as HTMLElement)?.focus({ preventScroll: true }); }, [place]);
  const choose = (v: string) => { if (v !== value) onChange(v); close(true); };
  const onKey = (e: React.KeyboardEvent) => {
    const list = [...(menu.current?.children ?? [])] as HTMLElement[], i = list.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => { e.preventDefault(); list[(n + list.length) % list.length]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1); else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0); else if (e.key === 'End') go(list.length - 1);
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') close();
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const k = e.key.toLowerCase(), hit = [...list.slice(i + 1), ...list.slice(0, i + 1)].find(b => b.textContent!.toLowerCase().startsWith(k));
      if (hit) { e.preventDefault(); hit.focus(); }
    }
  };
  return (
    <div className={'dd ' + (className ?? '')}>
      <button ref={btn} type="button" className="dd-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={label}
        onClick={() => setOpen(o => !o)} onKeyDown={e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); } }}>
        <span>{options.find(o => o.value === value)?.label ?? ''}</span>
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div ref={menu} key="menu" role="listbox" aria-label={label} className="dd-menu gel" onKeyDown={onKey}
              {...menuMotion(!!place?.up)} style={{ ...menuMotion(!!place?.up).style, top: place?.top, left: place?.left, visibility: place ? 'visible' : 'hidden' }}>
              {options.map(o => (
                <button key={o.value} type="button" role="option" aria-selected={o.value === value} onClick={() => choose(o.value)}>{o.label}</button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>, document.body)}
    </div>
  );
}

// Filter-panel section whose body springs open and closed.
export function Section({ title, children, defaultOpen = true, aside }: { title: string; children: ReactNode; defaultOpen?: boolean; aside?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="fsec">
      <button type="button" className="fsec-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>
        <span>{title}</span>{aside}<motion.i className="chev" animate={{ rotate: open ? 0 : -90 }} transition={spring} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={id} className="fsec-body" key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={soft}>
            <div className="fsec-inner">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export const SearchIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.8" /><path d="m10.6 10.6 3.4 3.4" /></svg>
);
export const PlayIcon = () => <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.2 1.9v8.2L10 6z" fill="currentColor" /></svg>;
export const Check = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <motion.path d="M3.5 8.4 6.6 11.3 12.6 4.8" initial={false} animate={{ pathLength: on ? 1 : 0.001, opacity: on ? 1 : 0.55 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }} />
  </svg>
);

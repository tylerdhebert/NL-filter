import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { plural } from './data';
import { longDate, runtimeLabel, runtimeShort } from './streamData';
import { GelSelect, jelly, soft } from './ui';

export type DayStat = { count: number; runtime: number };
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + i).toLocaleDateString(undefined, { weekday: 'narrow' }));
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
export const monthOf = (day: string) => day.slice(0, 7);
export const monthLabel = (month: string) => new Date(month + '-15T12:00:00').toLocaleDateString(undefined, { month: 'long' });
const shiftMonth = (month: string, by: number) => { const d = new Date(month + '-15T12:00:00'); d.setMonth(d.getMonth() + by); return d.toLocaleDateString('en-CA').slice(0, 7); };
const shiftDay = (day: string, by: number) => { const d = new Date(day + 'T12:00:00'); d.setDate(d.getDate() + by); return d.toLocaleDateString('en-CA'); };

type Props = {
  stats: Map<string, DayStat>;      // days that have videos, with a count + runtime indicator
  enabled: Set<string>;             // which of those can be picked right now
  first: string; last: string;      // month bounds, YYYY-MM
  noun: string;                     // "stream" / "video", for labels
} & (
  | { mode: 'single'; value?: string; onPick: (day: string) => void }
  | { mode: 'range'; from: string; to: string; onRange: (from: string, to: string) => void }
);

// Month grid with per-day indicators. Single mode picks one day; range mode picks a start then an end.
export function Calendar(props: Props) {
  const { stats, enabled, first, last } = props;
  const anchorDay = props.mode === 'single' ? props.value : props.from || props.to;
  const [month, setMonth] = useState(monthOf(anchorDay || (last + '-01')));
  const [dir, setDir] = useState(0);
  const [hover, setHover] = useState('');
  const go = (next: string) => { if (next < first || next > last || next === month) return; setDir(next > month ? 1 : -1); setMonth(next); };
  useEffect(() => { if (props.mode === 'single' && props.value && monthOf(props.value) !== month) go(monthOf(props.value)); }, [props.mode === 'single' ? props.value : '']);
  // A typed date elsewhere brings its month into view (clicks are already in view, so this is a no-op for them).
  useEffect(() => { if (props.mode === 'range' && props.from) go(monthOf(props.from)); }, [props.mode === 'range' ? props.from : '']);
  useEffect(() => { if (props.mode === 'range' && props.to) go(monthOf(props.to)); }, [props.mode === 'range' ? props.to : '']);
  const years = Array.from({ length: +last.slice(0, 4) - +first.slice(0, 4) + 1 }, (_, i) => String(+last.slice(0, 4) - i));

  // In range mode, a lone start date previews the range up to whatever day is hovered.
  const range = props.mode === 'range'
    ? (props.from && !props.to && hover ? [props.from, hover].sort() : [props.from, props.to]) as [string, string]
    : undefined;
  const pick = (day: string) => {
    if (props.mode === 'single') return props.onPick(day);
    if (!props.from || props.to) props.onRange(day, '');
    else props.onRange(...([props.from, day].sort() as [string, string]));
  };
  const isPicked = (d: string) => props.mode === 'single' ? d === props.value : d === range![0] || d === range![1];
  const inRange = (d: string) => !!range && !!range[0] && !!range[1] && d > range[0] && d < range[1];

  return (
    <div className="cal">
      <div className="cal-head">
        <motion.button type="button" className="icon-btn" aria-label="Previous month" disabled={month <= first} onClick={() => go(shiftMonth(month, -1))} whileTap={{ scale: 0.85 }} transition={jelly}>‹</motion.button>
        <div className="cal-title">
          <GelSelect className="cal-month" label="Month" value={month.slice(5)} onChange={mm => go(month.slice(0, 5) + mm)}
            options={MONTHS.filter(mm => { const m = month.slice(0, 5) + mm; return m >= first && m <= last; }).map(mm => ({ value: mm, label: monthLabel('2024-' + mm) }))} />
          <GelSelect className="cal-year" label="Year" value={month.slice(0, 4)} options={years.map(y => ({ value: y, label: y }))}
            onChange={y => { const m = y + month.slice(4); go(m < first ? first : m > last ? last : m); }} />
        </div>
        <motion.button type="button" className="icon-btn" aria-label="Next month" disabled={month >= last} onClick={() => go(shiftMonth(month, 1))} whileTap={{ scale: 0.85 }} transition={jelly}>›</motion.button>
      </div>
      <div className="cal-week" aria-hidden="true">{WEEKDAYS.map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="cal-clip" onPointerLeave={() => setHover('')}>
        <AnimatePresence initial={false}>
          <Month key={month} month={month} dir={dir} stats={stats} enabled={enabled} noun={props.noun} onPick={pick} onMonth={go}
            isPicked={isPicked} inRange={inRange} onHover={props.mode === 'range' ? setHover : undefined} focusDay={anchorDay} />
        </AnimatePresence>
      </div>
    </div>
  );
}

function Month({ month, dir, stats, enabled, noun, onPick, onMonth, isPicked, inRange, onHover, focusDay }: {
  month: string; dir: number; stats: Map<string, DayStat>; enabled: Set<string>; noun: string; onPick: (d: string) => void; onMonth: (m: string) => void;
  isPicked: (d: string) => boolean; inRange: (d: string) => boolean; onHover?: (d: string) => void; focusDay?: string;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const [y, m] = month.split('-').map(Number);
  const lead = new Date(y, m - 1, 1).getDay(), days = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  const today = new Date().toLocaleDateString('en-CA');
  const focusable = focusDay && monthOf(focusDay) === month && enabled.has(focusDay) ? focusDay : cells.find(d => d && enabled.has(d));
  const max = Math.max(1, ...cells.map(d => (d && stats.get(d)?.runtime) || 0));
  // Arrow keys hop to the next pickable day, crossing months as needed.
  const onKey = (e: React.KeyboardEvent) => {
    const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[e.key];
    const from = (document.activeElement as HTMLElement)?.dataset.day;
    if (!step || !from) return;
    e.preventDefault();
    let d = from;
    for (let i = 0; i < 120; i++) { d = shiftDay(d, step); if (enabled.has(d)) break; }
    if (!enabled.has(d)) return;
    const cal = grid.current?.closest('.cal');
    const focus = () => (cal?.querySelector(`[data-day="${d}"]`) as HTMLElement | null)?.focus();
    if (monthOf(d) !== month) { onMonth(monthOf(d)); setTimeout(focus, 60); } else focus();
  };
  return (
    <motion.div ref={grid} className="cal-grid" role="grid" aria-label={monthLabel(month) + ' ' + y} onKeyDown={onKey}
      initial={{ opacity: 0, x: dir * 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -40 }} transition={soft}>
      {cells.map((d, i) => {
        if (!d) return <span key={'pad' + i} />;
        const s = stats.get(d), on = !!s && enabled.has(d);
        return (
          <button key={d} type="button" data-day={d} disabled={!on} tabIndex={d === focusable ? 0 : -1}
            className={'cal-day' + (s ? ' has' : '') + (d === today ? ' today' : '') + (inRange(d) ? ' in-range' : '')}
            aria-pressed={isPicked(d)} onClick={() => onPick(d)} onPointerEnter={onHover && on ? () => onHover(d) : undefined}
            aria-label={s ? `${longDate(d)}: ${plural(s.count, noun)}, ${runtimeLabel(s.runtime)}` : `${longDate(d)}: no ${noun}s`}
            style={s ? { '--heat': (0.25 + 0.75 * s.runtime / max).toFixed(2) } as React.CSSProperties : undefined}>
            <span className="cal-num">{+d.slice(8)}</span>
            {s && <span className="cal-count">{s.count}</span>}
            {s && <span className="cal-dur">{runtimeShort(s.runtime)}</span>}
          </button>
        );
      })}
    </motion.div>
  );
}

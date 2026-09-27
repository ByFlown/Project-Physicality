import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { dayIndex, formatDate, type LocalDate } from '../domain/dates';
import { niceTicks } from '../lib/ticks';
import { formatNumber } from '../lib/units';

function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(200, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export interface SeriesPoint {
  date: LocalDate;
  value: number;
}

/**
 * Single-series time chart: 2px line, 10% area wash, end dot with a surface
 * ring and end label, hairline grid, crosshair tooltip (pointer + keyboard),
 * and a table view for accessibility.
 */
export function LineChart({
  points,
  format = (v) => formatNumber(v, 1),
  color = 'var(--accent)',
  height = 200,
  label,
  area = true,
  dots,
  zeroBased = false,
  thresholds = [],
}: {
  points: SeriesPoint[];
  format?: (v: number) => string;
  color?: string;
  height?: number;
  label: string;
  area?: boolean;
  /** Optional raw observations drawn as faint dots behind the line. */
  dots?: SeriesPoint[];
  zeroBased?: boolean;
  thresholds?: { value: number; label: string }[];
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gradId = useId();
  const pad = { top: 16, right: 56, bottom: 24, left: 44 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;

  const geo = useMemo(() => {
    if (points.length === 0) return null;
    const all = [...points, ...(dots ?? [])];
    const xs = all.map((p) => dayIndex(p.date));
    const ys = [...all.map((p) => p.value), ...thresholds.map((t) => t.value)];
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs, x0 + 1);
    const ticks = niceTicks(zeroBased ? Math.min(0, ...ys) : Math.min(...ys), Math.max(...ys));
    const y0 = ticks[0];
    const y1 = ticks[ticks.length - 1];
    const sx = (d: LocalDate) => ((dayIndex(d) - x0) / (x1 - x0)) * w;
    const sy = (v: number) => h - ((v - y0) / (y1 - y0 || 1)) * h;
    const coords = points.map((p) => [sx(p.date), sy(p.value)] as const);
    const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
    const areaPath = `${line}L${coords[coords.length - 1][0].toFixed(1)},${h}L${coords[0][0].toFixed(1)},${h}Z`;
    return { sx, sy, ticks, coords, line, areaPath, x0, x1 };
  }, [points, dots, thresholds, w, h, zeroBased]);

  if (!geo) {
    return (
      <div ref={ref} className="flex items-center justify-center text-sm text-muted" style={{ height }}>
        Not enough data yet.
      </div>
    );
  }

  const nearest = (px: number) => {
    let best = 0;
    let bestD = Infinity;
    geo.coords.forEach(([x], i) => {
      const d = Math.abs(x - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setHover((i) => Math.max(0, (i ?? points.length) - 1));
    else if (e.key === 'ArrowRight') setHover((i) => Math.min(points.length - 1, (i ?? -1) + 1));
    else if (e.key === 'Escape') setHover(null);
    else return;
    e.preventDefault();
  };

  const last = geo.coords[geo.coords.length - 1];
  const hp = hover !== null ? points[hover] : null;
  const hc = hover !== null ? geo.coords[hover] : null;
  const xTicks = [
    points[0].date,
    points[Math.floor((points.length - 1) / 2)].date,
    points[points.length - 1].date,
  ].filter((d, i, arr) => arr.indexOf(d) === i);

  return (
    <div ref={ref} className="relative w-full min-w-0">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${label}. Latest value ${format(points[points.length - 1].value)}. Use arrow keys to inspect values.`}
        tabIndex={0}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
        onPointerMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          setHover(nearest(e.clientX - rect.left - pad.left));
        }}
        onPointerLeave={() => setHover(null)}
        className="block touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity={0.14} />
            <stop offset="1" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <g transform={`translate(${pad.left},${pad.top})`}>
          {geo.ticks.map((t) => (
            <g key={t}>
              <line x1={0} x2={w} y1={geo.sy(t)} y2={geo.sy(t)} stroke="var(--border)" strokeWidth={1} />
              <text x={-8} y={geo.sy(t)} dy="0.32em" textAnchor="end" className="num fill-muted text-[11px]">
                {format(t)}
              </text>
            </g>
          ))}
          {thresholds.map((t) => (
            <g key={t.label}>
              <line
                x1={0}
                x2={w}
                y1={geo.sy(t.value)}
                y2={geo.sy(t.value)}
                stroke="var(--muted)"
                strokeOpacity={0.5}
                strokeWidth={1}
              />
              <text x={w + 6} y={geo.sy(t.value)} dy="0.32em" className="fill-muted text-[10px]">
                {t.label}
              </text>
            </g>
          ))}
          {xTicks.map((d, i) => (
            <text
              key={d}
              x={geo.sx(d)}
              y={h + 16}
              textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
              className="fill-muted text-[11px]"
            >
              {formatDate(d)}
            </text>
          ))}
          {dots?.map((p) => (
            <circle
              key={`d-${p.date}`}
              cx={geo.sx(p.date)}
              cy={geo.sy(p.value)}
              r={2.5}
              fill={color}
              fillOpacity={0.3}
            />
          ))}
          {area && <path d={geo.areaPath} fill={`url(#${gradId})`} />}
          <path d={geo.line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={last[0]} cy={last[1]} r={4} fill={color} stroke="var(--surface)" strokeWidth={2} />
          {!thresholds.length && (
            <text x={last[0] + 8} y={last[1]} dy="0.32em" className="num fill-fg text-[12px] font-semibold">
              {format(points[points.length - 1].value)}
            </text>
          )}
          {hc && (
            <>
              <line x1={hc[0]} x2={hc[0]} y1={0} y2={h} stroke="var(--muted)" strokeWidth={1} />
              <circle cx={hc[0]} cy={hc[1]} r={4.5} fill={color} stroke="var(--surface)" strokeWidth={2} />
            </>
          )}
        </g>
      </svg>
      {hp && hc && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: Math.min(width - 120, Math.max(0, pad.left + hc[0] + 10)),
            top: Math.max(0, pad.top + hc[1] - 44),
          }}
        >
          <div className="num text-sm font-semibold text-fg">{format(hp.value)}</div>
          <div className="text-muted">{formatDate(hp.date, { dateStyle: 'medium' })}</div>
        </div>
      )}
      <DataTable
        label={label}
        rows={points.map((p) => [formatDate(p.date, { dateStyle: 'medium' }), format(p.value)])}
        headers={['Date', 'Value']}
      />
    </div>
  );
}

export function DataTable({ label, headers, rows }: { label: string; headers: string[]; rows: ReactNode[][] }) {
  return (
    <details className="mt-1 text-xs">
      <summary className="cursor-pointer text-muted hover:text-fg">Show data table</summary>
      <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-border">
        <table className="w-full text-left">
          <caption className="sr-only">{label}</caption>
          <thead className="sticky top-0 bg-surface-2">
            <tr>
              {headers.map((hd) => (
                <th key={hd} className="px-3 py-1.5 font-semibold">
                  {hd}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border">
                {r.map((c, j) => (
                  <td key={j} className="num px-3 py-1">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * Horizontal bars for weekly effective sets, with recessive reference lines for
 * the maintenance and growth doses. Bars ≤ 16px, 4px rounded data end.
 */
export function VolumeBars({
  rows,
  refs,
  max,
}: {
  rows: { key: string; label: string; value: number; href?: string }[];
  refs: { value: number; label: string }[];
  max: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const scale = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div>
      <div className="relative mb-1 ml-28 mr-12 h-4 text-[10px] text-muted">
        {refs.map((r) => (
          <span key={r.label} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: scale(r.value) }}>
            {r.label}
          </span>
        ))}
      </div>
      <ul className="flex flex-col gap-[2px]">
        {rows.map((r) => (
          <li
            key={r.key}
            className="flex items-center gap-2 rounded-md py-0.5"
            onPointerEnter={() => setHover(r.key)}
            onPointerLeave={() => setHover(null)}
          >
            <span className="w-26 shrink-0 truncate text-right text-xs text-muted">{r.label}</span>
            <div className="relative h-4 flex-1">
              {refs.map((ref) => (
                <span
                  key={ref.label}
                  className="absolute top-[-2px] bottom-[-2px] w-px bg-border"
                  style={{ left: scale(ref.value) }}
                />
              ))}
              <div
                className="absolute inset-y-0 left-0 rounded-r-[4px] transition-[width,filter]"
                style={{
                  width: scale(r.value),
                  background: 'var(--accent)',
                  filter: hover === r.key ? 'brightness(1.15)' : undefined,
                  minWidth: r.value > 0 ? 2 : 0,
                }}
              />
            </div>
            <span className="num w-10 shrink-0 text-xs font-semibold">{formatNumber(r.value, 1)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

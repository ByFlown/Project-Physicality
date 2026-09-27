import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { chordLength, chordMid } from '../../scan/geometry';
import { CHORD_LABELS, type Chord, type ChordId, type Pt, type ViewMarkup } from '../../scan/types';
import { cx } from '../../lib/cx';
import { cmToDisplay, lengthUnit, round, type UnitSystem } from '../../lib/units';

const LIMBS = new Set<ChordId>(['upperArm', 'forearm', 'thigh', 'calf']);

type Drag = { kind: 'chord'; id: ChordId; end: 0 | 1 } | { kind: 'top' } | { kind: 'floor' };

/**
 * Shows a scan photo with its measurement lines. Every endpoint and the
 * top-of-head / floor lines can be dragged (pointer) or nudged (arrow keys;
 * Shift for bigger steps) so detection mistakes are easy to fix.
 */
export function ScanEditor({
  photoUrl,
  markup,
  onChange,
  heightCm,
  units,
}: {
  photoUrl: string;
  markup: ViewMarkup;
  onChange: (next: ViewMarkup) => void;
  heightCm: number;
  units: UnitSystem;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [focus, setFocus] = useState<ChordId | null>(null);
  const { width: w, height: h } = markup;
  const r = Math.max(6, h * 0.012);
  const stroke = Math.max(1.5, h * 0.0028);
  const pxPerCm = (markup.floor - markup.top) / heightCm;
  const fmt = (px: number) => `${round(cmToDisplay(px / pxPerCm, units), 1)} ${lengthUnit(units)}`;

  const toSvg = (e: PointerEvent): Pt | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: Math.min(w, Math.max(0, p.x)), y: Math.min(h, Math.max(0, p.y)) };
  };

  const apply = (d: Drag, p: Pt) => {
    if (d.kind === 'top') onChange({ ...markup, top: Math.min(p.y, markup.floor - h * 0.3) });
    else if (d.kind === 'floor') onChange({ ...markup, floor: Math.max(p.y, markup.top + h * 0.3) });
    else {
      const chord = markup.chords[d.id];
      if (!chord) return;
      const next: Chord = d.end === 0 ? [p, chord[1]] : [chord[0], p];
      onChange({ ...markup, chords: { ...markup.chords, [d.id]: next } });
    }
  };

  const nudge = (d: Drag, e: KeyboardEvent) => {
    const step = e.shiftKey ? h / 40 : h / 400;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    if (d.kind === 'top') apply(d, { x: 0, y: markup.top + dy });
    else if (d.kind === 'floor') apply(d, { x: 0, y: markup.floor + dy });
    else {
      const pt = markup.chords[d.id]?.[d.end];
      if (pt) apply(d, { x: pt.x + dx, y: pt.y + dy });
    }
  };

  const handleProps = (d: Drag, label: string) => ({
    tabIndex: 0,
    role: 'slider',
    'aria-label': label,
    'aria-valuetext': label,
    onPointerDown: (e: PointerEvent) => {
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDrag(d);
      if (d.kind === 'chord') setFocus(d.id);
    },
    onKeyDown: (e: KeyboardEvent) => nudge(d, e),
    onFocus: () => d.kind === 'chord' && setFocus(d.id),
    style: { cursor: d.kind === 'chord' ? 'move' : 'ns-resize', touchAction: 'none' } as const,
  });

  const scaleLine = (kind: 'top' | 'floor', y: number, label: string) => (
    <g>
      <line
        x1={0}
        x2={w}
        y1={y}
        y2={y}
        stroke="#38bdf8"
        strokeWidth={stroke}
        strokeDasharray={`${stroke * 4} ${stroke * 3}`}
      />
      <rect
        x={w / 2 - r * 2.5}
        y={y - r * 0.9}
        width={r * 5}
        height={r * 1.8}
        rx={r * 0.9}
        fill="#38bdf8"
        stroke="#fff"
        strokeWidth={stroke}
        {...handleProps({ kind }, `${label} line. Use arrow keys to move.`)}
      />
      <text
        x={w / 2 + r * 3}
        y={y - r}
        fill="#fff"
        stroke="#000"
        strokeWidth={stroke * 0.8}
        paintOrder="stroke"
        fontSize={r * 1.6}
      >
        {label}
      </text>
    </g>
  );

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-border bg-black">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className="mx-auto block max-h-[70dvh] w-full overflow-visible select-none"
        preserveAspectRatio="xMidYMid meet"
        onPointerMove={(e) => {
          if (!drag) return;
          const p = toSvg(e);
          if (p) apply(drag, p);
        }}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        role="group"
        aria-label={`${markup.view === 'front' ? 'Front' : 'Side'} photo with adjustable measurement lines`}
      >
        <image href={photoUrl} x={0} y={0} width={w} height={h} />
        {scaleLine('top', markup.top, 'Top of head')}
        {scaleLine('floor', markup.floor, 'Floor')}
        {(Object.entries(markup.chords) as [ChordId, Chord][]).map(([id, c]) => {
          const active = focus === id;
          const m = chordMid(c);
          const color = active ? '#ff7a2f' : '#fbbf24';
          // Torso labels sit left of the line, limb labels right of it, so neighbours don't collide.
          const limb = markup.view === 'front' && LIMBS.has(id);
          const edge = limb ? (c[0].x > c[1].x ? c[0] : c[1]) : c[0].x < c[1].x ? c[0] : c[1];
          const labelX = edge.x + (limb ? r * 1.8 : -r * 1.8);
          return (
            <g key={id}>
              <line
                x1={c[0].x}
                y1={c[0].y}
                x2={c[1].x}
                y2={c[1].y}
                stroke="#000"
                strokeOpacity={0.6}
                strokeWidth={stroke * 3}
              />
              <line x1={c[0].x} y1={c[0].y} x2={c[1].x} y2={c[1].y} stroke={color} strokeWidth={stroke * 1.4} />
              {[0, 1].map((end) => (
                <circle
                  key={end}
                  cx={c[end].x}
                  cy={c[end].y}
                  r={r}
                  fill={color}
                  fillOpacity={0.85}
                  stroke="#fff"
                  strokeWidth={stroke}
                  {...handleProps(
                    { kind: 'chord', id, end: end as 0 | 1 },
                    `${CHORD_LABELS[id]} ${end === 0 ? 'first' : 'second'} edge, ${fmt(chordLength(c))}. Use arrow keys to move.`,
                  )}
                />
              ))}
              <text
                x={labelX}
                y={edge.y + r * 0.55}
                textAnchor={limb ? 'start' : 'end'}
                fill="#fff"
                stroke="#000"
                strokeWidth={stroke * 0.9}
                paintOrder="stroke"
                fontSize={r * (active ? 1.9 : 1.5)}
                fontWeight={active ? 700 : 500}
              >
                {CHORD_LABELS[id]}
              </text>
              {active && (
                <text
                  x={m.x}
                  y={m.y - r * 1.4}
                  textAnchor="middle"
                  fill="#fff"
                  stroke="#000"
                  strokeWidth={stroke * 0.9}
                  paintOrder="stroke"
                  fontSize={r * 1.9}
                  fontWeight={700}
                >
                  {fmt(chordLength(c))}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <ul className="flex flex-wrap gap-1.5 bg-surface p-2" aria-label="Measured lengths">
        {(Object.entries(markup.chords) as [ChordId, Chord][]).map(([id, c]) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => setFocus(id)}
              className={cx(
                'rounded-full border px-2.5 py-1 text-xs',
                focus === id ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-fg',
              )}
            >
              {CHORD_LABELS[id]} <span className="num font-semibold">{fmt(chordLength(c))}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

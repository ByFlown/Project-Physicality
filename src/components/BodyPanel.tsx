import { ScanLine } from 'lucide-react';
import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import type { BodyShape } from '../body3d/shape';
import type { MuscleVisual } from '../body3d/BodyScene';
import { bulgesOnDate, hasWebGL, muscleVisuals, type ColorMode } from '../body3d/visuals';
import { formatDate } from '../domain/dates';
import { useData } from '../store/hooks';
import type { Simulation } from '../domain/engine';
import { MUSCLE_IDS, MUSCLES, type MuscleId } from '../domain/muscles';
import { STATUS_META, TIER_LEGEND } from '../lib/colors';
import { useResolvedTheme } from '../lib/theme';
import { Segmented } from './ui';
import { cx } from '../lib/cx';

const BodyViewer = lazy(() => import('../body3d/BodyViewer'));

function Legend({ mode }: { mode: ColorMode }) {
  const items =
    mode === 'level'
      ? TIER_LEGEND.map((t) => ({ key: t.name, color: t.color, label: `${t.name} ${t.minLevel}+` }))
      : Object.entries(STATUS_META).map(([k, v]) => ({ key: k, color: v.color, label: v.label }));
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
      {items.map((i) => (
        <li key={i.key} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Fallback when WebGL is unavailable: a compact colour-coded muscle grid. */
function MuscleGrid({
  visuals,
  sim,
  onSelect,
}: {
  visuals: Record<MuscleId, MuscleVisual & { label: string }>;
  sim: Simulation;
  onSelect: (id: MuscleId) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
      {MUSCLE_IDS.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2 text-left text-sm"
        >
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: visuals[id].color }} />
            {MUSCLES[id].name}
          </span>
          <span className="num font-bold">{sim.muscles[id].info.level}</span>
        </button>
      ))}
    </div>
  );
}

export function BodyPanel({
  sim,
  shape,
  selected,
  onSelect,
  className,
  header,
}: {
  sim: Simulation;
  shape: BodyShape;
  selected?: MuscleId | null;
  onSelect?: (id: MuscleId) => void;
  className?: string;
  header?: ReactNode;
}) {
  const [mode, setMode] = useState<ColorMode>('level');
  const navigate = useNavigate();
  const theme = useResolvedTheme();
  const visuals = useMemo(() => muscleVisuals(sim, mode), [sim, mode]);
  const data = useData();
  const detail = data.settings.modelDetail;
  const scan = data.scans.length ? data.scans.reduce((a, b) => (b.date >= a.date ? b : a)) : null;
  const bulgesAtScan = useMemo(() => (scan ? bulgesOnDate(sim, scan.date) : null), [sim, scan]);
  const select = onSelect ?? ((id: MuscleId) => navigate(`/muscles/${id}`));
  const webgl = hasWebGL();

  return (
    <div className={cx('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {header}
        <Segmented
          ariaLabel="Colour muscles by"
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'level', label: 'Level' },
            { value: 'status', label: 'Status' },
          ]}
        />
      </div>
      {webgl ? (
        <Suspense
          fallback={
            <div
              className="flex h-[440px] items-center justify-center rounded-2xl text-sm text-muted sm:h-[560px]"
              style={{ background: 'var(--scene-bg)' }}
            >
              Loading 3D model…
            </div>
          }
        >
          <BodyViewer
            className="h-[440px] sm:h-[560px]"
            shape={shape}
            detail={detail}
            scan={scan}
            bulgesAtScan={bulgesAtScan}
            muscles={visuals}
            selected={selected}
            onSelect={select}
            dark={theme === 'dark'}
          />
        </Suspense>
      ) : (
        <MuscleGrid visuals={visuals} sim={sim} onSelect={select} />
      )}
      <Legend mode={mode} />
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <ScanLine size={14} />
        {detail === 'precise' && scan ? (
          <span>
            Precise model, calibrated to your body scan from {formatDate(scan.date, { dateStyle: 'medium' })}.{' '}
            <Link to="/scan" className="text-accent underline">
              Re-scan
            </Link>
          </span>
        ) : detail === 'precise' ? (
          <span>
            Scan your body to unlock the precise model.{' '}
            <Link to="/scan" className="text-accent underline">
              Start a scan
            </Link>
          </span>
        ) : (
          <span>Standard model. Switch to Precise in Settings to use your body scan.</span>
        )}
      </p>
    </div>
  );
}

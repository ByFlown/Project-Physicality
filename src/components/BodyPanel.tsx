import { ScanLine } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import type { BodyShape } from '../body3d/shape';
import type { MuscleVisual } from '../body3d/BodyScene';
import { bulgesOnDate, hasWebGL, muscleVisuals, type ColorMode } from '../body3d/visuals';
import { fittedScan, type RealisticBody } from '../body3d/human/realistic';
import { fitStoredScan } from '../scan/fitClient';
import type { BodyFit } from '../domain/schema';
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
  const profile = data.profile;
  // Older scans (and the demo's) have no fitted body yet: fit one from the stored numbers.
  const [storedFit, setStoredFit] = useState<{ id: string; body: BodyFit } | null>(null);
  const needsFit = detail === 'precise' && scan && !scan.body && profile ? scan : null;
  useEffect(() => {
    if (!needsFit || !profile) return;
    let live = true;
    fitStoredScan(needsFit, profile.sex).then(
      (body) => live && setStoredFit({ id: needsFit.id, body }),
      () => undefined, // keep the profile-predicted body
    );
    return () => {
      live = false;
    };
  }, [needsFit, profile]);
  const fitted = useMemo(
    () =>
      scan && !scan.body && storedFit?.id === scan.id ? { ...scan, body: storedFit.body } : fittedScan(data.scans),
    [scan, storedFit, data.scans],
  );
  // The realistic body: shaped by the latest fitted scan, else predicted from the profile at its
  // start; muscles and fat are drawn as changes since that moment.
  const realistic = useMemo<RealisticBody | null>(() => {
    if (!profile) return null;
    if (fitted?.body) {
      return {
        sex: profile.sex,
        statureM: fitted.heightCm / 100,
        coeffs: fitted.body.coeffs,
        anchorBulges: bulgesOnDate(sim, fitted.date),
        fatDelta: fitted.bodyFatPct !== undefined ? shape.bodyFatPct - fitted.bodyFatPct : 0,
        scanId: fitted.id,
      };
    }
    const startBf = profile.startBodyFatPct ?? shape.bodyFatPct;
    return {
      sex: profile.sex,
      statureM: profile.heightCm / 100,
      profile: {
        sex: profile.sex,
        heightCm: profile.heightCm,
        weightKg: profile.startWeightKg,
        bodyFatPct: startBf,
        ageYears: Number(profile.startDate.slice(0, 4)) - profile.birthYear,
      },
      anchorBulges: bulgesOnDate(sim, sim.startDate),
      fatDelta: shape.bodyFatPct - startBf,
    };
  }, [profile, fitted, sim, shape.bodyFatPct]);
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
            realistic={realistic}
            skinTone={data.settings.skinTone}
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
        {detail === 'precise' && fitted ? (
          <span>
            Realistic body fitted to your scan from {formatDate(fitted.date, { dateStyle: 'medium' })}; muscles show
            your progress since.{' '}
            <Link to="/scan" className="text-accent underline">
              Re-scan
            </Link>
          </span>
        ) : detail === 'precise' && scan ? (
          <span>
            Precise model, calibrated to your body scan from {formatDate(scan.date, { dateStyle: 'medium' })}.{' '}
            <Link to="/scan" className="text-accent underline">
              Re-scan
            </Link>{' '}
            to get a body fitted to your photos.
          </span>
        ) : detail === 'precise' ? (
          <span>
            Body predicted from your height, weight and body fat. Scan your body to shape it like you.{' '}
            <Link to="/scan" className="text-accent underline">
              Start a scan
            </Link>
          </span>
        ) : (
          <span>Standard model. Switch to Realistic in Settings for a body shaped like yours.</span>
        )}
      </p>
    </div>
  );
}

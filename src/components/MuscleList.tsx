import { Link } from 'react-router';
import type { Simulation } from '../domain/engine';
import { MUSCLE_IDS, MUSCLES, REGION_LABELS, type MuscleId, type MuscleRegion } from '../domain/muscles';
import { STATUS_META, tierColor } from '../lib/colors';
import { round } from '../lib/units';
import { Badge, ProgressBar } from './ui';
import { cx } from '../lib/cx';

export function MuscleRow({ sim, id, compact }: { sim: Simulation; id: MuscleId; compact?: boolean }) {
  const m = sim.muscles[id];
  const status = STATUS_META[m.status];
  const color = tierColor(m.info.level);
  return (
    <Link
      to={`/muscles/${id}`}
      className="group flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-surface-2"
    >
      <div
        className="num flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-black"
        style={{ color, background: `color-mix(in srgb, ${color} 15%, transparent)` }}
      >
        {m.info.level}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{MUSCLES[id].name}</span>
          {!compact && <span className="num shrink-0 text-xs text-muted">{round(m.weeklySets, 1)} sets/wk</span>}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <ProgressBar
            value={m.info.progress}
            color={color}
            className="h-1.5"
            label={`${MUSCLES[id].name} level progress`}
          />
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: status.color }}
            title={status.label}
            aria-label={status.label}
          />
        </div>
      </div>
    </Link>
  );
}

const REGION_ORDER: MuscleRegion[] = ['chest', 'shoulders', 'arms', 'back', 'core', 'legs'];

export function MuscleList({ sim, sort = 'region' }: { sim: Simulation; sort?: 'region' | 'level' | 'status' }) {
  if (sort === 'region') {
    return (
      <div className="flex flex-col gap-3">
        {REGION_ORDER.map((region) => (
          <div key={region}>
            <div className="px-2 text-[11px] font-semibold tracking-widest text-muted uppercase">
              {REGION_LABELS[region]}
            </div>
            {MUSCLE_IDS.filter((id) => MUSCLES[id].region === region).map((id) => (
              <MuscleRow key={id} sim={sim} id={id} />
            ))}
          </div>
        ))}
      </div>
    );
  }
  const order: Record<string, number> = { decaying: 0, idle: 1, maintaining: 2, growing: 3 };
  const ids = [...MUSCLE_IDS].sort((a, b) =>
    sort === 'level'
      ? sim.muscles[b].xp - sim.muscles[a].xp
      : order[sim.muscles[a].status] - order[sim.muscles[b].status] ||
        sim.muscles[a].daysUntilDecay - sim.muscles[b].daysUntilDecay,
  );
  return (
    <div>
      {ids.map((id) => (
        <MuscleRow key={id} sim={sim} id={id} />
      ))}
    </div>
  );
}

export function StatusBadge({ status }: { status: keyof typeof STATUS_META }) {
  const meta = STATUS_META[status];
  return (
    <Badge color={meta.color} className={cx()}>
      {meta.label}
    </Badge>
  );
}

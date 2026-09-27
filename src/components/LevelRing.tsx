import { tierColor } from '../lib/colors';

export function LevelRing({
  level,
  progress,
  size = 120,
  stroke = 10,
  label,
}: {
  level: number;
  progress: number;
  size?: number;
  stroke?: number;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = tierColor(level);
  const pct = Math.min(1, Math.max(0, progress));
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Level ${level}, ${Math.round(pct * 100)}% to next level`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {label && <span className="text-[10px] font-semibold tracking-widest text-muted uppercase">{label}</span>}
        <span className="num leading-none font-black" style={{ fontSize: size * 0.32 }}>
          {level}
        </span>
      </div>
    </div>
  );
}

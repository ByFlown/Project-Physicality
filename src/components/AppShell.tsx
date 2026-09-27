import {
  Activity,
  BookOpen,
  ClipboardList,
  Dumbbell,
  History,
  LayoutDashboard,
  LineChart,
  Ruler,
  Settings,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useSimulation } from '../store/hooks';
import { tierColor } from '../lib/colors';
import { cx } from '../lib/cx';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  mobile?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} />, mobile: true },
  { to: '/workout/new', label: 'Log workout', icon: <Dumbbell size={20} />, mobile: true },
  { to: '/check-in', label: 'Check-in', icon: <ClipboardList size={20} />, mobile: true },
  { to: '/progress', label: 'Progress', icon: <LineChart size={20} />, mobile: true },
  { to: '/history', label: 'History', icon: <History size={20} /> },
  { to: '/measurements', label: 'Measurements', icon: <Ruler size={20} /> },
  { to: '/exercises', label: 'Exercises', icon: <Activity size={20} /> },
  { to: '/how-it-works', label: 'How it works', icon: <BookOpen size={20} /> },
  { to: '/settings', label: 'Settings', icon: <Settings size={20} />, mobile: true },
];

function Brand() {
  const sim = useSimulation();
  return (
    <div className="flex items-center gap-3 px-2">
      <svg viewBox="0 0 32 32" className="h-9 w-9" aria-hidden>
        <rect width="32" height="32" rx="9" fill="var(--accent)" />
        <path
          d="M9 23V9h7.5a4.5 4.5 0 0 1 0 9H9"
          fill="none"
          stroke="var(--accent-fg)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="min-w-0">
        <div className="text-sm leading-tight font-bold">Physicality</div>
        {sim && (
          <div className="text-xs text-muted">
            Level{' '}
            <span className="num font-semibold" style={{ color: tierColor(sim.overall.level) }}>
              {sim.overall.level}
            </span>{' '}
            · {sim.overall.tier.name}
          </div>
        )}
      </div>
    </div>
  );
}

export function AppShell() {
  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r border-border bg-surface px-3 py-5 lg:flex">
        <Brand />
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
                  isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-bg/85 px-4 py-3 backdrop-blur lg:hidden">
          <Brand />
          <nav aria-label="Secondary" className="flex gap-1">
            {NAV.filter((n) => !n.mobile).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                aria-label={item.label}
                title={item.label}
                className={({ isActive }) =>
                  cx('rounded-lg p-2 transition', isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:text-fg')
                }
              >
                {item.icon}
              </NavLink>
            ))}
          </nav>
        </header>

        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-28 sm:px-6 lg:pb-10">
          <Outlet />
        </main>

        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        >
          {NAV.filter((n) => n.mobile).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cx(
                  'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
                  isActive ? 'text-accent' : 'text-muted',
                )
              }
            >
              {item.icon}
              {item.label.split(' ')[0]}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

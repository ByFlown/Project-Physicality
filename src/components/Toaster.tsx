import { cx } from '../lib/cx';
import { useToasts, type Toast } from './toast-store';

const TONE: Record<NonNullable<Toast['tone']>, string> = {
  default: 'border-border',
  success: 'border-good/50',
  warn: 'border-warn/50',
  level: 'border-accent/60',
};

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4 sm:top-auto sm:right-4 sm:bottom-4 sm:left-auto sm:items-end"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={cx(
            'animate-pop-in pointer-events-auto w-full max-w-sm rounded-2xl border bg-surface px-4 py-3 text-left shadow-xl',
            TONE[t.tone ?? 'default'],
          )}
        >
          <p className="font-semibold">{t.title}</p>
          {t.body && <p className="mt-0.5 text-sm text-muted">{t.body}</p>}
        </button>
      ))}
    </div>
  );
}

import { useEffect, useSyncExternalStore } from 'react';
import { useSettings } from '../store/hooks';

const query = '(prefers-color-scheme: dark)';

function subscribe(cb: () => void) {
  const mql = window.matchMedia?.(query);
  mql?.addEventListener('change', cb);
  return () => mql?.removeEventListener('change', cb);
}

function systemDark() {
  return window.matchMedia?.(query).matches ?? true;
}

export function useResolvedTheme(): 'dark' | 'light' {
  const { theme } = useSettings();
  const prefersDark = useSyncExternalStore(subscribe, systemDark, () => true);
  if (theme === 'system') return prefersDark ? 'dark' : 'light';
  return theme;
}

/** Keeps <html data-theme> and the browser UI colour in sync with the setting. */
export function useApplyTheme() {
  const resolved = useResolvedTheme();
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    try {
      localStorage.setItem('physicality:theme', resolved);
    } catch {
      // Only used to avoid a flash of the wrong theme on the next load.
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0b0d12' : '#f4f5f8');
  }, [resolved]);
}

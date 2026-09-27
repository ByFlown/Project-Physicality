import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from './components/Toaster';
import { Button } from './components/ui';
import Dashboard from './features/Dashboard';
import { useApplyTheme } from './lib/theme';
import { useAppStore, initStore } from './store/store';

const Onboarding = lazy(() => import('./features/onboarding/Onboarding'));
const WorkoutEditor = lazy(() => import('./features/workout/WorkoutEditor'));
const CheckInPage = lazy(() => import('./features/CheckIn'));
const MeasurementsPage = lazy(() => import('./features/Measurements'));
const MuscleDetail = lazy(() => import('./features/MuscleDetail'));
const HistoryPage = lazy(() => import('./features/History'));
const ProgressPage = lazy(() => import('./features/Progress'));
const ExercisesPage = lazy(() => import('./features/Exercises'));
const SettingsPage = lazy(() => import('./features/Settings'));
const HowItWorks = lazy(() => import('./features/HowItWorks'));

function Splash({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="h-10 w-10 animate-pulse rounded-xl bg-accent" aria-hidden />
      {children ?? <p className="text-sm text-muted">Loading…</p>}
    </div>
  );
}

function RequireProfile({ children }: { children: ReactNode }) {
  const hasProfile = useAppStore((s) => s.data.profile !== null);
  return hasProfile ? children : <Navigate to="/welcome" replace />;
}

function RecoveredNotice() {
  const recoveredFrom = useAppStore((s) => s.recoveredFrom);
  if (!recoveredFrom) return null;
  return (
    <div role="alert" className="border-b border-warn/40 bg-warn/10 px-4 py-2 text-center text-sm">
      Your saved data could not be read and was set aside ({recoveredFrom}). Import a backup from Settings to restore
      it.
    </div>
  );
}

export default function App() {
  const status = useAppStore((s) => s.status);
  const error = useAppStore((s) => s.error);
  useApplyTheme();

  useEffect(() => {
    void initStore();
  }, []);

  if (status === 'loading') return <Splash />;
  if (status === 'error') {
    return (
      <Splash>
        <p className="font-semibold">Storage is unavailable</p>
        <p className="max-w-sm text-sm text-muted">
          Project Physicality stores everything on this device. Your browser blocked storage access ({error}). Private
          browsing modes often do this.
        </p>
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </Splash>
    );
  }

  return (
    <BrowserRouter>
      <RecoveredNotice />
      <ErrorBoundary>
        <Suspense fallback={<Splash />}>
          <Routes>
            <Route path="/welcome" element={<Onboarding />} />
            <Route
              element={
                <RequireProfile>
                  <AppShell />
                </RequireProfile>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="workout/new" element={<WorkoutEditor />} />
              <Route path="workout/:id" element={<WorkoutEditor />} />
              <Route path="check-in" element={<CheckInPage />} />
              <Route path="measurements" element={<MeasurementsPage />} />
              <Route path="muscles/:id" element={<MuscleDetail />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="progress" element={<ProgressPage />} />
              <Route path="exercises" element={<ExercisesPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="how-it-works" element={<HowItWorks />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
      <Toaster />
    </BrowserRouter>
  );
}

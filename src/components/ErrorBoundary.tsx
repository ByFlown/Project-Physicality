import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center"
      >
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="text-sm text-muted">
          Your data is safe on this device. Reload the page to continue. If this keeps happening, export a backup from
          Settings.
        </p>
        <pre className="max-w-full overflow-auto rounded-lg bg-surface-2 p-3 text-left text-xs text-muted">
          {this.state.error.message}
        </pre>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => this.setState({ error: null })}>
            Dismiss
          </Button>
          <Button onClick={() => window.location.assign('/')}>Reload</Button>
        </div>
      </div>
    );
  }
}

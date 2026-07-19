import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  label?: string;
}

interface State {
  error: Error | null;
}

/** Catches React/Three render failures so the space doesn't die as a blank screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[GallerySphere] ${this.props.label ?? 'ErrorBoundary'}`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-fallback" role="alert">
          <h2>Something went wrong rendering your space</h2>
          <p>WebGL or a UI error interrupted GallerySphere. Your photos were only in memory for this session.</p>
          <button type="button" className="landing-action primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

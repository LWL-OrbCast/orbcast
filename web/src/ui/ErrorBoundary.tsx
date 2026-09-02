import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[web]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 32, fontFamily: 'system-ui', maxWidth: 640 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>Something broke on this page</h1>
        <pre style={{ marginTop: 16, whiteSpace: 'pre-wrap', fontSize: 13, color: '#b91c1c' }}>
          {this.state.error.message}
        </pre>
        <button
          type="button"
          style={{ marginTop: 16, padding: '8px 14px', borderRadius: 10, cursor: 'pointer' }}
          onClick={() => this.setState({ error: null })}
        >
          Retry
        </button>
      </div>
    );
  }
}

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface PageErrorBoundaryProps {
  children: ReactNode;
  onNavigate: (page: string) => void;
}

export class PageErrorBoundary extends Component<PageErrorBoundaryProps, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page rendering failed', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" style={{ padding: 32, textAlign: 'center' }}>
          <h2>This page could not be displayed</h2>
          <p>Reload the app or open Import / Export to restore a backup.</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" className="quote-toolbar-btn quote-toolbar-btn-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <a
              className="quote-toolbar-btn"
              href="#import_export"
              onClick={event => {
                event.preventDefault();
                this.props.onNavigate('import_export');
              }}
            >
              Import / Export
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

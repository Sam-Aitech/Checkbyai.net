import React, { type ErrorInfo, type ReactNode } from "react";

function FallbackUI() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center shadow-lg">
        <div className="w-12 h-12 bg-primary/10 rounded-xl mx-auto mb-6 flex items-center justify-center">
          <span className="text-primary font-bold text-xl">!</span>
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-3">Something went wrong</h1>
        <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
          Please refresh the page. If the problem persists, contact{" "}
          <a
            href="mailto:support@checkbyai.net"
            className="text-primary hover:underline"
          >
            support@checkbyai.net
          </a>
        </p>
        <button
          onClick={() => window.location.reload()}
          className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 px-4 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Refresh page
        </button>
      </div>
    </div>
  );
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.hasError) {
      return <FallbackUI />;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;

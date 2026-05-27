import { Component, ReactNode, ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Minimal, production-grade error boundary.
 *
 * Usage:
 *   <ErrorBoundary fallback={<p>Something went wrong.</p>}>
 *     <MyPage />
 *   </ErrorBoundary>
 *
 * Logs via console.error; in production you may pipe to Sentry, etc.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_error: Error): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="p-6 text-center text-destructive">
            <p className="text-sm font-medium">Something went wrong.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Please reload the page or try again later.
            </p>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

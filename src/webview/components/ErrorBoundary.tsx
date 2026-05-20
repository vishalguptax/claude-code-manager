/**
 * Preact class-component error boundary. Captures render-tree exceptions and
 * renders an EmptyState fallback so the rest of the webview stays interactive.
 */
import { Component, type ComponentChildren } from "preact";
import { EmptyState } from "./EmptyState";

export interface ErrorBoundaryProps {
  children?: ComponentChildren;
  fallback?: ComponentChildren;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  componentDidCatch(err: unknown): void {
    console.error("[claude-manager] ErrorBoundary caught", err);
    this.setState({ hasError: true });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <EmptyState title="Something went wrong" />;
    }
    return this.props.children;
  }
}

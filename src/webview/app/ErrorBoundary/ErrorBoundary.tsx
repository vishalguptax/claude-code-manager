/**
 * Preact class-component error boundary. Captures render-tree exceptions and
 * renders an EmptyState fallback so the rest of the webview stays interactive.
 */
import { Component, type ComponentChildren } from "preact";
import { recordError } from "../../shared/model";
import { EmptyState } from "../../shared/ui";

export interface ErrorBoundaryProps {
  children?: ComponentChildren;
  fallback?: ComponentChildren;
}

interface ErrorBoundaryState {
  hasError: boolean;
  /** The thrown error's message, shown in the fallback. */
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: "" };

  componentDidCatch(err: unknown): void {
    console.error("[claude-manager] ErrorBoundary caught", err);
    recordError("render", err);
    // The message is shown, not just logged: the panel is not a browser tab,
    // so reading the console means knowing that "Developer: Open Webview
    // Developer Tools" exists. A bare "Something went wrong" leaves a bug
    // report with nothing in it.
    this.setState({ hasError: true, message: err instanceof Error ? err.message : String(err) });
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <EmptyState
            title="Something went wrong"
            description={this.state.message || undefined}
          />
        )
      );
    }
    return this.props.children;
  }
}

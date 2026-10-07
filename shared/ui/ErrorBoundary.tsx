import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Rendered instead of `children` once a descendant throws while rendering. */
  fallback: (controls: { retry: () => void }) => ReactNode;
  /** The boundary clears itself whenever any of these values change (e.g. a fresh snapshot revision). */
  resetKeys?: readonly unknown[];
}

interface State {
  failed: boolean;
}

/**
 * Contains a render crash to one subtree, so a single corrupted ticket payload
 * cannot blank the whole kitchen board.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "Render isolated by ErrorBoundary:",
      error.message,
      info.componentStack,
    );
  }

  componentDidUpdate(previous: Props) {
    const keys = this.props.resetKeys ?? [];
    const before = previous.resetKeys ?? [];
    if (
      this.state.failed &&
      (keys.length !== before.length ||
        keys.some((key, index) => !Object.is(key, before[index])))
    )
      this.setState({ failed: false });
  }

  private retry = () => this.setState({ failed: false });

  render() {
    return this.state.failed
      ? this.props.fallback({ retry: this.retry })
      : this.props.children;
  }
}

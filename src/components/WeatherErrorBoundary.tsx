import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Called when the boundary catches — lets App switch back to explore mode. */
  onFallback?: () => void;
}

interface State {
  hasError: boolean;
}

export default class WeatherErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[WeatherErrorBoundary]', error, info.componentStack);
    this.props.onFallback?.();
  }

  componentDidUpdate(prevProps: Props): void {
    // Reset the error state when the parent re-mounts children (e.g.
    // user switches back to weather mode after a recovery).
    if (this.state.hasError && prevProps.children !== this.props.children) {
      this.setState({ hasError: false });
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full bg-gray-800/90 text-cream font-mono text-[10px] tracking-[1.5px] uppercase shadow-lg">
          Weather data unavailable
        </div>
      );
    }
    return this.props.children;
  }
}

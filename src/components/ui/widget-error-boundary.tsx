'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class WidgetErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col items-center justify-center min-h-[100px] gap-2">
            <AlertTriangle className="h-5 w-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground text-center">
              Erro ao carregar este widget
            </p>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

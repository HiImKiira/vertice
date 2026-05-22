"use client";

import { Component, type ReactNode } from "react";

interface State {
  error: Error | null;
}

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Etiqueta para console.error y para el mensaje fallback default */
  label?: string;
}

/**
 * Error boundary local que evita que un crash de un componente tumbe
 * toda la página al render-error global de Next.js.
 *
 * Útil para envolver módulos no-críticos (banners, panels) que pueden
 * fallar en algunos navegadores o por estados imprevistos.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error(
      `[ErrorBoundary${this.props.label ? ` ${this.props.label}` : ""}]`,
      error,
      info,
    );
  }

  reset = () => {
    this.setState({ error: null });
  };

  override render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
      return (
        <div className="rounded-xl border border-red-400/30 bg-red-500/[0.06] p-3 text-xs text-red-200">
          <p className="font-semibold">
            {this.props.label ?? "Componente"} falló — no afecta el resto de la app.
          </p>
          <p className="mt-1 break-words font-mono text-[10px] opacity-70">
            {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="mt-2 rounded-md border border-red-400/40 bg-red-500/15 px-2.5 py-1 text-[10px] font-semibold text-red-100 hover:bg-red-500/30"
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

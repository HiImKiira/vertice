/**
 * VortexLoader: marca V Vortex animada para estados de carga.
 *
 * - "spinner" (default): V con sus caras pulsando alternadas + glow
 * - "overlay": full-screen blur con el V grande + texto contextual
 */

interface VortexLoaderProps {
  size?: number;
  className?: string;
}

export function VortexLoader({ size = 96, className }: VortexLoaderProps) {
  return (
    <div
      className={`relative inline-block ${className ?? ""}`}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Cargando Vortex"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 200 200"
        className="vortex-loader-svg h-full w-full"
      >
        <defs>
          <linearGradient id="vlL" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#93C5FD" />
            <stop offset="50%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#1D4ED8" />
          </linearGradient>
          <linearGradient id="vlR" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1D4ED8" />
            <stop offset="100%" stopColor="#0F2E70" />
          </linearGradient>
          <linearGradient id="vlSeam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E0F2FE" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#E0F2FE" stopOpacity="0" />
          </linearGradient>
          <filter id="vlGlow">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Caras del V con pulso alternado */}
        <polygon
          className="vortex-face vortex-face-left"
          points="20,30 55,30 100,109 100,170"
          fill="url(#vlL)"
          filter="url(#vlGlow)"
        />
        <polygon
          className="vortex-face vortex-face-right"
          points="100,109 145,30 180,30 100,170"
          fill="url(#vlR)"
          filter="url(#vlGlow)"
        />
        <line
          className="vortex-seam"
          x1="100" y1="109" x2="100" y2="170"
          stroke="url(#vlSeam)" strokeWidth="1.6"
        />
      </svg>

      {/* Ring exterior pulsando */}
      <div className="vortex-loader-ring" />
    </div>
  );
}

interface LoadingOverlayProps {
  message?: string;
  hint?: string;
  size?: number;
}

export function LoadingOverlay({ message = "Cargando...", hint, size = 96 }: LoadingOverlayProps) {
  return (
    <div className="overlay-loader animate-fade-in">
      <VortexLoader size={size} />
      <p className="overlay-loader-text mt-2">{message}</p>
      {hint && <p className="text-xs text-muted-2">{hint}</p>}
    </div>
  );
}

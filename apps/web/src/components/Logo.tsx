interface LogoProps {
  withWordmark?: boolean;
  className?: string;
  width?: number | string;
  height?: number | string;
  /** Variante de color: "blue" (default Vortex) o "gold" (premium accent para PDF). */
  variant?: "blue" | "gold";
}

/**
 * Marca de Vortex. Símbolo facetado en V con dos caras que se encuentran en
 * un vértice. Variante por defecto: azul (identidad Vortex). Variante gold
 * disponible para PDFs y momentos premium.
 */
export function Logo({ withWordmark = false, className, width, height, variant = "blue" }: LogoProps) {
  const id = variant === "blue" ? "vBlue" : "vGold";
  const idR = variant === "blue" ? "vBlueR" : "vGoldR";
  const idSeam = variant === "blue" ? "vBlueSeam" : "vGoldSeam";

  const palette = variant === "blue"
    ? { l1: "#93C5FD", l2: "#3B82F6", l3: "#1D4ED8", r1: "#1D4ED8", r2: "#0F2E70", seam1: "#E0F2FE", seam2: "#E0F2FE" }
    : { l1: "#F1CB7E", l2: "#C9A961", l3: "#85692A", r1: "#A88944", r2: "#3F2F11", seam1: "#FFF6D5", seam2: "#FFF6D5" };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={withWordmark ? "0 0 820 220" : "0 0 200 200"}
      role="img"
      aria-label="Vortex"
      className={className}
      width={width}
      height={height}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.l1} />
          <stop offset="50%" stopColor={palette.l2} />
          <stop offset="100%" stopColor={palette.l3} />
        </linearGradient>
        <linearGradient id={idR} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.r1} />
          <stop offset="100%" stopColor={palette.r2} />
        </linearGradient>
        <linearGradient id={idSeam} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.seam1} stopOpacity="0.85" />
          <stop offset="100%" stopColor={palette.seam2} stopOpacity="0" />
        </linearGradient>
      </defs>

      {withWordmark ? (
        <>
          <g transform="translate(30, 20)">
            <polygon points="20,30 55,30 100,109 100,170" fill={`url(#${id})`} />
            <polygon points="100,109 145,30 180,30 100,170" fill={`url(#${idR})`} />
            <line x1="100" y1="109" x2="100" y2="170" stroke={`url(#${idSeam})`} strokeWidth="1.4" />
          </g>
          <text
            x="260" y="130"
            fontFamily="'Syne', Georgia, serif"
            fontSize="96" fontWeight="700"
            letterSpacing="0.04em"
            fill="currentColor"
          >
            VORTEX
          </text>
        </>
      ) : (
        <>
          <polygon points="20,30 55,30 100,109 100,170" fill={`url(#${id})`} />
          <polygon points="100,109 145,30 180,30 100,170" fill={`url(#${idR})`} />
          <line x1="100" y1="109" x2="100" y2="170" stroke={`url(#${idSeam})`} strokeWidth="1.4" />
        </>
      )}
    </svg>
  );
}

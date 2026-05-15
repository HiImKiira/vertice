interface LogoProps {
  /** Mostrar wordmark "VÉRTICE" + tagline. Si es `false`, solo el símbolo. */
  withWordmark?: boolean;
  /** Color del wordmark. Default usa `currentColor`. */
  wordmarkColor?: string;
  /** Color del tagline (línea inferior). Si no se especifica, hereda del wordmark con opacity. */
  taglineColor?: string;
  className?: string;
  width?: number | string;
  height?: number | string;
}

/**
 * Marca oficial de Vértice. Renderiza el símbolo facetado (V) y, opcionalmente,
 * el wordmark serif con tagline. Diseñado para escalar de 24 px (mark) a tamaños
 * arbitrarios. El símbolo siempre va en oro; el wordmark hereda `currentColor`.
 */
export function Logo({
  withWordmark = true,
  wordmarkColor = "currentColor",
  taglineColor,
  className,
  width,
  height,
}: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={withWordmark ? "0 0 820 220" : "0 0 200 200"}
      role="img"
      aria-label="Vértice"
      className={className}
      width={width}
      height={height}
    >
      <defs>
        <linearGradient id="vL" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F1CB7E" />
          <stop offset="50%" stopColor="#C9A961" />
          <stop offset="100%" stopColor="#85692A" />
        </linearGradient>
        <linearGradient id="vR" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#A88944" />
          <stop offset="55%" stopColor="#6E5520" />
          <stop offset="100%" stopColor="#3F2F11" />
        </linearGradient>
        <linearGradient id="vSeam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFF6D5" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#FFF6D5" stopOpacity="0" />
        </linearGradient>
      </defs>

      {withWordmark ? (
        <>
          <g transform="translate(30, 20)">
            <polygon points="20,30 55,30 100,109 100,170" fill="url(#vL)" />
            <polygon points="100,109 145,30 180,30 100,170" fill="url(#vR)" />
            <line x1="100" y1="109" x2="100" y2="170" stroke="url(#vSeam)" strokeWidth="1.4" />
          </g>
          <text
            x="260"
            y="130"
            fontFamily='Georgia, "EB Garamond", "Times New Roman", serif'
            fontSize="96"
            fontWeight="400"
            letterSpacing="0.06em"
            fill={wordmarkColor}
          >
            VÉRTICE
          </text>
          <text
            x="262"
            y="166"
            fontFamily='ui-sans-serif, system-ui, "Segoe UI", Inter, sans-serif'
            fontSize="12.5"
            fontWeight="600"
            letterSpacing="0.36em"
            fill={taglineColor ?? wordmarkColor}
            opacity={taglineColor ? 1 : 0.6}
          >
            ASISTENCIA · OPERACIÓN · DATOS
          </text>
        </>
      ) : (
        <>
          <polygon points="20,30 55,30 100,109 100,170" fill="url(#vL)" />
          <polygon points="100,109 145,30 180,30 100,170" fill="url(#vR)" />
          <line x1="100" y1="109" x2="100" y2="170" stroke="url(#vSeam)" strokeWidth="1.4" />
        </>
      )}
    </svg>
  );
}

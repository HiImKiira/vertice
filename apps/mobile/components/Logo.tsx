import Svg, { Defs, LinearGradient, Line, Polygon, Stop, G, Text as SvgText } from "react-native-svg";

interface LogoProps {
  width?: number;
  height?: number;
  withWordmark?: boolean;
  wordmarkColor?: string;
}

/**
 * Marca de Vértice para React Native. Renderiza el símbolo facetado y,
 * opcionalmente, el wordmark serif.
 */
export function Logo({ width = 200, height = 200, withWordmark = false, wordmarkColor = "#F4F0E8" }: LogoProps) {
  const viewBox = withWordmark ? "0 0 820 220" : "0 0 200 200";
  return (
    <Svg width={width} height={height} viewBox={viewBox}>
      <Defs>
        <LinearGradient id="vL" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#F1CB7E" />
          <Stop offset="50%" stopColor="#C9A961" />
          <Stop offset="100%" stopColor="#85692A" />
        </LinearGradient>
        <LinearGradient id="vR" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#A88944" />
          <Stop offset="55%" stopColor="#6E5520" />
          <Stop offset="100%" stopColor="#3F2F11" />
        </LinearGradient>
        <LinearGradient id="vSeam" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#FFF6D5" stopOpacity="0.85" />
          <Stop offset="100%" stopColor="#FFF6D5" stopOpacity="0" />
        </LinearGradient>
      </Defs>

      {withWordmark ? (
        <>
          <G x={30} y={20}>
            <Polygon points="20,30 55,30 100,109 100,170" fill="url(#vL)" />
            <Polygon points="100,109 145,30 180,30 100,170" fill="url(#vR)" />
            <Line x1="100" y1="109" x2="100" y2="170" stroke="url(#vSeam)" strokeWidth={1.4} />
          </G>
          <SvgText x="260" y="130" fontFamily="Georgia" fontSize="96" fontWeight="400" fill={wordmarkColor}>
            VÉRTICE
          </SvgText>
        </>
      ) : (
        <>
          <Polygon points="20,30 55,30 100,109 100,170" fill="url(#vL)" />
          <Polygon points="100,109 145,30 180,30 100,170" fill="url(#vR)" />
          <Line x1="100" y1="109" x2="100" y2="170" stroke="url(#vSeam)" strokeWidth={1.4} />
        </>
      )}
    </Svg>
  );
}

import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type TimberTabIconProps = {
  size: number;
  color: ColorValue;
};

/** A felled timber with cut-end rings and a small leafy sprig for the Logs tab. */
export function TimberTabIcon({ size, color }: TimberTabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessible={false}>
      <Rect x={2.5} y={9.5} width={18} height={9} rx={4.5} stroke={color} strokeWidth={1.8} />
      <Circle cx={16.5} cy={14} r={3.5} stroke={color} strokeWidth={1.5} />
      <Circle cx={16.5} cy={14} r={1.5} stroke={color} strokeWidth={1.2} />
      <Path d="M9 9.5C9.6 7.4 10.5 6 12.3 4.7" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <Path d="M11.2 5.6C12.5 4.2 14.2 4.4 14.7 4.7C14.4 6.1 13.1 7.1 11.2 5.6Z" fill={color} />
    </Svg>
  );
}

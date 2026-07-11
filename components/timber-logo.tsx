import { Fragment } from 'react';
import Svg, { Circle, Rect } from 'react-native-svg';

/**
 * Timber stacked-log-ends logo. Mirrors the geometry in
 * scripts/generate-icons.js so the in-app mark matches the app icon.
 * Renders in a 1024x1024 viewBox.
 */

const GROUND = '#111111';
const BARK = '#4A3324';
const SAPWOOD = '#6E4A30';
const FACE = '#C9A567';
const RING = '#E54242';
const PITH = '#E54242';

const R = 112;
const LOGS = [
  // bottom row (touching, tangent — no overlap)
  { cx: 288, cy: 706 },
  { cx: 512, cy: 706 },
  { cx: 736, cy: 706 },
  // middle row (resting tangent in the crevices)
  { cx: 400, cy: 512 },
  { cx: 624, cy: 512 },
  // top
  { cx: 512, cy: 318 },
];

type Props = {
  size?: number;
  /** Draw the green background behind the logs (badge look). */
  withBackground?: boolean;
};

export function TimberLogo({ size = 96, withBackground = false }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      {withBackground && <Rect x={0} y={0} width={1024} height={1024} rx={220} fill={GROUND} />}
      {LOGS.map((l) => (
        <Fragment key={`${l.cx}-${l.cy}`}>
          <Circle cx={l.cx} cy={l.cy} r={R} fill={BARK} />
          <Circle cx={l.cx} cy={l.cy} r={R * 0.82} fill={SAPWOOD} />
          <Circle cx={l.cx} cy={l.cy} r={R * 0.72} fill={FACE} />
          <Circle cx={l.cx} cy={l.cy} r={R * 0.5} fill="none" stroke={RING} strokeWidth={10} />
          <Circle cx={l.cx} cy={l.cy} r={R * 0.28} fill="none" stroke={RING} strokeWidth={10} />
          <Circle cx={l.cx} cy={l.cy} r={14} fill={PITH} />
        </Fragment>
      ))}
    </Svg>
  );
}

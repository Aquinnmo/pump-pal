import type { MuscleId } from '@/constants/muscles';

export type MuscleMapView = 'anterior' | 'posterior';

export interface MusclePebble {
  id: string;
  view: MuscleMapView;
  muscle: MuscleId | null;
  /** Tap target circle in viewbox units — see MuscleLoadMap's hit testing. */
  hit: { x: number; y: number; r: number };
  d: string;
}

export interface BodySilhouette {
  view: MuscleMapView;
  d: string;
}

export const MUSCLE_MAP_VIEWBOX = { width: 360, height: 448 } as const;

// This file is deliberately handwritten and stable. The large, generated
// registry lives next door so changing the generator never overwrites types.
export { BODY_SILHOUETTES, MUSCLE_PEBBLES } from './muscle-map.generated';

import { MUSCLE_PEBBLES as PEBBLES } from './muscle-map.generated';

const TAPPABLE = PEBBLES.filter((pebble) => pebble.muscle != null);
/** Slack in viewbox units, so a tap near a tile's edge still lands on it. */
const TAP_SLACK = 6;

/**
 * Resolve a point in viewbox coordinates to the muscle whose tile it hits.
 *
 * react-native-svg's per-Path `onPress` does not fire reliably under the new
 * architecture, so the map hit-tests taps itself: the nearest tile center
 * within its own radius wins, which makes the tiles behave like a Voronoi
 * diagram over the figure. Points on a neutral tile (head, hands, feet) or off
 * the body resolve to null.
 */
export function muscleAtPoint(x: number, y: number): MuscleId | null {
  let closest: MuscleId | null = null;
  let best = Infinity;
  for (const pebble of TAPPABLE) {
    const distance = Math.hypot(x - pebble.hit.x, y - pebble.hit.y);
    if (distance < best && distance <= pebble.hit.r + TAP_SLACK) {
      best = distance;
      closest = pebble.muscle;
    }
  }
  return closest;
}

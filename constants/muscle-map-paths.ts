import type { MuscleId } from '@/constants/muscles';

export type MuscleMapView = 'anterior' | 'posterior';

export interface MusclePebble {
  id: string;
  view: MuscleMapView;
  muscle: MuscleId | null;
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

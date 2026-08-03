import type { MuscleId } from '@/constants/muscles';

export const MUSCLE_MAP_NO_DATA_COLOR = '#4b4b4b';
export const MUSCLE_MAP_SCALE = {
  low: '#60a5fa',
  middle: '#888888',
  high: '#f59e0b',
} as const;

function channel(from: number, to: number, ratio: number): number {
  return Math.round(from + (to - from) * ratio);
}

function interpolate(from: string, to: string, ratio: number): string {
  const start = Number.parseInt(from.slice(1), 16);
  const end = Number.parseInt(to.slice(1), 16);
  const channels = [16, 8, 0].map((shift) =>
    channel((start >> shift) & 0xff, (end >> shift) & 0xff, ratio)
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${channels.join('')}`;
}

/** Shared red–green-safe map scale: blue at 0, gray at 50, and amber at 100. */
export function muscleMapColor(score: number): string {
  const bounded = Math.min(Math.max(score, 0), 100);
  return bounded <= 50
    ? interpolate(MUSCLE_MAP_SCALE.low, MUSCLE_MAP_SCALE.middle, bounded / 50)
    : interpolate(MUSCLE_MAP_SCALE.middle, MUSCLE_MAP_SCALE.high, (bounded - 50) / 50);
}

export type MuscleMapScores = ReadonlyMap<MuscleId, number | null>;

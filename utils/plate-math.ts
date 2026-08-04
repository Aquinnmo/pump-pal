// Plate math for the active-workout plate calculator. lb-only, matching the rest of
// the app (see components/workout/exercise-card.tsx's hardcoded "Weight (lbs)").

export const PLATE_DENOMS = [45, 35, 25, 10, 5, 2.5, 1, 0.5, 0.25] as const;

export type PlateCounts = Record<number, number>;

// Everything is solved in quarter-pound integers so fractional plates cannot drift.
const UNIT = 0.25;
const MAX_LOAD = 2000;

const DENOM_UNITS = PLATE_DENOMS.map((d) => Math.round(d / UNIT));

/**
 * Fewest plates that hit `load`, snapped to the nearest 0.25 lb.
 *
 * Min-count DP rather than greedy, because greedy overloads the bar on this set: 60 lb
 * greedily takes 45 + 10 + 5 where 35 + 25 is two plates. Denominations are walked
 * largest-first with a strict improvement test, so equal-count solutions resolve to the
 * bigger plates.
 */
export function solvePlates(load: number): PlateCounts {
  const target = Math.max(0, Math.round(Math.min(load, MAX_LOAD) / UNIT));
  const counts: PlateCounts = {};
  if (target === 0) return counts;

  const best = new Array<number>(target + 1).fill(Infinity);
  const pick = new Array<number>(target + 1).fill(-1);
  best[0] = 0;

  for (let t = 1; t <= target; t++) {
    for (let d = 0; d < DENOM_UNITS.length; d++) {
      const prev = t - DENOM_UNITS[d];
      if (prev >= 0 && best[prev] + 1 < best[t]) {
        best[t] = best[prev] + 1;
        pick[t] = d;
      }
    }
  }

  // The 0.25 lb plate is one unit, so every normalized target is reachable.
  if (best[target] === Infinity) return counts;

  for (let t = target; t > 0; t -= DENOM_UNITS[pick[t]]) {
    const denom = PLATE_DENOMS[pick[t]];
    counts[denom] = (counts[denom] ?? 0) + 1;
  }
  return counts;
}

/** Sum of denom * count. */
export function platesWeight(counts: PlateCounts): number {
  return PLATE_DENOMS.reduce((sum, d) => sum + d * (counts[d] ?? 0), 0);
}

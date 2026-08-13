import assert from 'node:assert/strict';

import { PLATE_DENOMS, platesWeight, solvePlates } from '@/lib/plate-math';

const plateCount = (counts: Record<number, number>) => Object.values(counts).reduce((sum, count) => sum + count, 0);

// Small exhaustive check used only to prove that the expected solution cannot be
// made with fewer plates. It deliberately does not reuse the solver's DP state.
const canMakeWithAtMost = (target: number, remaining: number, start = 0): boolean => {
  if (target === 0) return true;
  if (remaining === 0) return false;

  return PLATE_DENOMS.slice(start).some(
    (denom, index) => denom <= target && canMakeWithAtMost(target - denom, remaining - 1, start + index)
  );
};

const assertMinimumSolution = (load: number, expected: Record<number, number>) => {
  const actual = solvePlates(load);
  assert.deepEqual(actual, expected);
  assert.equal(platesWeight(actual), load);
  assert.equal(canMakeWithAtMost(load, plateCount(actual) - 1), false);
};

// Greedy would select 45 + 10 + 5; the minimum coin-change solution is two plates.
assertMinimumSolution(60, { 35: 1, 25: 1 });

// Equal-count answers prefer the larger denominations, preserving the solver's
// largest-first tie-breaker.
assertMinimumSolution(70, { 45: 1, 25: 1 });

assertMinimumSolution(137.5, { 45: 3, 2.5: 1 });
assertMinimumSolution(10.25, { 10: 1, 0.25: 1 });

assert.deepEqual(solvePlates(0), {});
assert.deepEqual(solvePlates(-10), {});

// Inputs normalize to the nearest quarter-pound, the smallest supported load step.
assert.equal(platesWeight(solvePlates(10.12)), 10);
assert.equal(platesWeight(solvePlates(10.13)), 10.25);

// Loads above the safety limit solve as the maximum supported per-side load.
assert.equal(platesWeight(solvePlates(2000)), 2000);
assert.deepEqual(solvePlates(5000), solvePlates(2000));

console.log('plate-math: ok');

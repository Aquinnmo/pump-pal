import assert from 'node:assert/strict';
import { AI_MAX_RETRIES, AI_OPS, TEMPORARY_AI_DAILY_LIMIT, aiQuotaStatus, isAIOp } from './ai-contract.js';

assert.equal(AI_MAX_RETRIES, 2);
assert.equal(TEMPORARY_AI_DAILY_LIMIT, 10);

const validInputs = {
  'muscle-analysis': { volumeTable: 'chest: 10', regionList: 'upper' },
  'workout-completion': {
    workoutName: 'Push Day', splitType: 'Upper / Lower', currentLines: 'Bench', historyLines: 'Previous', injuryLines: 'None',
  },
  'split-names': { description: 'A balanced split' },
  'daily-name': {},
} as const;

for (const [op, definition] of Object.entries(AI_OPS) as [keyof typeof AI_OPS, (typeof AI_OPS)[keyof typeof AI_OPS]][]) {
  const input = validInputs[op];
  assert.equal(definition.input.safeParse(input).success, true, `${op} valid input rejected`);
  assert.equal(definition.input.safeParse({ ...input, unknown: true }).success, true);
}

assert.equal(AI_OPS['muscle-analysis'].input.safeParse({ volumeTable: 'x'.repeat(20_001), regionList: 'upper' }).success, false);
assert.equal(AI_OPS['workout-completion'].input.safeParse({ ...validInputs['workout-completion'], workoutName: 'x'.repeat(201) }).success, false);
assert.equal(AI_OPS['split-names'].input.safeParse({ description: 'x'.repeat(2_001) }).success, false);
assert.equal(AI_OPS['daily-name'].input.safeParse({ unexpected: 'payload' }).success, true, 'empty object schema is intentionally non-strict');

assert.equal(AI_OPS['muscle-analysis'].output.safeParse({ overTrained: [], underTrained: [] }).success, true);
assert.equal(AI_OPS['muscle-analysis'].output.safeParse({ overTrained: 'chest', underTrained: [] }).success, false);
assert.equal(AI_OPS['split-names'].output.safeParse(['Upper', 'Lower']).success, true);
assert.equal(AI_OPS['split-names'].output.safeParse([1]).success, false);
assert.equal(AI_OPS['workout-completion'].output.safeParse([{
  name: 'Bench Press', exerciseType: 'Sets of Reps', sets: 3, reps: 8, durationMinutes: 0, durationSeconds: 0, weight: '135', bodyweight: false,
}]).success, true);
assert.equal(AI_OPS['workout-completion'].output.safeParse([{
  name: 'Bench Press', exerciseType: 'Unknown', sets: 3, reps: 8, durationMinutes: 0, durationSeconds: 0, weight: '135', bodyweight: false,
}]).success, false);
assert.equal(AI_OPS['daily-name'].output.safeParse({ name: 'Iron Atlas' }).success, true);
assert.equal(AI_OPS['daily-name'].output.safeParse({ name: 1 }).success, false);

assert.equal(aiQuotaStatus.safeParse({ remaining: 3, limit: 10, date: '2026-08-12' }).success, true);
assert.equal(aiQuotaStatus.safeParse({ remaining: -1, limit: 10, date: '2026-08-12' }).success, false);
assert.equal(aiQuotaStatus.safeParse({ remaining: 3, limit: 0, date: '2026-08-12' }).success, false);
assert.equal(isAIOp('daily-name'), true);
assert.equal(isAIOp('unknown'), false);
assert.equal(isAIOp(null), false);
assert.equal(isAIOp({}), false);

console.log('ai-contract: all assertions passed');

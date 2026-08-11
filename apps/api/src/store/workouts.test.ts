import assert from 'node:assert/strict';

// workouts.ts imports ApiError from ../http.js, which validates required
// Firebase env vars at module load -- set dummies before importing.
process.env.FIREBASE_PROJECT_ID ??= 'test-project';
process.env.FIREBASE_CLIENT_EMAIL ??= 'test@example.com';
process.env.FIREBASE_PRIVATE_KEY ??= 'test-key';

const { buildWorkoutUpdate } = await import('./workouts.js');

// A plain field patch just updates that field + updatedAt.
{
  const { fields, updateMask } = buildWorkoutUpdate({ name: 'Renamed', baseVersion: 'v1' }, undefined);
  assert.equal(fields.name, 'Renamed');
  assert.deepEqual(updateMask.sort(), ['name', 'updatedAt'].sort());
}

// Transitioning to 'in_progress' stamps startedAt.
{
  const { fields, updateMask } = buildWorkoutUpdate({ status: 'in_progress', baseVersion: 'v1' }, undefined);
  assert.equal(fields.status, 'in_progress');
  assert.ok('startedAt' in fields);
  assert.ok(updateMask.includes('startedAt'));
}

// Completing a workout without an explicit injuries list auto-stamps ongoing injuries.
{
  const { fields, updateMask } = buildWorkoutUpdate({ status: 'completed', baseVersion: 'v1' }, ['inj-1', 'inj-2']);
  assert.deepEqual(fields.injuries, ['inj-1', 'inj-2']);
  assert.ok(updateMask.includes('injuries'));
}

// An explicit injuries list on completion wins over the auto-stamp.
{
  const { fields } = buildWorkoutUpdate({ status: 'completed', injuries: ['manual'], baseVersion: 'v1' }, ['inj-1']);
  assert.deepEqual(fields.injuries, ['manual']);
}

// Completing with no ongoing injuries at all (undefined, not []) doesn't force the field.
{
  const { fields, updateMask } = buildWorkoutUpdate({ status: 'completed', baseVersion: 'v1' }, undefined);
  assert.equal('injuries' in fields, false);
  assert.equal(updateMask.includes('injuries'), false);
}

// A non-completing status change never touches injuries.
{
  const { fields } = buildWorkoutUpdate({ status: 'planned', baseVersion: 'v1' }, ['inj-1']);
  assert.equal('injuries' in fields, false);
}

console.log('workouts: all assertions passed');

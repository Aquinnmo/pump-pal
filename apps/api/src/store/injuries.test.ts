import assert from 'node:assert/strict';

process.env.FIREBASE_PROJECT_ID ??= 'test-project';
process.env.FIREBASE_CLIENT_EMAIL ??= 'test@example.com';
process.env.FIREBASE_PRIVATE_KEY ??= 'test-key';

const { nextInjuriesAfterCreate, nextInjuriesAfterUpdate, nextInjuriesAfterDelete, workoutInInjuryWindow } = await import(
  './injuries.js'
);
const { injuryDTO } = await import('@timber/contract/api');
type InjuryDTO = import('@timber/contract/api').InjuryDTO;

const injury = (overrides: Partial<InjuryDTO> = {}): InjuryDTO =>
  injuryDTO.parse({
    id: 'inj-1',
    bodyPart: 'shoulder',
    severity: 'moderate',
    status: 'ongoing',
    onsetDate: '2026-08-01T00:00:00Z',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    ...overrides,
  });

// ---- create ----
{
  const next = nextInjuriesAfterCreate([], injury());
  assert.equal(next.length, 1);
  assert.equal(next[0].id, 'inj-1');
}

// Duplicate id on create is a conflict, not a silent overwrite.
{
  assert.throws(() => nextInjuriesAfterCreate([injury()], injury()), /already exists/);
}

// ---- update ----
{
  const next = nextInjuriesAfterUpdate([injury()], 'inj-1', { status: 'resolved', resolvedDate: '2026-08-10T00:00:00Z' }, '2026-08-10T01:00:00Z');
  assert.equal(next[0].status, 'resolved');
  assert.equal(next[0].resolvedDate, '2026-08-10T00:00:00Z');
  assert.equal(next[0].updatedAt, '2026-08-10T01:00:00Z');
  // Untouched fields survive the merge.
  assert.equal(next[0].bodyPart, 'shoulder');
}

// Updating a missing id fails loudly (404), never silently no-ops.
{
  assert.throws(() => nextInjuriesAfterUpdate([], 'missing', { status: 'resolved' }, '2026-08-10T00:00:00Z'), /not found/);
}

// ---- delete ----
{
  const next = nextInjuriesAfterDelete([injury(), injury({ id: 'inj-2' })], 'inj-1');
  assert.deepEqual(next.map((i: { id: string }) => i.id), ['inj-2']);
}

// Deleting an absent id is a no-op, not an error -- idempotent retry.
{
  const before = [injury()];
  const after = nextInjuriesAfterDelete(before, 'not-there');
  assert.deepEqual(after, before);
}

// ---- history window ----
{
  // Onset to resolved, inclusive.
  assert.equal(workoutInInjuryWindow('2026-08-05T00:00:00Z', '2026-08-01T00:00:00Z', '2026-08-10T00:00:00Z'), true);
  assert.equal(workoutInInjuryWindow('2026-07-31T00:00:00Z', '2026-08-01T00:00:00Z', '2026-08-10T00:00:00Z'), false);
  assert.equal(workoutInInjuryWindow('2026-08-11T00:00:00Z', '2026-08-01T00:00:00Z', '2026-08-10T00:00:00Z'), false);
  // No resolvedDate -> window extends to "now".
  assert.equal(workoutInInjuryWindow(new Date().toISOString(), '2020-01-01T00:00:00Z', null), true);
  // No workout date (planned/in_progress) -> never counts as history.
  assert.equal(workoutInInjuryWindow(undefined, '2020-01-01T00:00:00Z', null), false);
}

console.log('injuries: all assertions passed');

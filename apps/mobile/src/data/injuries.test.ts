import assert from 'node:assert/strict';
import { runMigrations } from './migrate';
import { openTestDb } from './test-executor';
import * as injuries from './injuries';
import { listAll } from './outbox';

async function main() {
  const { raw, db } = openTestDb();
  await runMigrations(db);
  const injury = { id: 'injury-1', bodyPart: 'shoulder' as const, severity: 'moderate' as const, status: 'ongoing' as const, onsetDate: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  await injuries.create(db, 'uid-a', injury);
  assert.equal((await injuries.getAll(db, 'uid-a')).length, 1);
  assert.equal((await injuries.getAll(db, 'uid-b')).length, 0, 'injuries remain uid-scoped');
  let outbox = await listAll(db, 'uid-a');
  assert.equal(outbox[0]?.op, 'create');
  await injuries.update(db, 'uid-a', { ...injury, severity: 'mild', updatedAt: '2026-01-02T00:00:00.000Z' });
  outbox = await listAll(db, 'uid-a');
  assert.equal(outbox.length, 1, 'edits coalesce into one outbox intent');
  assert.equal(outbox[0]?.op, 'create', 'an unsynced create remains a create after local edits');
  await injuries.softDelete(db, 'uid-a', injury.id);
  assert.equal((await injuries.getAll(db, 'uid-a')).length, 0);
  assert.equal((await listAll(db, 'uid-a')).length, 0, 'create then delete before sync leaves no remote work');
  raw.close();
  console.log('src/data/injuries.test.ts: all assertions passed');
}
main();

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './migrate';
import { SqlExecutor } from './executor';
import * as injuries from './injuries';
import { listAll } from './outbox';

function executor(raw: DatabaseSync): SqlExecutor {
  return {
    async execAsync(sql: string) { raw.exec(sql); },
    async runAsync(sql: string, params: unknown[] = []) { const result = raw.prepare(sql).run(...(params as never[])); return { changes: Number(result.changes) }; },
    async getAllAsync<T>(sql: string, params: unknown[] = []) { return raw.prepare(sql).all(...(params as never[])) as T[]; },
    async getFirstAsync<T>(sql: string, params: unknown[] = []) { return (raw.prepare(sql).get(...(params as never[])) ?? null) as T | null; },
    async withTransactionAsync(task) { raw.exec('BEGIN'); try { await task(); raw.exec('COMMIT'); } catch (error) { raw.exec('ROLLBACK'); throw error; } },
  };
}

async function main() {
  const raw = new DatabaseSync(':memory:');
  const db = executor(raw);
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

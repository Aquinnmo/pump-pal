// Exercises the real schema SQL against node's built-in SQLite (node:sqlite,
// stable on the Node version this repo targets) instead of a mock — the same
// CREATE TABLE/PRAGMA statements expo-sqlite runs on-device, so this test
// genuinely covers "fresh install", "restart-safe", "rollback on failure",
// and "uid isolation", not just call-counting.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Migration, MIGRATIONS, CURRENT_SCHEMA_VERSION, UID_SCOPED_TABLES } from './schema';
import { runMigrations } from './migrate';
import { purgeUid } from './purge';
import { SqlExecutor } from './executor';

// Adapts node:sqlite's synchronous DatabaseSync to the async SqlExecutor
// interface db/migrate.ts and db/purge.ts are written against.
function toExecutor(db: DatabaseSync): SqlExecutor {
  return {
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, params = []) {
      const result = db.prepare(sql).run(...(params as never[]));
      return { changes: Number(result.changes) };
    },
    async getAllAsync<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).all(...(params as never[])) as T[];
    },
    async getFirstAsync<T>(sql: string, params: unknown[] = []) {
      const row = db.prepare(sql).get(...(params as never[]));
      return (row ?? null) as T | null;
    },
    async withTransactionAsync(task) {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}

function freshDb() {
  const raw = new DatabaseSync(':memory:');
  return { raw, db: toExecutor(raw) };
}

async function main() {
// --- Fresh install creates the documented schema transactionally ---
{
  const { raw, db } = freshDb();
  const applied = await runMigrations(db);
  assert.deepEqual(applied, MIGRATIONS.map((m) => m.version));

  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  assert.equal(version?.user_version, CURRENT_SCHEMA_VERSION);

  const tables = raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((r: any) => r.name);
  for (const table of UID_SCOPED_TABLES) {
    assert.ok(tables.includes(table), `missing table ${table}`);
  }
  raw.close();
}

// --- Restart-safe: re-running on an already-migrated db is a no-op ---
{
  const { db } = freshDb();
  await runMigrations(db);
  const secondRun = await runMigrations(db);
  assert.deepEqual(secondRun, [], 'second run should apply nothing');
}

// --- Upgrade path: only pending migrations newer than user_version apply ---
{
  const { db } = freshDb();
  await runMigrations(db, [MIGRATIONS[0]]);
  const extra: Migration = {
    version: MIGRATIONS[MIGRATIONS.length - 1].version + 1,
    up: ['CREATE TABLE scratch (id TEXT PRIMARY KEY)'],
  };
  const applied = await runMigrations(db, [...MIGRATIONS, extra]);
  assert.deepEqual(
    applied,
    MIGRATIONS.slice(1).map((m) => m.version).concat(extra.version)
  );
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  assert.equal(version?.user_version, extra.version);
}

// --- Rollback: a failing statement mid-migration leaves no partial state ---
{
  const { raw, db } = freshDb();
  const broken: Migration = {
    version: 1,
    up: ['CREATE TABLE ok (id TEXT)', 'THIS IS NOT VALID SQL'],
  };
  await assert.rejects(() => runMigrations(db, [broken]));

  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  assert.equal(version?.user_version ?? 0, 0, 'user_version must not advance on failure');

  const tables = raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ok'")
    .all();
  assert.equal(tables.length, 0, 'partially-applied migration must not leave tables behind');
  raw.close();
}

// --- UID isolation: different uids cannot see each other's rows ---
{
  const { db } = freshDb();
  await runMigrations(db);
  await db.runAsync(
    'INSERT INTO workouts (uid, id, data, date, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['uid-a', 'w1', '{}', '2026-01-01', 'completed', '2026-01-01T00:00:00.000Z']
  );
  await db.runAsync(
    'INSERT INTO workouts (uid, id, data, date, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['uid-b', 'w1', '{}', '2026-01-01', 'completed', '2026-01-01T00:00:00.000Z']
  );

  const forA = await db.getAllAsync<{ id: string }>('SELECT id FROM workouts WHERE uid = ?', [
    'uid-a',
  ]);
  assert.equal(forA.length, 1);

  // Same entity id is legal for two different uids (composite primary key).
  const all = await db.getAllAsync('SELECT * FROM workouts');
  assert.equal(all.length, 2);
}

// --- purgeUid deletes only the target uid's rows, across all tables ---
{
  const { db } = freshDb();
  await runMigrations(db);
  await db.runAsync(
    'INSERT INTO workouts (uid, id, data, updated_at) VALUES (?, ?, ?, ?)',
    ['uid-a', 'w1', '{}', '2026-01-01T00:00:00.000Z']
  );
  await db.runAsync(
    'INSERT INTO workouts (uid, id, data, updated_at) VALUES (?, ?, ?, ?)',
    ['uid-b', 'w1', '{}', '2026-01-01T00:00:00.000Z']
  );
  await db.runAsync('INSERT INTO profile (uid, data, updated_at) VALUES (?, ?, ?)', [
    'uid-a',
    '{}',
    '2026-01-01T00:00:00.000Z',
  ]);

  await purgeUid(db, 'uid-a');

  const workouts = await db.getAllAsync('SELECT * FROM workouts');
  assert.equal(workouts.length, 1, 'only uid-b workout should remain');
  const profile = await db.getAllAsync('SELECT * FROM profile WHERE uid = ?', ['uid-a']);
  assert.equal(profile.length, 0);
}

console.log('db/migrate.test.ts: all assertions passed');
}

main();

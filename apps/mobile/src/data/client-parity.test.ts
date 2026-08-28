import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mock } from 'bun:test';
import type { SqlExecutor } from './executor';

const databaseName = 'timber.db';
const execCalls: string[] = [];
const runCalls: { sql: string; params: unknown[] }[] = [];
const allCalls: { sql: string; params: unknown[] }[] = [];
const firstCalls: { sql: string; params: unknown[] }[] = [];
let openCalls = 0;
let closeCalls = 0;
let deleteCalls = 0;
let migrationCalls = 0;
let migrationDb: SqlExecutor | null = null;
let purgeUidCall: { db: SqlExecutor; uid: string } | null = null;

const fakeDatabase = {
  async execAsync(sql: string): Promise<void> {
    execCalls.push(sql);
  },
  async runAsync(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
    runCalls.push({ sql, params });
    return { changes: 1 };
  },
  async getAllAsync<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    allCalls.push({ sql, params });
    return [];
  },
  async getFirstAsync<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    firstCalls.push({ sql, params });
    return null;
  },
  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    await task();
  },
  async closeAsync(): Promise<void> {
    closeCalls += 1;
  },
};

const openDatabase = async (name: string) => {
  assert.equal(name, databaseName, 'native: opens the documented database');
  openCalls += 1;
  return fakeDatabase;
};
const deleteDatabase = async (name: string) => {
  assert.equal(name, databaseName, 'native: resets the documented database');
  deleteCalls += 1;
};
const sqliteMock = () => ({ openDatabaseAsync: openDatabase, deleteDatabaseAsync: deleteDatabase });
mock.module('expo-sqlite', sqliteMock);
mock.module(new URL('../../../../node_modules/expo-sqlite/build/index.js', import.meta.url).pathname, sqliteMock);
// The mobile preload installs an object export for expo-sqlite before this
// test runs. Patch that live object as well so the native module sees the
// deterministic database seam rather than the preload's throwing fallback.
const sqliteModule = createRequire(import.meta.url)('expo-sqlite') as {
  openDatabaseAsync: { mockImplementation(fn: typeof openDatabase): void };
  deleteDatabaseAsync: { mockImplementation(fn: typeof deleteDatabase): void };
};
sqliteModule.openDatabaseAsync.mockImplementation(openDatabase);
sqliteModule.deleteDatabaseAsync.mockImplementation(deleteDatabase);

const migrateMock = () => ({
  runMigrations: async (db: SqlExecutor) => {
    migrationCalls += 1;
    migrationDb = db;
    return [];
  },
});
mock.module(new URL('./migrate.ts', import.meta.url).pathname, migrateMock);

const purgeMock = () => ({
  purgeUid: async (db: SqlExecutor, uid: string) => {
    purgeUidCall = { db, uid };
  },
});
mock.module(new URL('./purge.ts', import.meta.url).pathname, purgeMock);

const native = await import(new URL('./client.ts', import.meta.url).pathname);

const firstDb = await native.getDb();
const secondDb = await native.getDb();
assert.notEqual(firstDb, secondDb, 'native: each getDb call returns a fresh executor wrapper');
assert.equal(openCalls, 1, 'native: the SQLite database opens once');
assert.equal(migrationCalls, 1, 'native: migrations run during first initialization');
assert.ok(migrationDb, 'native: migrations receive the initialized executor');
assert.deepEqual(execCalls, ['PRAGMA journal_mode = WAL', 'PRAGMA foreign_keys = ON']);

await firstDb.execAsync('SELECT 1');
assert.deepEqual(execCalls.at(-1), 'SELECT 1', 'native: exec delegates to SQLite');
assert.deepEqual(await firstDb.runAsync('UPDATE test SET value = ?', ['value']), { changes: 1 });
assert.deepEqual(runCalls.at(-1), { sql: 'UPDATE test SET value = ?', params: ['value'] });
assert.deepEqual(await firstDb.getAllAsync('SELECT id FROM test', ['uid-a']), []);
assert.deepEqual(allCalls.at(-1), { sql: 'SELECT id FROM test', params: ['uid-a'] });
assert.equal(await firstDb.getFirstAsync('SELECT id FROM test WHERE id = ?', ['missing']), null);
assert.deepEqual(firstCalls.at(-1), { sql: 'SELECT id FROM test WHERE id = ?', params: ['missing'] });
let transactionRan = false;
await firstDb.withTransactionAsync(async () => {
  transactionRan = true;
});
assert.equal(transactionRan, true, 'native: transaction callbacks delegate to SQLite');

await native.purgeUidData('uid-a');
const recordedPurge = purgeUidCall as { db: SqlExecutor; uid: string } | null;
assert.equal(recordedPurge?.uid, 'uid-a', 'native: purge is scoped to the requested uid');
assert.ok(recordedPurge?.db, 'native: purge receives an initialized executor');

await native._resetDbForTests();
assert.equal(closeCalls, 1, 'native: reset closes the shared database');
assert.equal(deleteCalls, 1, 'native: reset deletes the shared database');
await native.getDb();
assert.equal(openCalls, 2, 'native: reset allows a fresh initialization');
assert.equal(migrationCalls, 2, 'native: fresh initialization reruns migrations');

const web = await import(new URL('./client.web.ts', import.meta.url).pathname);
const webError = /db\/client: SQLite is native-only\. Web must use the API-backed repositories\./;
await assert.rejects(() => web.getDb(), webError, 'web: getDb refuses native SQLite access');
await assert.rejects(() => web.purgeUidData('uid-a'), webError, 'web: purge refuses native SQLite access');
await assert.rejects(() => web._resetDbForTests(), webError, 'web: reset refuses native SQLite access');

console.log('client parity: all assertions passed');

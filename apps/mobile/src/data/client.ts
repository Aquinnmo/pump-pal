// Native (iOS/Android) SQLite connection. Never imported on web — see
// src/data/client.web.ts, which Metro's platform extension resolution picks
// instead so web never bundles expo-sqlite.
import * as SQLite from 'expo-sqlite';
import { SqlExecutor } from './executor';
import { createSerialQueue } from './keyed-mutex';
import { runMigrations } from './migrate';
import { purgeUid } from './purge';

const DATABASE_NAME = 'timber.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// One queue for the one connection, at module scope because toExecutor() hands
// out a fresh wrapper object on every getDb() call and they all drive the same
// SQLite handle.
//
// expo-sqlite's withTransactionAsync does not hold the connection: overlapping
// callers interleave, the second BEGIN lands inside the first, and SQLite
// rejects it with "cannot start a transaction within a transaction". A catalog
// refresh running alongside a sync pull is enough to hit it. Serializing here
// rather than at each call site keeps it true for every caller, including ones
// added later.
//
// Safe against deadlock only because no transaction body opens another
// transaction — the repositories deliberately expose unwrapped *Statements
// helpers for composition (see src/data/workouts.ts) and outbox enqueue() is
// documented as "call inside the entity's own transaction".
const transactionQueue = createSerialQueue();

function toExecutor(db: SQLite.SQLiteDatabase): SqlExecutor {
  return {
    execAsync: (sql) => db.execAsync(sql),
    runAsync: (sql, params = []) => db.runAsync(sql, params as SQLite.SQLiteBindParams),
    getAllAsync: (sql, params = []) => db.getAllAsync(sql, params as SQLite.SQLiteBindParams),
    getFirstAsync: (sql, params = []) => db.getFirstAsync(sql, params as SQLite.SQLiteBindParams),
    withTransactionAsync: (task) => transactionQueue(() => db.withTransactionAsync(task)),
  };
}

/** Opens (once) the shared, uid-scoped database and runs pending migrations. */
export async function getDb(): Promise<SqlExecutor> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (db) => {
      await db.execAsync('PRAGMA journal_mode = WAL');
      await db.execAsync('PRAGMA foreign_keys = ON');
      await runMigrations(toExecutor(db));
      return db;
    });
  }
  const db = await dbPromise;
  return toExecutor(db);
}

/** Deletes every row belonging to `uid` across all tables, in one transaction. */
export async function purgeUidData(uid: string): Promise<void> {
  const db = await getDb();
  await purgeUid(db, uid);
}

/** Test/dev-only: closes and deletes the database file so the next getDb() starts fresh. */
export async function _resetDbForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    await db.closeAsync();
    dbPromise = null;
  }
  await SQLite.deleteDatabaseAsync(DATABASE_NAME);
}

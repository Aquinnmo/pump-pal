// Native (iOS/Android) SQLite connection. Never imported on web — see
// db/client.web.ts, which Metro's platform extension resolution picks
// instead so web never bundles expo-sqlite.
import * as SQLite from 'expo-sqlite';
import { SqlExecutor } from './executor';
import { runMigrations } from './migrate';
import { purgeUid } from './purge';

const DATABASE_NAME = 'timber.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function toExecutor(db: SQLite.SQLiteDatabase): SqlExecutor {
  return {
    execAsync: (sql) => db.execAsync(sql),
    runAsync: (sql, params = []) => db.runAsync(sql, params as SQLite.SQLiteBindParams),
    getAllAsync: (sql, params = []) => db.getAllAsync(sql, params as SQLite.SQLiteBindParams),
    getFirstAsync: (sql, params = []) => db.getFirstAsync(sql, params as SQLite.SQLiteBindParams),
    withTransactionAsync: (task) => db.withTransactionAsync(task),
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

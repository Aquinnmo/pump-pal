import { MIGRATIONS, Migration } from './schema';
import { SqlExecutor } from './executor';

/**
 * Applies every migration newer than the database's current
 * `PRAGMA user_version`, one migration per transaction, in ascending order.
 * Restart-safe: if the app is killed or a migration throws mid-way, the
 * transaction (and the user_version bump that closes it) never commits, so
 * the next call resumes from the last fully-applied version instead of
 * re-running or skipping a migration.
 *
 * Returns the versions actually applied (empty on a fresh no-op call).
 */
export async function runMigrations(
  db: SqlExecutor,
  migrations: Migration[] = MIGRATIONS
): Promise<number[]> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;

  const pending = migrations
    .filter((m) => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  const applied: number[] = [];
  for (const migration of pending) {
    await db.withTransactionAsync(async () => {
      for (const statement of migration.up) {
        await db.execAsync(statement);
      }
      // PRAGMA user_version participates in the enclosing transaction, so a
      // later statement in the same migration failing rolls this back too.
      await db.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
    applied.push(migration.version);
  }
  return applied;
}

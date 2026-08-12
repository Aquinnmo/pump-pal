// Shared bun:sqlite-backed SqlExecutor for the src/data/*.test.ts suites.
// bun does not implement node:sqlite, so every test that used to hand-roll
// its own DatabaseSync -> SqlExecutor adapter now calls openTestDb() instead.
// Same five methods, same shapes (exec/prepare().run()/all()/get()), just
// backed by bun's built-in driver.
import { Database } from 'bun:sqlite';
import { SqlExecutor } from './executor';

export function openTestDb(): { raw: Database; db: SqlExecutor } {
  const raw = new Database(':memory:');
  const db: SqlExecutor = {
    async execAsync(sql) {
      raw.exec(sql);
    },
    async runAsync(sql, params = []) {
      const result = raw.prepare(sql).run(...(params as never[]));
      return { changes: Number(result.changes) };
    },
    async getAllAsync<T>(sql: string, params: unknown[] = []) {
      return raw.prepare(sql).all(...(params as never[])) as T[];
    },
    async getFirstAsync<T>(sql: string, params: unknown[] = []) {
      const row = raw.prepare(sql).get(...(params as never[]));
      return (row ?? null) as T | null;
    },
    async withTransactionAsync(task) {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
  };
  return { raw, db };
}

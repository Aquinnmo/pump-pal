// Minimal surface both expo-sqlite's SQLiteDatabase and a plain node:sqlite
// wrapper satisfy, so migration logic (src/data/migrate.ts) is testable outside
// the Expo runtime — see src/data/migrate.test.ts.

export type SqlExecutor = {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null>;
  /** Runs `task`, committing on success and rolling back if it throws. */
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
};

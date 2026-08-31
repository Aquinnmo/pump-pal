import { UID_SCOPED_TABLES } from './schema';
import { SqlExecutor } from './executor';

/** Deletes every row belonging to `uid` across all uid-scoped tables, in one transaction. */
export async function purgeUid(db: SqlExecutor, uid: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const table of UID_SCOPED_TABLES) {
      await db.runAsync(`DELETE FROM ${table} WHERE uid = ?`, [uid]);
    }
  });
}

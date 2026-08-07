// Web build of db/client.ts. Deliberately has no expo-sqlite import — web is
// API-backed (bead pump-pal-bkp.5), never opens a local database. Anything
// that reaches this module on web is a bug: repositories must resolve to the
// HTTP-backed implementation on web before touching db/*, per
// docs data-model rules ("Web remains online/API-backed").
import { SqlExecutor } from './executor';

const webError = () =>
  new Error('db/client: SQLite is native-only. Web must use the API-backed repositories.');

export async function getDb(): Promise<SqlExecutor> {
  throw webError();
}

export async function purgeUidData(_uid: string): Promise<void> {
  throw webError();
}

export async function _resetDbForTests(): Promise<void> {
  throw webError();
}

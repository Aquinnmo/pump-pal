// Web build of db/account-data.ts. Web repositories read and write through to
// the API per request, so there is no outbox to drain and no local cache to
// purge — same exported names, both no-ops.
export async function countPendingSync(_uid: string): Promise<number> {
  return 0;
}

export async function syncBeforeSignOut(_uid: string): Promise<void> {}

export async function purgeLocalAccountData(_uid: string): Promise<void> {}

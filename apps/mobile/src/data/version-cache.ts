// Web repositories are always network-backed — there's no local row to read
// a baseVersion off before a mutation the way the native SQLite repos do
// (their outbox row already carries it). This is a small in-memory
// id -> version cache, populated by every read/write response, so
// update()/delete() can supply the baseVersion the wire contract requires
// without a redundant GET first. Session-lived only: a cold app losing it
// just means the next mutation needs a fresh read, same as any client that
// never cached at all.
export function createVersionCache() {
  const versions = new Map<string, string>();
  return {
    set(id: string, version: string) {
      versions.set(id, version);
    },
    get(id: string): string | undefined {
      return versions.get(id);
    },
    require(id: string, entityType: string): string {
      const version = versions.get(id);
      if (!version) {
        throw new Error(
          `No cached version for ${entityType} ${id} — read it (getAll/getById) before mutating it.`
        );
      }
      return version;
    },
    delete(id: string) {
      versions.delete(id);
    },
  };
}

// Forward-only SQLite migrations for the native offline-first store.
//
// Every entity table stores the canonical JSON blob (`data`) plus the indexed
// fields current screens/sync actually query on — see
// docs/data-model/README.md for the Firestore shapes these mirror. Every
// table carries `uid` in its primary key (or as a NOT NULL column) so a
// query without a uid filter is a type error at the repository layer, not
// just a convention — see repositories/types.ts.
//
// Rules for adding a migration:
// - Never edit a migration that has shipped. Append a new { version, up }
//   entry with version = previous max + 1.
// - Each `up` statement runs inside one transaction (db/migrate.ts) that also
//   bumps `PRAGMA user_version` to the migration's version, so a crash or
//   thrown error mid-migration leaves the database at the last fully-applied
//   version (see db/migrate.test.ts for the rollback case).
// - No down migrations. Offline-first local data is a cache of the server;
//   the recovery path for a broken schema is reinstall, not a downgrade.

export type Migration = {
  version: number;
  up: string[];
};

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: [
      `CREATE TABLE workouts (
        uid TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        date TEXT,
        status TEXT,
        sync_state TEXT NOT NULL DEFAULT 'synced',
        server_version TEXT,
        updated_at TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (uid, id)
      )`,
      `CREATE INDEX idx_workouts_uid_date ON workouts(uid, date)`,
      `CREATE INDEX idx_workouts_uid_status ON workouts(uid, status)`,
      `CREATE INDEX idx_workouts_uid_sync_state ON workouts(uid, sync_state)`,

      `CREATE TABLE profile (
        uid TEXT NOT NULL PRIMARY KEY,
        data TEXT NOT NULL,
        sync_state TEXT NOT NULL DEFAULT 'synced',
        server_version TEXT,
        updated_at TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0
      )`,

      `CREATE TABLE pushup_challenge (
        uid TEXT NOT NULL PRIMARY KEY,
        data TEXT NOT NULL,
        sync_state TEXT NOT NULL DEFAULT 'synced',
        server_version TEXT,
        updated_at TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0
      )`,

      `CREATE TABLE catalog_exercises (
        uid TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (uid, id)
      )`,

      `CREATE TABLE catalog_meta (
        uid TEXT NOT NULL PRIMARY KEY,
        version INTEGER NOT NULL,
        exercise_count INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      )`,

      // One pending mutation per entity ("coalesced outbox" per the epic
      // design) — a second local write before the first syncs replaces the
      // queued row instead of appending, via INSERT ... ON CONFLICT DO
      // UPDATE at the repository layer (bead pump-pal-bkp.4).
      `CREATE TABLE outbox (
        id TEXT NOT NULL PRIMARY KEY,
        uid TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        op TEXT NOT NULL,
        payload TEXT NOT NULL,
        base_version TEXT,
        created_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      )`,
      `CREATE UNIQUE INDEX idx_outbox_uid_entity ON outbox(uid, entity_type, entity_id)`,
      `CREATE INDEX idx_outbox_uid_created ON outbox(uid, created_at)`,

      `CREATE TABLE conflicts (
        id TEXT NOT NULL PRIMARY KEY,
        uid TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        local_data TEXT NOT NULL,
        server_data TEXT NOT NULL,
        detected_at TEXT NOT NULL,
        resolved_at TEXT
      )`,
      `CREATE INDEX idx_conflicts_uid_resolved ON conflicts(uid, resolved_at)`,

      `CREATE TABLE sync_cursors (
        uid TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        last_synced_at TEXT,
        manifest_version TEXT,
        PRIMARY KEY (uid, entity_type)
      )`,
    ],
  },
  {
    // Lease + backoff fields for outbox claim/release (bead pump-pal-bkp.4)
    // and retry scheduling (bead pump-pal-bkp.7) — finalized after migration
    // 1 shipped, so appended rather than edited in place.
    version: 2,
    up: [
      `ALTER TABLE outbox ADD COLUMN claimed_at TEXT`,
      `ALTER TABLE outbox ADD COLUMN next_attempt_at TEXT`,
    ],
  },
  {
    // Distinguishes curated (server-synced) catalog rows from a user's own
    // pending-review submissions (bead pump-pal-bkp.3) so a catalog refresh
    // can replace only the synced rows without clobbering local drafts.
    version: 3,
    up: [
      `ALTER TABLE catalog_exercises ADD COLUMN sync_state TEXT NOT NULL DEFAULT 'synced'`,
      `ALTER TABLE catalog_exercises ADD COLUMN server_version TEXT`,
    ],
  },
  {
    // Injuries are independently synchronized by the API manifest. They used
    // to live only in the profile JSON cache, which made offline edits unable
    // to reconcile at their own stable ids.
    version: 4,
    up: [
      `CREATE TABLE injuries (
        uid TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        sync_state TEXT NOT NULL DEFAULT 'synced',
        server_version TEXT,
        updated_at TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (uid, id)
      )`,
      `CREATE INDEX idx_injuries_uid_sync_state ON injuries(uid, sync_state)`,
    ],
  },
];

export const CURRENT_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

// Every entity table, for account-purge (bead pump-pal-bkp.10) and tests.
// Keep in sync with the CREATE TABLE statements above.
export const UID_SCOPED_TABLES = [
  'workouts',
  'injuries',
  'profile',
  'pushup_challenge',
  'catalog_exercises',
  'catalog_meta',
  'outbox',
  'conflicts',
  'sync_cursors',
] as const;

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './migrate';
import { SqlExecutor } from './executor';
import * as workouts from './workouts';
import { claimPending } from './outbox';
import { listUnresolved } from './conflicts';
import {
  runSync,
  EntityAdapter,
  SyncRemote,
  SyncConflictError,
  SyncAuthError,
  SyncRateLimitError,
} from './sync-engine';

function toExecutor(db: DatabaseSync): SqlExecutor {
  return {
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, params = []) {
      const result = db.prepare(sql).run(...(params as never[]));
      return { changes: Number(result.changes) };
    },
    async getAllAsync<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).all(...(params as never[])) as T[];
    },
    async getFirstAsync<T>(sql: string, params: unknown[] = []) {
      const row = db.prepare(sql).get(...(params as never[]));
      return (row ?? null) as T | null;
    },
    async withTransactionAsync(task) {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}

async function freshDb() {
  const raw = new DatabaseSync(':memory:');
  const db = toExecutor(raw);
  await runMigrations(db);
  return db;
}

// ---------------------------------------------------------------- fake server

type ServerEntity = { id: string; version: string; data: unknown };

class FakeServer {
  private byId = new Map<string, ServerEntity>();
  private nextVersion = 1;
  private manifestPageSize = 200;
  injectOnce: { create?: Error; update?: Error; delete?: Error; manifest?: Error; pull?: Error } = {};

  private version() {
    return `v${this.nextVersion++}`;
  }

  seed(id: string, data: unknown, version?: string) {
    const v = version ?? this.version();
    this.byId.set(id, { id, version: v, data });
    return v;
  }

  get(id: string) {
    return this.byId.get(id);
  }

  create(id: string, data: unknown): { version: string; data: unknown } {
    if (this.injectOnce.create) {
      const e = this.injectOnce.create;
      this.injectOnce.create = undefined;
      throw e;
    }
    const existing = this.byId.get(id);
    if (existing) return { version: existing.version, data: existing.data }; // idempotent replay
    const version = this.version();
    const entity = { id, version, data };
    this.byId.set(id, entity);
    return { version, data };
  }

  update(id: string, data: unknown, baseVersion: string | null): { version: string; data: unknown } {
    if (this.injectOnce.update) {
      const e = this.injectOnce.update;
      this.injectOnce.update = undefined;
      throw e;
    }
    const existing = this.byId.get(id);
    if (!existing) throw new Error(`update on missing entity ${id}`);
    if (existing.version !== baseVersion) {
      throw new SyncConflictError('stale', { ...(existing.data as Record<string, unknown>), id, version: existing.version }, existing.version);
    }
    const version = this.version();
    this.byId.set(id, { id, version, data });
    return { version, data };
  }

  delete(id: string, baseVersion: string | null): void {
    if (this.injectOnce.delete) {
      const e = this.injectOnce.delete;
      this.injectOnce.delete = undefined;
      throw e;
    }
    const existing = this.byId.get(id);
    if (!existing) return; // already gone — idempotent
    if (existing.version !== baseVersion) {
      throw new SyncConflictError('stale', { ...(existing.data as Record<string, unknown>), id, version: existing.version }, existing.version);
    }
    this.byId.delete(id);
  }

  /** Simulates a legacy client editing/deleting directly, bypassing this sync client entirely. */
  legacyEdit(id: string, data: unknown) {
    this.byId.set(id, { id, version: this.version(), data });
  }
  legacyDelete(id: string) {
    this.byId.delete(id);
  }

  manifest(kind: string, cursor?: string): { items: { kind: string; id: string; version: string }[]; nextCursor: string | null } {
    if (this.injectOnce.manifest) {
      const e = this.injectOnce.manifest;
      this.injectOnce.manifest = undefined;
      throw e;
    }
    const all = [...this.byId.values()].sort((a, b) => a.id.localeCompare(b.id));
    const start = cursor ? Number(cursor) : 0;
    const page = all.slice(start, start + this.manifestPageSize);
    const nextCursor = start + this.manifestPageSize < all.length ? String(start + this.manifestPageSize) : null;
    return { items: page.map((e) => ({ kind, id: e.id, version: e.version })), nextCursor };
  }

  setManifestPageSize(n: number) {
    this.manifestPageSize = n;
  }

  pull(kind: string, ids: string[]) {
    if (this.injectOnce.pull) {
      const e = this.injectOnce.pull;
      this.injectOnce.pull = undefined;
      throw e;
    }
    const found: { kind: string; id: string; version: string; data: unknown }[] = [];
    const missing: { kind: string; id: string }[] = [];
    for (const id of ids) {
      const e = this.byId.get(id);
      if (e) found.push({ kind, id: e.id, version: e.version, data: e.data });
      else missing.push({ kind, id });
    }
    return { found, missing };
  }
}

function makeRemote(server: FakeServer): SyncRemote {
  return {
    async manifest(_uid, cursor) {
      return server.manifest('workout', cursor);
    },
    async pull(entities) {
      const ids = entities.filter((e) => e.kind === 'workout').map((e) => e.id);
      return server.pull('workout', ids);
    },
  };
}

function makeWorkoutAdapter(server: FakeServer): EntityAdapter {
  return {
    entityType: 'workout',
    wireKind: 'workout',
    local: {
      async getAllRows(db, uid) {
        const rows = await workouts.getAll(db, uid);
        return rows.map((r) => ({ id: r.id, syncState: r.syncState, serverVersion: r.serverVersion, data: r.data }));
      },
      async writeSynced(db, uid, id, data, version) {
        await workouts.update(db, uid, id, data as never, { syncState: 'synced', serverVersion: version });
      },
      async removeClean(db, uid, id) {
        await workouts.removeClean(db, uid, id);
      },
      async markConflict(db, uid, id) {
        await workouts.markConflict(db, uid, id);
      },
    },
    remote: {
      async create(payload, id) {
        return server.create(id, payload);
      },
      async update(id, payload, baseVersion) {
        return server.update(id, payload, baseVersion);
      },
      async delete(id, baseVersion) {
        server.delete(id, baseVersion);
      },
    },
  };
}

function workoutPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Push',
    date: '2026-01-01T00:00:00.000Z',
    performedExercises: [],
    schemaVersion: 2,
    status: 'completed',
    ...overrides,
  };
}

const noBackoff = { computeBackoffMs: () => 0 };

async function main() {
  // --- initial hydration: nothing local, server has data -> pulled down ---
  {
    const db = await freshDb();
    const server = new FakeServer();
    server.seed('w1', workoutPayload({ name: 'Seeded' }));
    const outcome = await runSync(db, 'u1', [makeWorkoutAdapter(server)], makeRemote(server));
    assert.equal(outcome.status, 'ok');
    if (outcome.status === 'ok') assert.equal(outcome.pulled, 1);
    const local = await workouts.getById(db, 'u1', 'w1');
    assert.equal(local?.data.name, 'Seeded');
    assert.equal(local?.syncState, 'synced');
  }

  // --- offline create, then reconnect: local create pushed, gets a server version ---
  {
    const db = await freshDb();
    const server = new FakeServer();
    const id = await workouts.create(db, 'u1', workoutPayload({ name: 'Offline create' }) as never);
    const outcome = await runSync(db, 'u1', [makeWorkoutAdapter(server)], makeRemote(server), noBackoff);
    assert.equal(outcome.status, 'ok');
    if (outcome.status === 'ok') assert.equal(outcome.pushed, 1);
    const local = await workouts.getById(db, 'u1', id);
    assert.equal(local?.syncState, 'synced');
    assert.ok(server.get(id));
  }

  // --- offline update, then reconnect ---
  {
    const db = await freshDb();
    const server = new FakeServer();
    const id = await workouts.create(db, 'u1', workoutPayload() as never);
    await runSync(db, 'u1', [makeWorkoutAdapter(server)], makeRemote(server), noBackoff); // sync the create first
    await workouts.update(db, 'u1', id, { ...(await workouts.getById(db, 'u1', id))!.data, name: 'Edited offline' });
    const outcome = await runSync(db, 'u1', [makeWorkoutAdapter(server)], makeRemote(server), noBackoff);
    assert.equal(outcome.status, 'ok');
    assert.equal((server.get(id)!.data as { name: string }).name, 'Edited offline');
  }

  // --- offline delete, then reconnect ---
  {
    const db = await freshDb();
    const server = new FakeServer();
    const id = await workouts.create(db, 'u1', workoutPayload() as never);
    await runSync(db, 'u1', [makeWorkoutAdapter(server)], makeRemote(server), noBackoff);
    await workouts.softDelete(db, 'u1', id);
    const outcome = await runSync(db, 'u1', [makeWorkoutAdapter(server)], makeRemote(server), noBackoff);
    assert.equal(outcome.status, 'ok');
    assert.equal(server.get(id), undefined);
    assert.equal(await workouts.getById(db, 'u1', id), null);
  }

  // --- duplicate retry: a create replayed with the same id doesn't duplicate server-side ---
  {
    const db = await freshDb();
    const server = new FakeServer();
    const id = await workouts.create(db, 'u1', workoutPayload({ name: 'A' }) as never);
    const v1 = server.create(id, workoutPayload({ name: 'A' })).version; // simulate the create already having landed once
    const replay = server.create(id, workoutPayload({ name: 'A-different-payload-ignored' }));
    assert.equal(replay.version, v1, 'replaying the same id must not create a new version');
    // The real assertion: the server only ever has one entity for this id.
    const manifest = server.manifest('workout');
    assert.equal(manifest.items.filter((m) => m.id === id).length, 1);
  }

  // --- crash/restart: outbox row left claimed by a "dead" run is resumed, not stuck ---
  {
    const db = await freshDb();
    const server = new FakeServer();
    const id = await workouts.create(db, 'u1', workoutPayload() as never);
    const claimed = await claimPending(db, 'u1'); // simulate a run that claimed but crashed before ack/release
    assert.equal(claimed.length, 1);
    const outcome = await runSync(db, 'u1', [makeWorkoutAdapter(server)], makeRemote(server), noBackoff);
    assert.equal(outcome.status, 'ok');
    if (outcome.status === 'ok') assert.equal(outcome.pushed, 1, 'the stale-claimed row must still get pushed');
    assert.ok(server.get(id));
  }

  // --- legacy remote edit: clean local row, server changed underneath -> pulled ---
  {
    const db = await freshDb();
    const server = new FakeServer();
    server.seed('w1', workoutPayload({ name: 'Original' }));
    await runSync(db, 'u1', [makeWorkoutAdapter(server)], makeRemote(server));
    server.legacyEdit('w1', workoutPayload({ name: 'Edited by legacy client' }));
    const outcome = await runSync(db, 'u1', [makeWorkoutAdapter(server)], makeRemote(server));
    assert.equal(outcome.status, 'ok');
    if (outcome.status === 'ok') assert.equal(outcome.pulled, 1);
    assert.equal((await workouts.getById(db, 'u1', 'w1'))?.data.name, 'Edited by legacy client');
  }

  // --- legacy remote delete on a clean local row: removed locally, no conflict ---
  {
    const db = await freshDb();
    const server = new FakeServer();
    server.seed('w1', workoutPayload());
    await runSync(db, 'u1', [makeWorkoutAdapter(server)], makeRemote(server));
    server.legacyDelete('w1');
    const outcome = await runSync(db, 'u1', [makeWorkoutAdapter(server)], makeRemote(server));
    assert.equal(outcome.status, 'ok');
    if (outcome.status === 'ok') assert.equal(outcome.remoteDeletions, 1);
    assert.equal(await workouts.getById(db, 'u1', 'w1'), null);
    assert.equal((await listUnresolved(db, 'u1')).length, 0, 'clean remote deletion is not a conflict');
  }

  // --- dirty remote deletion: local has pending edits, server deleted it -> preserved conflict, not silent loss ---
  {
    const db = await freshDb();
    const server = new FakeServer();
    server.seed('w1', workoutPayload({ name: 'Original' }));
    await runSync(db, 'u1', [makeWorkoutAdapter(server)], makeRemote(server)); // clean local copy first
    await workouts.update(db, 'u1', 'w1', { ...(await workouts.getById(db, 'u1', 'w1'))!.data, name: 'My pending edit' });
    server.legacyDelete('w1'); // deleted server-side before our pending edit could push
    // Push phase tries the update against a now-missing entity (server.update
    // throws a plain Error, not SyncConflictError, since there's no version
    // to compare) — that's retry-scheduled, so the row stays dirty. The pull
    // phase, in the same run, then sees: dirty + has a serverVersion (was
    // synced before) + absent from the manifest -> a real conflict.
    const outcome = await runSync(db, 'u1', [makeWorkoutAdapter(server)], makeRemote(server), noBackoff);
    assert.equal(outcome.status, 'ok');
    const unresolved = await listUnresolved(db, 'u1');
    assert.equal(unresolved.length, 1, 'dirty remote deletion must produce exactly one preserved conflict');
    assert.equal(unresolved[0].entityId, 'w1');
    assert.equal(unresolved[0].serverData, null);
    assert.ok(unresolved[0].localData, 'local data must be preserved, not dropped');
    const localAfter = await workouts.getById(db, 'u1', 'w1');
    assert.equal(localAfter?.syncState, 'conflict');
  }

  // --- 409 on push: preserved conflict with BOTH sides, never silently overwritten ---
  {
    const db = await freshDb();
    const server = new FakeServer();
    server.seed('w1', workoutPayload({ name: 'Server truth' }));
    await runSync(db, 'u1', [makeWorkoutAdapter(server)], makeRemote(server));
    await workouts.update(db, 'u1', 'w1', { ...(await workouts.getById(db, 'u1', 'w1'))!.data, name: 'My local edit' });
    // Someone else updates the server between our read and our push, so our baseVersion is now stale.
    server.legacyEdit('w1', workoutPayload({ name: 'Someone else edited' }));
    const outcome = await runSync(db, 'u1', [makeWorkoutAdapter(server)], makeRemote(server), noBackoff);
    assert.equal(outcome.status, 'ok');
    if (outcome.status === 'ok') assert.equal(outcome.conflicts, 1);
    const unresolved = await listUnresolved(db, 'u1');
    assert.equal(unresolved.length, 1);
    assert.equal((unresolved[0].localData as { name: string }).name, 'My local edit');
    assert.equal((unresolved[0].serverData as { name: string }).name, 'Someone else edited');
    const local = await workouts.getById(db, 'u1', 'w1');
    assert.equal(local?.syncState, 'conflict');
    assert.equal(local?.data.name, 'My local edit', 'local copy is never silently overwritten by the server copy');
  }

  // --- 401: run aborts immediately, outbox row released (not lost) for the next attempt ---
  {
    const db = await freshDb();
    const server = new FakeServer();
    const id = await workouts.create(db, 'u1', workoutPayload() as never);
    const adapter = makeWorkoutAdapter(server);
    adapter.remote.create = async () => {
      throw new SyncAuthError('expired');
    };
    const outcome = await runSync(db, 'u1', [adapter], makeRemote(server), noBackoff);
    assert.equal(outcome.status, 'auth-required');
    const rows = await claimPending(db, 'u1');
    assert.equal(rows.length, 1, 'the intent must still be queued, ready to retry once re-authenticated');
    assert.equal(rows[0].entityId, id);
  }

  // --- 429: run stops and reports retryAfterMs, doesn't hammer the server ---
  {
    const db = await freshDb();
    const server = new FakeServer();
    await workouts.create(db, 'u1', workoutPayload() as never);
    const adapter = makeWorkoutAdapter(server);
    adapter.remote.create = async () => {
      throw new SyncRateLimitError('slow down', 5000);
    };
    const outcome = await runSync(db, 'u1', [adapter], makeRemote(server), noBackoff);
    assert.equal(outcome.status, 'rate-limited');
    if (outcome.status === 'rate-limited') assert.equal(outcome.retryAfterMs, 5000);
  }

  // --- transient 5xx: retried later (attempts/backoff recorded), never dropped, run still completes ---
  {
    const db = await freshDb();
    const server = new FakeServer();
    const id = await workouts.create(db, 'u1', workoutPayload() as never);
    const adapter = makeWorkoutAdapter(server);
    let calls = 0;
    const realCreate = adapter.remote.create;
    adapter.remote.create = async (payload, entityId, signal) => {
      calls++;
      if (calls === 1) {
        const err = new Error('server hiccup');
        err.name = 'ApiHttpError';
        throw err;
      }
      return realCreate(payload, entityId, signal);
    };
    const first = await runSync(db, 'u1', [adapter], makeRemote(server), noBackoff);
    assert.equal(first.status, 'ok');
    if (first.status === 'ok') assert.equal(first.pushed, 0, 'the failing item does not count as pushed');
    const stillQueued = await claimPending(db, 'u1');
    assert.equal(stillQueued.length, 1);
    assert.equal(stillQueued[0].attempts, 1);
    const second = await runSync(db, 'u1', [adapter], makeRemote(server), noBackoff);
    assert.equal(second.status, 'ok');
    if (second.status === 'ok') assert.equal(second.pushed, 1, 'retried run succeeds');
    assert.ok(server.get(id));
  }

  // --- pagination: manifest spans multiple pages, all entities still get pulled ---
  {
    const db = await freshDb();
    const server = new FakeServer();
    server.setManifestPageSize(2);
    for (let i = 0; i < 5; i++) server.seed(`w${i}`, workoutPayload({ name: `Workout ${i}` }));
    const outcome = await runSync(db, 'u1', [makeWorkoutAdapter(server)], makeRemote(server));
    assert.equal(outcome.status, 'ok');
    if (outcome.status === 'ok') assert.equal(outcome.pulled, 5);
    const all = await workouts.getAll(db, 'u1');
    assert.equal(all.length, 5);
  }

  // --- account switching: uid isolation carries through a full sync (no cross-account bleed) ---
  {
    const db = await freshDb();
    const server1 = new FakeServer();
    server1.seed('w1', workoutPayload({ name: 'Account 1 workout' }));
    await runSync(db, 'account-1', [makeWorkoutAdapter(server1)], makeRemote(server1));

    const server2 = new FakeServer();
    server2.seed('w1', workoutPayload({ name: 'Account 2 workout, same id' }));
    await runSync(db, 'account-2', [makeWorkoutAdapter(server2)], makeRemote(server2));

    const acct1 = await workouts.getById(db, 'account-1', 'w1');
    const acct2 = await workouts.getById(db, 'account-2', 'w1');
    assert.equal(acct1?.data.name, 'Account 1 workout');
    assert.equal(acct2?.data.name, 'Account 2 workout, same id');
  }

  console.log('db/sync-engine.test.ts: all assertions passed');
}

main();

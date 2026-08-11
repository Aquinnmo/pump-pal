import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './migrate';
import { SqlExecutor } from './executor';
import * as workouts from './workouts';
import { claimPending, listAll as listOutbox } from './outbox';
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
    // A plain Error on purpose: the engine deliberately does not treat a 404 as
    // a deletion signal (any hop can produce one), so this takes the retry path
    // and the manifest diff is what actually resolves the deletion.
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

  // --- a local write landing mid-push survives and rebases (active-workout autosave) ---
  // Regression: an autosave firing during the round trip used to coalesce into
  // the claimed outbox row, and the completing push then clobbered the entity
  // row with the server's copy and deleted the outbox row — losing the edit,
  // and leaving the next attempt on a stale baseVersion so it conflicted.
  {
    const db = await freshDb();
    const server = new FakeServer();
    const id = await workouts.create(db, 'u1', workoutPayload({ name: 'Set 1' }) as never);
    await runSync(db, 'u1', [makeWorkoutAdapter(server)], makeRemote(server), noBackoff);

    // The user logs another set while this push is still in flight.
    const base = makeWorkoutAdapter(server);
    let midFlight = true;
    const racingAdapter: EntityAdapter = {
      ...base,
      remote: {
        ...base.remote,
        async update(entityId, payload, baseVersion) {
          const result = await base.remote.update(entityId, payload, baseVersion);
          if (midFlight) {
            midFlight = false;
            await workouts.update(db, 'u1', id, {
              ...(await workouts.getById(db, 'u1', id))!.data,
              name: 'Set 2',
            });
          }
          return result;
        },
      },
    };

    await workouts.update(db, 'u1', id, { ...(await workouts.getById(db, 'u1', id))!.data, name: 'Set 1 edited' });
    const raced = await runSync(db, 'u1', [racingAdapter], makeRemote(server), noBackoff);
    assert.equal(raced.status, 'ok');
    if (raced.status === 'ok') assert.equal(raced.pushed, 1);

    // The mid-flight edit is still here, still queued, and rebased onto the
    // version the server just wrote.
    const local = await workouts.getById(db, 'u1', id);
    assert.equal(local?.data.name, 'Set 2');
    assert.equal(local?.syncState, 'dirty');
    const queued = await listOutbox(db, 'u1');
    assert.equal(queued.length, 1);
    assert.equal(queued[0].baseVersion, server.get(id)!.version);

    // ...and the next run lands it without a conflict.
    const settled = await runSync(db, 'u1', [makeWorkoutAdapter(server)], makeRemote(server), noBackoff);
    assert.equal(settled.status, 'ok');
    if (settled.status === 'ok') assert.equal(settled.pushed, 1);
    assert.equal((server.get(id)!.data as { name: string }).name, 'Set 2');
    assert.deepEqual(await listOutbox(db, 'u1'), []);
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

  // --- legacy remote delete on a clean local row: removed locally ---
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
  }

  // --- dirty remote deletion: local has pending edits, server deleted it -> the deletion wins ---
  {
    const db = await freshDb();
    const server = new FakeServer();
    server.seed('w1', workoutPayload({ name: 'Original' }));
    await runSync(db, 'u1', [makeWorkoutAdapter(server)], makeRemote(server)); // clean local copy first
    await workouts.update(db, 'u1', 'w1', { ...(await workouts.getById(db, 'u1', 'w1'))!.data, name: 'My pending edit' });
    server.legacyDelete('w1'); // deleted server-side before our pending edit could push
    // The push phase's update fails (the doc is gone) and is retry-scheduled —
    // a 404 is never taken as proof of deletion. The pull phase, in the SAME
    // run, sees dirty + has a serverVersion + absent from the manifest and
    // accepts the deletion on that evidence instead.
    const outcome = await runSync(db, 'u1', [makeWorkoutAdapter(server)], makeRemote(server), noBackoff);
    assert.equal(outcome.status, 'ok');
    if (outcome.status === 'ok') assert.equal(outcome.remoteDeletions, 1);
    assert.equal(await workouts.getById(db, 'u1', 'w1'), null);
    assert.deepEqual(await listOutbox(db, 'u1'), [], 'the queued intent is discarded with the row');
    assert.equal(server.get('w1'), undefined, 'never re-created server-side');
  }

  // --- dirty remote deletion found by the pull phase (nothing queued to push) ---
  {
    const db = await freshDb();
    const server = new FakeServer();
    server.seed('w1', workoutPayload({ name: 'Original' }));
    await runSync(db, 'u1', [makeWorkoutAdapter(server)], makeRemote(server));
    await workouts.update(db, 'u1', 'w1', { ...(await workouts.getById(db, 'u1', 'w1'))!.data, name: 'My pending edit' });
    server.legacyDelete('w1');
    // The push never reaches the server (offline), so the row stays dirty and
    // the manifest diff is what discovers the deletion: dirty + has a
    // serverVersion + absent remotely.
    const base = makeWorkoutAdapter(server);
    const offlinePush: EntityAdapter = {
      ...base,
      remote: {
        ...base.remote,
        async update() {
          throw new Error('network request failed');
        },
      },
    };
    const outcome = await runSync(db, 'u1', [offlinePush], makeRemote(server), noBackoff);
    assert.equal(outcome.status, 'ok');
    assert.equal(await workouts.getById(db, 'u1', 'w1'), null);
    assert.deepEqual(await listOutbox(db, 'u1'), [], 'the queued intent is discarded with the row');
  }

  // --- 409 on push: local wins automatically, no prompt, no parked record ---
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
    if (outcome.status === 'ok') assert.equal(outcome.pushed, 1);
    assert.equal((server.get('w1')!.data as { name: string }).name, 'My local edit', 'the device edit is re-aimed at the server version and lands');
    const local = await workouts.getById(db, 'u1', 'w1');
    assert.equal(local?.syncState, 'synced');
    assert.equal(local?.data.name, 'My local edit');
    assert.deepEqual(await listOutbox(db, 'u1'), []);
  }

  // --- 409 twice in one run: bounded at one retry, rebased for the next run ---
  {
    const db = await freshDb();
    const server = new FakeServer();
    server.seed('w1', workoutPayload({ name: 'Server truth' }));
    await runSync(db, 'u1', [makeWorkoutAdapter(server)], makeRemote(server));
    await workouts.update(db, 'u1', 'w1', { ...(await workouts.getById(db, 'u1', 'w1'))!.data, name: 'My local edit' });
    server.legacyEdit('w1', workoutPayload({ name: 'Second writer' }));

    // A third writer lands between our rejection and our retry, so the retry
    // is stale too. The run must not spin — it backs off and lets the next
    // scheduled run start from the version it just learned about.
    const base = makeWorkoutAdapter(server);
    let staleVersion: string | null = null;
    const churningAdapter: EntityAdapter = {
      ...base,
      remote: {
        ...base.remote,
        async update(entityId, payload, baseVersion) {
          if (staleVersion === null) {
            staleVersion = server.get(entityId)!.version;
            try {
              return await base.remote.update(entityId, payload, baseVersion);
            } finally {
              server.legacyEdit(entityId, workoutPayload({ name: 'Third writer' }));
            }
          }
          return base.remote.update(entityId, payload, baseVersion);
        },
      },
    };

    const outcome = await runSync(db, 'u1', [churningAdapter], makeRemote(server), noBackoff);
    assert.equal(outcome.status, 'ok');
    if (outcome.status === 'ok') assert.equal(outcome.pushed, 0, 'the row was not pushed, it was retry-scheduled');
    const queued = await listOutbox(db, 'u1');
    assert.equal(queued.length, 1, 'the intent survives for the next run');
    assert.equal(queued[0].attempts, 1);
    assert.equal(queued[0].baseVersion, staleVersion, 'rebased onto the version the first rejection reported');
    assert.equal((await workouts.getById(db, 'u1', 'w1'))?.data.name, 'My local edit', 'local copy untouched');

    // The next run has a fresh version to work from and lands the edit.
    await runSync(db, 'u1', [makeWorkoutAdapter(server)], makeRemote(server), noBackoff);
    assert.equal((server.get('w1')!.data as { name: string }).name, 'My local edit');
    assert.deepEqual(await listOutbox(db, 'u1'), []);
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

  // --- two kinds sharing one id (profile/pushupChallenge are both keyed by uid) ---
  {
    const db = await freshDb();
    const server = new FakeServer();
    server.seed('u1', workoutPayload({ name: 'Same id as the singleton' }));
    const remote: SyncRemote = {
      async manifest(_uid, cursor) {
        const page = server.manifest('workout', cursor);
        // The singleton entry lands last, exactly as the API emits it.
        return { items: [...page.items, { kind: 'pushupChallenge', id: 'u1', version: 'v99' }], nextCursor: page.nextCursor };
      },
      async pull(entities) {
        return server.pull('workout', entities.filter((e) => e.kind === 'workout').map((e) => e.id));
      },
    };
    const outcome = await runSync(db, 'u1', [makeWorkoutAdapter(server)], remote);
    assert.equal(outcome.status, 'ok');
    if (outcome.status === 'ok') assert.equal(outcome.pulled, 1, 'a same-id entry of another kind must not shadow this one');
    assert.equal((await workouts.getById(db, 'u1', 'u1'))?.data.name, 'Same id as the singleton');
  }

  console.log('src/data/sync-engine.test.ts: all assertions passed');
}

main();

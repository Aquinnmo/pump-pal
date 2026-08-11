import type { ManifestEntry, PullRequest, PullResponse, SyncableKind } from '@timber/contract/api';
import { getDoc, runQuery, ts, type DecodedValue } from './rest.js';
import { getOwnedWorkout, toWorkoutDTO } from './workouts.js';
import { getProfile } from './profile.js';
import { listInjuries } from './injuries.js';
import { getChallenge } from './pushup-challenge.js';

/**
 * Full authoritative manifest (v1, per the epic's own design note): legacy
 * direct Firestore clients can still write during the migration grace
 * period, which an incremental change log would silently miss, so this
 * always reflects live Firestore state rather than a maintained log.
 *
 * `workout` entries are the only ones that paginate (a user can have
 * hundreds); `profile`/`injury`/`pushupChallenge` are cheap, bounded
 * singletons-per-user and are only emitted on the first page (no cursor) so
 * a caller paging through workouts never sees them duplicated.
 */

const WORKOUTS_COLLECTION = 'workouts';

export interface ManifestResult {
  items: ManifestEntry[];
  nextCursor: string | null;
}

export async function getManifest(uid: string, opts: { cursor?: string; limit?: number }): Promise<ManifestResult> {
  const limit = Math.min(opts.limit ?? 200, 200);

  const docs = await runQuery({
    collectionId: WORKOUTS_COLLECTION,
    where: [{ field: 'userId', op: 'EQUAL', value: uid }],
    orderBy: [{ field: 'createdAt', direction: 'DESCENDING' }],
    limit: limit + 1,
    startAfter: opts.cursor ? [ts(opts.cursor)] : undefined,
  });

  const page = docs.slice(0, limit);
  const nextCursor = docs.length > limit ? ((page[page.length - 1]?.fields.createdAt as string) ?? null) : null;

  const items: ManifestEntry[] = page.map((d) => ({
    kind: 'workout',
    id: d.path.split('/').pop()!,
    version: d.updateTime,
  }));

  if (!opts.cursor) {
    const userDoc = await getDoc(`users/${uid}`);
    if (userDoc) {
      items.push({ kind: 'profile', id: uid, version: userDoc.updateTime });
      const injuries = Array.isArray(userDoc.fields.injuries) ? userDoc.fields.injuries : [];
      for (const raw of injuries) {
        const id = (raw as Record<string, DecodedValue>).id;
        if (typeof id === 'string') items.push({ kind: 'injury', id, version: userDoc.updateTime });
      }
    }
    const challenge = await getDoc(`users/${uid}/pushup-challenge/data`);
    if (challenge) items.push({ kind: 'pushupChallenge', id: uid, version: challenge.updateTime });
  }

  return { items, nextCursor };
}

/** Groups a flat entity-id request list by kind so each kind is fetched with the minimum number of reads (e.g. one injuries-array read covers any number of requested injury ids). Pure. */
export function groupByKind(entities: { kind: SyncableKind; id: string }[]): Record<SyncableKind, string[]> {
  const grouped: Record<SyncableKind, string[]> = { workout: [], injury: [], profile: [], pushupChallenge: [] };
  for (const e of entities) grouped[e.kind].push(e.id);
  return grouped;
}

export async function pull(uid: string, request: PullRequest): Promise<PullResponse> {
  const grouped = groupByKind(request.entities);
  const missing: PullResponse['missing'] = [];

  const workouts = (
    await Promise.all(
      grouped.workout.map(async (id) => {
        const doc = await getOwnedWorkout(uid, id).catch(() => undefined);
        if (!doc) missing.push({ kind: 'workout', id });
        return doc ? toWorkoutDTO(doc) : null;
      })
    )
  ).filter((w): w is NonNullable<typeof w> => w !== null);

  let injuries: PullResponse['injuries'] = [];
  if (grouped.injury.length > 0) {
    const { injuries: all } = await listInjuries(uid);
    const byId = new Map(all.map((i) => [i.id, i]));
    injuries = grouped.injury.map((id) => byId.get(id)).filter((i): i is NonNullable<typeof i> => !!i);
    for (const id of grouped.injury) if (!byId.has(id)) missing.push({ kind: 'injury', id });
  }

  let profile: PullResponse['profile'];
  if (grouped.profile.length > 0) {
    profile = await getProfile(uid);
    if (!profile.version) missing.push({ kind: 'profile', id: grouped.profile[0] });
  }

  let pushupChallenge: PullResponse['pushupChallenge'];
  if (grouped.pushupChallenge.length > 0) {
    pushupChallenge = await getChallenge(uid);
    if (!pushupChallenge.version) missing.push({ kind: 'pushupChallenge', id: grouped.pushupChallenge[0] });
  }

  return { workouts, injuries, profile, pushupChallenge, missing };
}

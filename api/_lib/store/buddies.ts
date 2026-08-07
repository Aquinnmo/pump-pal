import type { BuddiesResponse, BuddyDTO, BuddyRequestDTO, BuddySearchResult, BuddyState, ChopResponse } from '../../../shared/api-contract.js';
import { ApiError } from '../http.js';
import { sendPush } from './push.js';
import { commit, getDoc, runQuery, ts, type DecodedValue, type FirestoreDoc } from './rest.js';

/**
 * The social graph, in one top-level `friendships` collection (see
 * docs/data-model/buddies.md).
 *
 * Every read here crosses a user boundary, and `firestore.rules` denies all
 * of those to clients — so none of this has a client-side equivalent. It runs
 * on the service-account credential, which bypasses rules, which is exactly
 * why each function re-derives the caller's relationship to the target
 * instead of trusting anything in the request.
 */

const FRIENDSHIPS = 'friendships';
const USERS = 'users';

/** Milliseconds between chops of the same buddy. Generous on purpose — a chop is a nudge, not a rate-limited resource. */
export const CHOP_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Deterministic doc id for a pair, so the same two users always collide on
 * one document no matter who asks first. That collision IS the uniqueness
 * guarantee — a request create uses `{ exists: false }` against this id.
 */
export function pairId(a: string, b: string): string {
  return [a, b].sort().join('_');
}

interface Friendship {
  users: string[];
  status: 'pending' | 'accepted';
  requestedBy: string;
  lastChop: Record<string, string>;
  updateTime: string;
}

function toFriendship(doc: FirestoreDoc): Friendship {
  const f = doc.fields;
  return {
    users: (f.users as string[] | undefined) ?? [],
    status: (f.status as Friendship['status'] | undefined) ?? 'pending',
    requestedBy: (f.requestedBy as string | undefined) ?? '',
    lastChop: (f.lastChop as Record<string, string> | undefined) ?? {},
    updateTime: doc.updateTime,
  };
}

/** The relationship from `uid`'s point of view. */
function stateFor(uid: string, friendship: Friendship | undefined): BuddyState {
  if (!friendship) return 'none';
  if (friendship.status === 'accepted') return 'buddies';
  return friendship.requestedBy === uid ? 'outgoing' : 'incoming';
}

async function loadFriendship(a: string, b: string): Promise<Friendship | undefined> {
  const doc = await getDoc(`${FRIENDSHIPS}/${pairId(a, b)}`);
  return doc ? toFriendship(doc) : undefined;
}

// --------------------------------------------------------------------- search

/** High code point that sorts after any realistic username suffix — the standard Firestore prefix-range trick. */
const PREFIX_END = '';

/**
 * Username prefix search. Case-insensitive because `usernameLower` is the
 * indexed field; a range on one field needs no composite index.
 */
export async function searchUsers(uid: string, query: string): Promise<BuddySearchResult[]> {
  const prefix = query.trim().toLowerCase();
  if (!prefix) return [];

  const docs = await runQuery({
    collectionId: USERS,
    where: [
      { field: 'usernameLower', op: 'GREATER_THAN_OR_EQUAL', value: prefix },
      { field: 'usernameLower', op: 'LESS_THAN_OR_EQUAL', value: prefix + PREFIX_END },
    ],
    orderBy: [{ field: 'usernameLower' }],
    limit: 10,
  });

  const hits = docs
    .map((doc) => ({ uid: doc.path.split('/')[1], username: doc.fields.username as string | undefined }))
    .filter((h): h is { uid: string; username: string } => !!h.username && h.uid !== uid);

  return Promise.all(
    hits.map(async (hit) => ({
      uid: hit.uid,
      username: hit.username,
      state: stateFor(uid, await loadFriendship(uid, hit.uid)),
    }))
  );
}

// ----------------------------------------------------------------- buddy list

/**
 * Consecutive completed days from `startDate`, or 0 once the run is broken.
 *
 * Port of `currentStreakLength` + `isStreakAlive` in
 * `app/(tabs)/pushup-challenge.tsx`, collapsed into one number: a streak with
 * a gap anywhere before today isn't "current" at all, so it reads as 0 rather
 * than as however many days preceded the gap. Today may be incomplete — the
 * day isn't over yet.
 *
 * `today` is the *viewer's* local date, which is the only calendar the server
 * has access to. Exported for tests.
 */
export function currentStreak(startDate: string | null, days: { date: string }[], today: string): number {
  if (!startDate || days.length === 0) return 0;

  const completed = new Set(days.map((d) => d.date));
  let streak = 0;
  const cursor = new Date(`${startDate}T00:00:00Z`);

  // Count forward from day 1 until a day is missing.
  while (completed.has(toDateKey(cursor))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // The first missing day is only forgivable if it's today (still in progress).
  const firstMissing = toDateKey(cursor);
  return firstMissing < today ? 0 : streak;
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Has this user logged a completed workout on `today` (the caller's local date)? */
async function workedOutOn(uid: string, today: string): Promise<boolean> {
  const docs = await runQuery({
    collectionId: 'workouts',
    where: [
      { field: 'status', op: 'EQUAL', value: 'completed' },
      { field: 'userId', op: 'EQUAL', value: uid },
    ],
    orderBy: [{ field: 'date', direction: 'DESCENDING' }],
    limit: 1,
  });
  const latest = docs[0]?.fields.date;
  // ponytail: compares the workout's UTC day against the chopper's local day,
  // so buddies several timezones apart can disagree for a few hours around
  // midnight. Upgrade path is a timezone field on the user doc.
  return typeof latest === 'string' && latest.slice(0, 10) === today;
}

async function buddyDetail(uid: string, buddyUid: string, today: string, lastChoppedAt: string | null): Promise<BuddyDTO | null> {
  const [user, challenge, workedOutToday] = await Promise.all([
    getDoc(`${USERS}/${buddyUid}`, ['username']),
    getDoc(`${USERS}/${buddyUid}/pushup-challenge/data`),
    workedOutOn(buddyUid, today),
  ]);

  const username = user?.fields.username as string | undefined;
  // A buddy with no username can't be rendered or searched for; skip rather
  // than invent a placeholder.
  if (!username) return null;

  const startDate = (challenge?.fields.startDate as string | undefined) ?? null;
  const days = ((challenge?.fields.days as DecodedValue[] | undefined) ?? []) as { date: string }[];

  return {
    uid: buddyUid,
    username,
    currentStreak: currentStreak(startDate, days, today),
    longestStreak: Number(challenge?.fields.longestStreak ?? 0),
    workedOutToday,
    lastChoppedAt,
  };
}

/**
 * Everything the Social screen renders: accepted buddies with their streaks
 * and chop availability, plus pending requests in both directions.
 */
export async function listBuddies(uid: string, today: string): Promise<BuddiesResponse> {
  const docs = await runQuery({
    collectionId: FRIENDSHIPS,
    where: [{ field: 'users', op: 'ARRAY_CONTAINS', value: uid }],
    // ponytail: no pagination — one page of 200 friendships, and the detail
    // fan-out below is 3 reads per accepted buddy. Fine for a friends list;
    // page it if anyone ever gets there.
    limit: 200,
  });

  const friendships = docs.map(toFriendship);
  const requests: BuddyRequestDTO[] = [];
  const accepted: { uid: string; lastChoppedAt: string | null }[] = [];

  for (const f of friendships) {
    const other = f.users.find((u) => u !== uid);
    if (!other) continue;
    if (f.status === 'accepted') {
      accepted.push({ uid: other, lastChoppedAt: f.lastChop[uid] ?? null });
    } else {
      requests.push({ uid: other, username: '', direction: f.requestedBy === uid ? 'outgoing' : 'incoming' });
    }
  }

  const [buddies, namedRequests] = await Promise.all([
    Promise.all(accepted.map((a) => buddyDetail(uid, a.uid, today, a.lastChoppedAt))),
    Promise.all(
      requests.map(async (r) => {
        const doc = await getDoc(`${USERS}/${r.uid}`, ['username']);
        return { ...r, username: (doc?.fields.username as string | undefined) ?? '' };
      })
    ),
  ]);

  return {
    buddies: buddies.filter((b): b is BuddyDTO => b !== null).sort((a, b) => a.username.localeCompare(b.username)),
    requests: namedRequests.filter((r) => r.username),
  };
}

// -------------------------------------------------------------- request/accept

/**
 * Sends a buddy request. The `{ exists: false }` precondition is the whole
 * concurrency story: if the other user requested first, this 409s and we
 * report the existing relationship rather than clobbering it — which also
 * means a simultaneous mutual request settles as one pending doc, not two.
 */
export async function sendBuddyRequest(uid: string, targetUid: string): Promise<{ state: BuddyState }> {
  if (uid === targetUid) throw new ApiError(400, 'You are already your own best buddy.', 'self_buddy');

  const target = await getDoc(`${USERS}/${targetUid}`, ['username']);
  if (!target?.fields.username) throw new ApiError(404, 'No such user.', 'user_not_found');

  try {
    await commit([
      {
        path: `${FRIENDSHIPS}/${pairId(uid, targetUid)}`,
        fields: {
          users: [uid, targetUid].sort(),
          status: 'pending',
          requestedBy: uid,
          lastChop: {},
          createdAt: ts(new Date().toISOString()),
        },
        updateMask: ['users', 'status', 'requestedBy', 'lastChop', 'createdAt'],
        currentDocument: { exists: false },
      },
    ]);
    return { state: 'outgoing' };
  } catch (e) {
    if ((e as { status?: number }).status !== 409) throw e;
    return { state: stateFor(uid, await loadFriendship(uid, targetUid)) };
  }
}

/** Accepts a pending request. Only the recipient can accept — the requester accepting their own request would be a self-approval. */
export async function acceptBuddyRequest(uid: string, targetUid: string): Promise<{ state: BuddyState }> {
  const friendship = await loadFriendship(uid, targetUid);
  if (!friendship) throw new ApiError(404, 'No pending request from that user.', 'request_not_found');
  if (friendship.status === 'accepted') return { state: 'buddies' };
  if (friendship.requestedBy === uid) throw new ApiError(403, 'You can\'t accept your own request.', 'not_recipient');

  await commit([
    {
      path: `${FRIENDSHIPS}/${pairId(uid, targetUid)}`,
      fields: { status: 'accepted', acceptedAt: ts(new Date().toISOString()) },
      updateMask: ['status', 'acceptedAt'],
      currentDocument: { updateTime: friendship.updateTime },
    },
  ]);
  return { state: 'buddies' };
}

// ----------------------------------------------------------------------- chop

/** Pure cooldown check, exported for tests. */
export function chopCooldownRemainingMs(lastChoppedAt: string | undefined, now: number): number {
  if (!lastChoppedAt) return 0;
  const elapsed = now - Date.parse(lastChoppedAt);
  return Math.max(0, CHOP_COOLDOWN_MS - elapsed);
}

/**
 * Chops a buddy: records the chop and pushes them a notification.
 *
 * Two gates, both server-side because the client can't be trusted with
 * either: a per-direction cooldown, and — the point of the feature — no
 * chopping someone who already trained today. The chop is a nudge to go work
 * out, so it stops being available the moment it would be nagging.
 */
export async function chopBuddy(uid: string, targetUid: string, today: string): Promise<ChopResponse> {
  const friendship = await loadFriendship(uid, targetUid);
  if (!friendship || friendship.status !== 'accepted') {
    throw new ApiError(404, 'You can only chop your buddies.', 'not_buddies');
  }

  const remaining = chopCooldownRemainingMs(friendship.lastChop[uid], Date.now());
  if (remaining > 0) {
    throw new ApiError(429, `Axe still swinging. Try again in ${Math.ceil(remaining / 1000)}s.`, 'chop_cooldown');
  }

  if (await workedOutOn(targetUid, today)) {
    throw new ApiError(422, 'They already trained today. Nothing to chop them about.', 'already_worked_out');
  }

  const now = new Date().toISOString();
  // Whole-map write rather than a dotted `lastChop.{uid}` field path: uids can
  // start with a digit, which needs backtick escaping in a REST field path.
  // The updateTime precondition makes the read-modify-write safe.
  await commit([
    {
      path: `${FRIENDSHIPS}/${pairId(uid, targetUid)}`,
      fields: { lastChop: { ...friendship.lastChop, [uid]: now } },
      updateMask: ['lastChop'],
      currentDocument: { updateTime: friendship.updateTime },
    },
  ]);

  const me = await getDoc(`${USERS}/${uid}`, ['username']);
  const username = (me?.fields.username as string | undefined) ?? 'Someone';
  const delivered = await sendPush(targetUid, {
    title: 'Timber',
    body: `${username} chopped you 🪓`,
    data: { type: 'chop', fromUid: uid },
  });

  return { chopped: true, delivered };
}

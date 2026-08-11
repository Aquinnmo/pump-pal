# Timber Buddies — `friendships/{pairId}`

The social graph behind the Social tab: buddy requests, the buddy list with
pushup streaks, and Chop.

## Why it is server-only

Every read this feature needs crosses a user boundary — another person's
username, their pushup streak, whether they trained today. `firestore.rules`
denies all of that to clients and there is no rule that could safely allow it,
so `friendships` is deliberately absent from the rules file and falls through
to the catch-all deny.

All access goes through `/api/buddies` (`apps/api/src/routes/buddies.ts`,
`apps/api/src/routes/notifications.ts`, `apps/api/src/store/buddies.ts`) on the
service-account credential, which bypasses rules. Because that credential can
read anything, each store function re-derives the caller's relationship to the
target rather than trusting the request.

## Document shape

Doc id is the **sorted pair**: `[uidA, uidB].sort().join('_')`. One document
per relationship, whichever side asks first — that collision is the uniqueness
guarantee, enforced by a `currentDocument: { exists: false }` precondition on
create. Two people requesting each other simultaneously settle as one pending
doc, not two.

| Field | Type | Notes |
| --- | --- | --- |
| `users` | `string[]` | The two uids, sorted. Queried with `ARRAY_CONTAINS`. |
| `status` | `'pending' \| 'accepted'` | No `declined` state — see below. |
| `requestedBy` | `string` | Who sent it. Only the *other* user may accept. |
| `createdAt` | timestamp | |
| `acceptedAt` | timestamp | Written on accept. |
| `lastChop` | `map<uid, timestamp>` | Per-direction chop cooldown. |

`lastChop` is keyed by the chopper's uid, so each direction has its own
cooldown. It is written as a whole map (`updateMask: ['lastChop']`) rather
than a dotted field path, because uids can start with a digit and dotted REST
field paths would need backtick escaping. An `updateTime` precondition makes
the read-modify-write safe.

There is no separate `chops` collection. A chop's only durable effect is its
timestamp here plus a push notification — nothing needs a history.

## Chop rules

Both gates are enforced server-side in `chopBuddy`:

1. **Cooldown** — 5 minutes per direction. Violation returns `429`
   `chop_cooldown`.
2. **Already trained** — if the target logged a completed workout on the
   caller's local date, chopping returns `422` `already_worked_out`.

The second rule is the point of the feature: a chop nudges a buddy to go
train, so it stops being available the moment it would just be nagging. The
Social screen renders that state as a positive "Trained" badge, not a disabled
button.

**Timezone ceiling:** the workout's UTC date prefix is compared against the
*caller's* local date, which the client sends as `today`. Buddies several
timezones apart can disagree for a few hours around midnight. The upgrade path
is a timezone field on the user doc.

## Notifications

Delivery is the Expo Push Service (`apps/api/src/store/push.ts`), reading
`users/{uid}.expoPushToken` — see [users.md](./users.md). Not `firebase-admin`:
`apps/api/src/store/` dropped that dependency for cold-start size, and a push SDK
would undo it for one notification type.

`POST /api/buddies/:uid/chop` is the only route that sends a push, and the
request body carries no title, body, or recipient beyond a uid the server then
has to prove is an accepted buddy. There is deliberately no generic
"send a notification" endpoint.

A user with no token (web, or notification permission denied) is simply not
deliverable. The chop still records and the response reports
`delivered: false`.

## Not implemented

No decline, no unfriend, no block. A request that is never accepted just sits
as a pending doc. Add a `DELETE` on the item route when there's a reason to.

## Account deletion

`deleteFriendships` in `apps/api/src/store/account.ts` queries
`users ARRAY_CONTAINS uid` and deletes each doc outright — which also removes
the relationship from the buddy's side, since half a friendship isn't a thing.
`expoPushToken` dies with the user doc.

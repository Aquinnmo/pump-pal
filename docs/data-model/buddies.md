# Timber Buddies — `friendships/{pairId}`

The social graph behind the Social tab: buddy requests, the buddy list with
pushup streaks, and Chop.

An account is a visible social participant only when all three hold:
`socialEnabled !== false` (missing means enabled, for backward compatibility),
`socialSuspended !== true`, and `socialTermsVersion` equals the current
`SOCIAL_TERMS_VERSION` in `packages/contract/src/api-contract.ts`. Anyone else
is removed from search and buddy responses, and the Worker refuses their buddy
actions with 403 `social_disabled`, `social_suspended` or `terms_required`.
Friendship documents stay in place, username reservations stay claimed, and
Push-up Challenge data remains independent.

`socialTermsVersion`, `socialTermsAcceptedAt` and `socialSuspended` are
**Worker-written only**: `firestore.rules` lets a client write nothing on
`users/{uid}` beyond `workoutSplit`, `aiEnabled` and `socialEnabled`, so nobody
can grant themselves visibility or lift a suspension. `POST /api/social/terms`
stamps the terms fields; the moderation script sets `socialSuspended`. Bumping
`SOCIAL_TERMS_VERSION` hides every account until it accepts again.

## Why it is server-only

Every read this feature needs crosses a user boundary — another person's
username, their pushup streak, whether they trained today. `firestore.rules`
denies all of that to clients and there is no rule that could safely allow it,
so `friendships` is deliberately absent from the rules file and falls through
to the catch-all deny.

All access goes through `/api/buddies`, `/api/blocks`, `/api/reports` and
`/api/social/terms` (inline in `apps/api/src/worker.ts`, with the logic in
`apps/api/src/store/buddies.ts`, `blocks.ts` and `reports.ts`) on the
service-account credential, which bypasses rules. Because that credential can
read anything, each store function re-derives the caller's relationship to the
target rather than trusting the request.

## Document shape

Doc id is the **sorted, escaped pair**: `[uidA, uidB].sort().map(u => u.replaceAll('_', '__')).join('_')`
(`_` -> `__` per uid before joining on a single `_`, so the join stays
injective even if a uid itself contains an underscore). One document
per relationship, whichever side asks first — that collision is the uniqueness
guarantee, enforced by a `currentDocument: { exists: false }` precondition on
create. Two people requesting each other simultaneously settle as one pending
doc, not two.

| Field | Type | Notes |
| --- | --- | --- |
| `users` | `string[]` | The two uids, sorted. Queried with `ARRAY_CONTAINS`. |
| `status` | `'pending' \| 'accepted'` | No `declined` state: declining deletes the doc. |
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

## Decline, cancel and remove

`DELETE /api/buddies/:uid` deletes the friendship doc in any state: decline an
incoming request, cancel an outgoing one, or remove an accepted buddy. It is
not gated on social being on or terms accepted, and it is idempotent. Either
user can send a new request afterwards.

## Blocks — `blocks/{blockerUid_blockedUid}`

Server-only (absent from `firestore.rules`). Directed: one doc per block,
id is the blocker's uid then the blocked uid, each escaped like `pairId`.

| Field | Type | Notes |
| --- | --- | --- |
| `blocker` | `string` | Who blocked. |
| `blocked` | `string` | Who is blocked. |
| `createdAt` | timestamp | |

`POST /api/blocks` writes the block and deletes any friendship in one atomic
commit. `DELETE /api/blocks/:uid` removes only the caller's own block.
`GET /api/blocks` lists the caller's blocks. Blocking is not gated on social
being on or terms accepted.

A block hides the two users from each other in **both** directions: search
drops them, a request to them answers 404 `user_not_found` (the same answer as
a missing user, so a block cannot be detected), and list, accept and chop skip
or refuse them. Queries are single-field `EQUAL` on `blocker` or `blocked`, so
no composite index is needed. Account deletion removes every block the user
made or received.

## Reports — `reports/{reporter_target_day}`

Server-only. Filed by `POST /api/reports`. The id carries the UTC day, so one
reporter can file one report per target per day; a repeat is accepted and
dropped.

| Field | Type | Notes |
| --- | --- | --- |
| `reporter` | `string` | |
| `reported` | `string` | |
| `reportedUsername` | `string` | Snapshot, because the account can rename. |
| `reason` | `'harassment' \| 'inappropriate_username' \| 'spam' \| 'other'` | |
| `note` | `string?` | At most 500 characters. |
| `status` | `'open' \| 'actioned' \| 'dismissed'` | Only the developer moves it off `open`. |
| `createdAt` | timestamp | |
| `resolvedAt` | timestamp | Written by the moderation script. |

Reports are kept when the reporter deletes their account, because moderation
needs the record. Review them with `bun run moderation:review` — see
[docs/policy-operations.md](../policy-operations.md#moderate-user-reports).

## Account deletion

`deleteFriendships` in `apps/api/src/store/account.ts` queries
`users ARRAY_CONTAINS uid` and deletes each doc outright — which also removes
the relationship from the buddy's side, since half a friendship isn't a thing.
`expoPushToken` dies with the user doc. The `deleteBlocks` phase removes every
`blocks` doc the user made or received. `reports` are retained.

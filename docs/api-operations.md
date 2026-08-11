# API Operations

Every route the Vercel API boundary exposes, matching what's actually
implemented under `api/`. Wire types are defined once in
[`packages/contract/src/api-contract.ts`](../packages/contract/src/api-contract.ts) (domain routes) and
[`packages/contract/src/ai-contract.ts`](../packages/contract/src/ai-contract.ts) (`/api/ai`) — read those
for the exact Zod schemas; this doc is the route map and the semantics that
don't fit in a type signature.

For the deploy/env checklist, see [deployment.md](deployment.md). For the
Firestore shapes these routes read/write, see
[data-model/README.md](data-model/README.md).

## Conventions across every route

- **Auth:** `Authorization: Bearer <Firebase ID token>` on every request
  except `OPTIONS` preflight. The uid is taken exclusively from the verified
  token (`apps/api/src/auth.ts`) — no route accepts a uid in the body, query, or
  path as anything other than a resource id to look up, and every lookup is
  scoped to the caller's own uid.
- **CORS:** origins are an allowlist (`API_ALLOWED_ORIGINS` env var, see
  `apps/api/src/http.ts`). Requests with no `Origin` header (native app) skip CORS
  entirely. `api/ai.ts` is the one exception — same-origin only, no CORS
  handling, predates the domain routes.
- **Timestamps:** ISO-8601 UTC strings on the wire, always. Server routes
  convert Firestore `Timestamp`/REST `timestampValue` at the edge; a client
  never sees a Firestore sentinel type.
- **Versions:** every mutable entity carries an opaque string `version`
  (`packages/contract/src/api-contract.ts` — derived from the backing Firestore doc's
  `updateTime`). Mutations that need optimistic concurrency accept
  `baseVersion` in the body; a mismatch returns **409** with
  `{ error, code: 'conflict', remote: <current entity>, remoteVersion }` — the
  caller rebases onto `remote`, it never has to re-fetch separately.
- **Idempotent creates:** collection creates take a client-supplied `id`.
  Retrying a create with the same `id` returns the already-created entity
  instead of erroring or duplicating.
- **Errors:** `{ error: string, code?: string }`. 5xx bodies are generic
  ("Internal error") — the real error is logged server-side only, since
  provider/Firestore error bodies can echo request content.

## Routes

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/profile` | yes | `workoutSplit`, `aiUsage`, `version` |
| PATCH | `/api/profile` | yes | allowlisted (`workoutSplit` only); `baseVersion` optional |
| GET | `/api/injuries` | yes | full injury history for the caller |
| POST | `/api/injuries` | yes | create; idempotent by client `id` |
| PATCH | `/api/injuries/:id` | yes | partial edit (e.g. resolve); `baseVersion` optional (versions the whole profile doc) |
| DELETE | `/api/injuries/:id` | yes | idempotent; does NOT unstamp workout history — see below |
| POST | `/api/injuries/:id/apply-to-history` | yes | stamp this injury onto every workout in its onset/resolved window; idempotent |
| POST | `/api/injuries/:id/remove-from-history` | yes | unstamp from every workout that carries it; idempotent, works even after the injury record is deleted |
| GET | `/api/workouts?status=&cursor=&limit=` | yes | cursor-paginated, newest `createdAt` first |
| POST | `/api/workouts` | yes | create; idempotent by client `id` |
| GET | `/api/workouts/:id` | yes | 404 if not found or not owned |
| PATCH | `/api/workouts/:id` | yes | versioned (`baseVersion` required); completing (`status: 'completed'`) without an explicit `injuries[]` auto-stamps the caller's ongoing injuries |
| DELETE | `/api/workouts/:id` | yes | idempotent |
| PATCH | `/api/workouts/reorder` | yes | bulk `queueOrder` update, up to 200 at once |
| GET | `/api/catalog` | yes | full approved exercise catalog + cache-invalidation `version`; `Cache-Control: public, max-age=60, stale-while-revalidate=300` (identical response for every caller, no private data) |
| POST | `/api/catalog/pending` | yes | "can't find my exercise" submission; `createdBy`/`status` are server-stamped, never accepted from the body |
| GET | `/api/pushup-challenge` | yes | `version: null` when there's no active challenge |
| PUT | `/api/pushup-challenge` | yes | full desired-state replace; `baseVersion` omitted = last-write-wins (matches today's client behavior), `null` = "I expect no doc yet", a string = real optimistic concurrency |
| DELETE | `/api/account/data` | yes | purges every per-user Firestore collection/doc (see below); does **not** delete the Firebase Auth account |
| GET | `/api/sync/manifest?cursor=&limit=` | yes | `{kind,id,version}` for every entity the caller owns, paginated |
| POST | `/api/sync/pull` | yes | bounded (≤200) batch fetch of full entities by `{kind,id}` |
| POST | `/api/ai` | yes | AI proxy — see `packages/contract/src/ai-contract.ts`; unchanged by this epic except its provider/model/effort are now fully env-driven, see below |

## Account deletion (`DELETE /api/account/data`)

Ports `apps/mobile/app/settings-account.tsx confirmDeleteAccount`'s Firestore cleanup
server-side, same order: canonical `workouts` (by `userId`) → legacy
`users/{uid}/workouts/*` → `users/{uid}/pushup-challenge/data` →
`users/{uid}`. Every phase runs even if an earlier one fails (best-effort),
and every phase is independently idempotent, so a `partial: true` response
just means "call it again." The client still calls Firebase Auth's
`deleteUser` itself, only after this returns `partial: false`.

## Sync (`GET /api/sync/manifest`, `POST /api/sync/pull`)

v1 is a **full authoritative manifest**, not an incremental change log —
deliberately, because legacy direct-Firestore clients can still write during
the migration grace period and would bypass a log. `workout` entries paginate
(a user can have hundreds); `profile`/`injury`/`pushupChallenge` are cheap
bounded per-user singletons and only appear on the manifest's first page (no
`cursor`). A local record whose id is absent from the manifest and is clean
(no pending local edits) may be deleted locally; if it's dirty, surface it as
a conflict instead of dropping it silently.

## AI routing (`POST /api/ai`)

`AI_PROVIDER` and `AI_MODEL` are **required** env vars — no default,
unsupported values fail at cold start. `AI_REASONING_EFFORT` is optional
(`provider-default` if unset) and validated per-provider: OpenAI accepts the
full portable set including `max`; Google tops out at `high` (`xhigh`/`max`
are rejected at cold start, not silently clamped). See
`apps/api/src/ai/model.ts`.

## What's NOT implemented yet

- **Cold-start timing evidence** (`docs/deployment.md` § Cold-start check)
  requires an actual Preview deployment and hasn't been measured.
- **Firestore deny-all rules** are prepared (`firestore.deny-all.rules`) but
  not deployed — see the rollout checklist in `deployment.md`. Until that
  human-approved step, direct client Firestore access under the current
  `firestore.rules` continues to work alongside the API (additive grace
  period), and both write to the same collections.

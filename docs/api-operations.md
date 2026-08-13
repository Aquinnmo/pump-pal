# API Operations

The Cloudflare Worker exposes only privileged operations. Owner-safe workout,
injury, workout-split, pushup, and approved-catalog operations use direct
Firestore REST with Firebase Auth, App Check, and `firestore.rules` as their
boundary. Wire types are defined in
[`packages/contract/src/api-contract.ts`](../packages/contract/src/api-contract.ts)
and [`packages/contract/src/ai-contract.ts`](../packages/contract/src/ai-contract.ts).

For the deploy/env checklist, see [deployment.md](deployment.md). For the
Firestore shapes these routes read/write, see
[data-model/README.md](data-model/README.md).

## Conventions across every route

- **Auth:** `Authorization: Bearer <Firebase ID token>` and
  `X-Firebase-AppCheck` on every privileged request
  except `OPTIONS` preflight. The uid is taken exclusively from the verified
  token (`apps/api/src/auth.ts`) — no route accepts a uid in the body, query, or
  path as anything other than a resource id to look up, and every lookup is
  scoped to the caller's own uid.
- **CORS:** browser origins are an allowlist (`API_ALLOWED_ORIGINS`); native
  requests have no `Origin` header and skip CORS checks.
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
| POST | `/api/injuries/:id/apply-to-history` | yes | stamp this injury onto every workout in its onset/resolved window; idempotent |
| POST | `/api/injuries/:id/remove-from-history` | yes | unstamp from every workout that carries it; idempotent, works even after the injury record is deleted |
| POST | `/api/catalog/pending` | yes | "can't find my exercise" submission; `createdBy`/`status` are server-stamped, never accepted from the body |
| DELETE | `/api/account/data` | yes | purges every per-user Firestore collection/doc (see below); does **not** delete the Firebase Auth account |
| POST | `/api/ai` | yes | AI proxy — see `packages/contract/src/ai-contract.ts`; unchanged by this epic except its provider/model/effort are now fully env-driven, see below |

The retired safe paths (`GET /api/profile`, safe `PATCH /api/profile`,
`/api/workouts*`, safe `/api/injuries*`, `GET /api/catalog`,
`/api/pushup-challenge`, and `/api/sync/*`) return **410** with
`{ code: "client_upgrade_required" }` during cutover. The two injury-history
operations above remain privileged.

## Account deletion (`DELETE /api/account/data`)

Ports `apps/mobile/app/settings-account.tsx confirmDeleteAccount`'s Firestore cleanup
server-side, same order: canonical `workouts` (by `userId`) → legacy
`users/{uid}/workouts/*` → `users/{uid}/pushup-challenge/data` →
`users/{uid}`. Every phase runs even if an earlier one fails (best-effort),
and every phase is independently idempotent, so a `partial: true` response
just means "call it again." The client still calls Firebase Auth's
`deleteUser` itself, only after this returns `partial: false`.

## Direct sync

Native SQLite remains the UI source of truth. It reconciles against bounded
direct Firestore owner queries and uses opaque `updateTime` versions with one
local-wins retry. Web is online-only and reads the same safe paths directly.

User-authored drafts never reach this boundary. Native screens keep drafts in
memory until Finish, Save, Resolve, Remove, or another explicit finalized
action; SQLite and its outbox are written before sync is requested. The direct
workout transport rejects `status: 'in_progress'` as a validation error, and
web mutable repositories retain each document's `updateTime` through updates
and deletes. Username reservation remains Worker-authoritative and updates the
native profile cache as already-synced state after success, without queuing a
profile outbox write.

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
- **Remote enforcement** (Firestore Rules, App Check enforcement, and Worker
  secrets/routes) is human-gated; follow the rollout checklist in
  `deployment.md`.

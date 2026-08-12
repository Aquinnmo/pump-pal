# Deployment: direct Firestore + privileged Worker

This is the human-run rollout for Timber's split trust boundary. Nothing in
this document has been executed by the repository or an agent. Every deploy,
Firebase Console change, Worker secret, App Check setting, key rotation, and
legacy cleanup is a human gate.

## Architecture

```text
Native clients: SQLite UI + durable outbox
  └─ safe owner data ────────────> Firestore REST (Auth + App Check + Rules)
  └─ privileged operations ─────> Cloudflare Worker (Auth + App Check)

Web client: online-only
  └─ safe approved/owner data ──> Firestore REST (Auth + App Check + Rules)
  └─ privileged operations ─────> Cloudflare Worker
```

Safe direct data is: a caller's workouts, profile `workoutSplit`, injury
documents, pushup challenge, and approved catalog reads. The Worker is only
for username/push-token updates, buddies/chops, AI, pending catalog
submissions, injury-history bulk actions, and account deletion. It has no
generic Firestore proxy. Retired safe `/api/*` paths deliberately return HTTP
410 `{ code: "client_upgrade_required" }` during cutover.

Native SQLite remains the only mobile UI source of truth. Its outbox retains
offline writes, uses opaque Firestore `updateTime` versions, makes one
local-wins conflict retry, backs off transient errors, retries auth once, and
parks permanent failures for the UI. Web is online-only and must not add
SQLite/AsyncStorage persistence for these direct reads.

## Required configuration

| Location | Values | Notes |
| --- | --- | --- |
| Mobile/EAS and web build | `EXPO_PUBLIC_FIREBASE_*`, `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY` (web) | Public identifiers only; never a secret. |
| Cloudflare Worker secret/variable | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, one AI key, `AI_PROVIDER`, `AI_MODEL`, `API_ALLOWED_ORIGINS` | See `apps/api/.dev.vars.example`; secrets never enter `wrangler.toml`. |
| Cloudflare Worker variable | `FIREBASE_PROJECT_NUMBER`, `APP_CHECK_ALLOWED_APP_IDS`, `APP_CHECK_MODE` | Start with `monitor`; app IDs are comma-separated Firebase app IDs. |
| Firebase | Firestore rules/indexes, Auth providers, App Check providers | Separate preview and production projects are strongly preferred. |

The Worker targets are declared but not deployed in
[`apps/api/wrangler.toml`](../apps/api/wrangler.toml):
`timber-api-preview.adam-montgomery.ca` and
`timber-api.adam-montgomery.ca`. The Expo web bundle may remain a separate
Vercel project (`apps/mobile`); it needs the Worker origin in
`EXPO_PUBLIC_API_BASE_URL`, and the Worker allowlist must contain the web
origin. The former Vercel API project is obsolete.

## Preview checklist — human gate

1. Create or select an isolated Firebase **preview** project. Register the
   iOS, Android, and web apps; configure Auth providers and the exact preview
   web OAuth origin.
2. Add preview public config to the EAS/web environment. Add preview Worker
   secrets/variables through Cloudflare, not files. Set
   `APP_CHECK_MODE=monitor` and list only preview app IDs.
3. Run local checks before deploying:

   ```bash
   bun run test:contract
   bun run test:api
   bun apps/mobile/src/data/firestore-sync-remote.test.ts
   bun apps/mobile/src/data/sync-engine.test.ts
   bun run test:firestore-rules
   bun run check:direct-boundaries
   ```

   The rules emulator needs JDK 21 or newer. Do not claim emulator success
   from a JDK 17 machine.
4. Deploy preview Firestore rules and indexes with the Firebase CLI, then
   deploy the preview Worker using Wrangler. These are intentional remote
   mutations and require an operator to run them.
5. Run `tools/migrate-trust-domains.js --snapshot <export.json>` first as a
   dry run. An authorized operator copies only missing destination documents,
   verifies the produced count/hash report, and retains legacy source fields.
   The supplied tool does not contact Firebase or delete data.
6. Release preview web and native clients together. Test a 200-workout user,
   empty account, cross-account denial, approved-only catalog query, direct
   safe writes, and every privileged Worker operation. Confirm safe traffic
   does not reach Worker logs; a deliberately stale safe API call returns 410.
7. Check Worker logs for redacted `requestId`, route, method, status, and
   duration. Never log headers, tokens, UID, request body, response body, or
   AI prompts. Measure direct-operation p50/p95 in Preview; do not substitute
   fixture latency for remote latency. Investigate a direct path more than 20%
   slower than the retired API baseline before production.

## App Check progression — human gate

Configure App Attest with DeviceCheck fallback (iOS), Play Integrity
(Android), and reCAPTCHA Enterprise (web). Debug providers are local/preview
only and must never be bundled into production clients or Worker bindings.

Keep the Worker in monitor mode until Preview telemetry shows 100% verified
privileged traffic for a continuous 24 hours. The operator may then enable
Firebase App Check enforcement and Worker `APP_CHECK_MODE=enforce`. Keep a
documented owner and a tested rollback to monitor mode. Rules/Auth/App Check
must never be weakened merely to unblock a client.

## Production checklist — human gate

1. Repeat the Preview configuration in the production Firebase project and
   production Worker environment. Use distinct Worker/AI credentials where
   possible; do not copy preview secrets into source control.
2. Run the same local checks and deploy production rules/indexes before
   client rollout. Do not run a production build or deployment as part of
   local implementation verification.
3. Copy/verify trust-domain documents in production. Keep legacy fields for
   14 days after verification; existing destination documents are never
   overwritten.
4. Release the Worker first in monitor mode, then release the web client and
   native update/build. Coordinate with the roughly ten users and confirm all
   active clients upgraded before tightening enforcement.
5. Personally verify on iOS, Android, and web: direct workout/injury/split/
   pushup/catalog flows; username, buddies, AI, pending catalog,
   injury-history, and account deletion; an empty account; an owner-denied
   query; and a stale client receiving the 410 upgrade response.
6. Perform the native offline matrix: make, edit, finish, plan, reorder, and
   delete workouts in airplane mode; force-close; reconnect; confirm a second
   device sees each change once; test a two-device conflict; test parked
   permanent failure and sign-out choices. Cached AI remains readable offline;
   new AI generation reports that connectivity is required.
7. Only after the above is stable and App Check observation is clean, enable
   App Check enforcement. Remove/retire the obsolete Vercel API project after
   confirming no live safe requests rely on it; Vercel web hosting itself is
   unaffected.
8. Rotate any previously exposed AI or service credentials **after** the
   replacement Worker configuration is verified. Revoke the old credential
   only after the replacement is live and monitoring is clean.
9. At day 14, run a separately authorized legacy cleanup. Before removal,
   verify migration hashes/counts again and retain an export. Do not delete
   legacy fields during the initial copy.

## Rollback and incident response

Before legacy cleanup, rollback is additive: set Worker App Check back to
monitor (or disable Firebase enforcement), restore the prior rules/indexes if
needed, and restore the prior Worker/client release. Do not erase native
SQLite; it is the recovery copy for unsynced changes. If a legacy consumer
must be restored before the 14-day cleanup, reverse-materialize legacy fields
from the new injury/private documents using an authorized, reviewed one-off
operation; never overwrite newer canonical data.

After cleanup, recovery requires the retained export and an explicit data
repair plan. Treat it as a one-way production change.

For an incident: stop enforcement changes, preserve redacted Worker logs and
the migration report, identify whether the fault is Auth/App Check/Rules/
Worker/client, and only then roll back the smallest affected layer. Do not
solve an incident by opening broad Firestore rules or introducing a generic
proxy.

## Local development

Copy `apps/mobile/.env.example.eas` to the ignored mobile `.env` and
`apps/api/.dev.vars.example` to ignored `apps/api/.dev.vars`. Use only
non-production credentials. Worker local development uses Wrangler; Firestore
rule tests use the local emulator. Neither command authorizes a remote deploy.

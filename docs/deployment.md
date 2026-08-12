# Deployment: the staged API rollout

Every Firestore and AI operation the app needs now has a route under `api/`
(see [api-operations.md](api-operations.md) for the full list). This is the
staged checklist for taking that from "code that typechecks" to "the only
path the app uses to talk to Firestore," in order — later stages depend on
earlier ones actually being verified, not just deployed.

**Nothing in this document has been executed.** Every `npx firebase-tools`,
`vercel env`, or Vercel-dashboard step below is a human action. This doc
prepares and orders them; it does not perform them.

> **Stage 4 (the deny-all Firestore rules cutover) requires the user's
> explicit, separate approval, given only after they've personally verified
> the migrated app.** No fixed time or adoption threshold substitutes for
> that verification — see Stage 4 below.

---

## 0a. Two Vercel projects

The web bundle and the API are separate deployments from the same repository.
Each Vercel project points at its own workspace directory and reads the
`vercel.json` inside it:

| Vercel project | Root Directory | Build | `vercel.json` supplies |
| --- | --- | --- | --- |
| web | `apps/mobile` | `bunx expo export -p web` → `dist` | SPA rewrite to `/index.html` |
| API | `apps/api` | none — Vercel builds `api/index.ts` as a function | `fluid: true` + the `/api/:path*` rewrite |

That `/api/:path*` rewrite is not decoration. `apps/api/api/index.ts` is a plain
index route, not a `[...path].ts` catch-all; as a catch-all it was only ever
routed one segment deep in production, so `/api/profile` dispatched while
`/api/sync/manifest` returned a platform 404 that never invoked the function —
invisible in the runtime logs, which is why it survived so long.

Because the two projects have different origins, every browser call is
cross-origin. The pairing below must hold or the web app cannot reach the API
at all:

- web project: `EXPO_PUBLIC_API_BASE_URL` = the API project's origin
- API project: `API_ALLOWED_ORIGINS` includes the web project's origin

Native builds are unaffected by the second one — they send no `Origin` header
and skip CORS entirely — but they still need the first.

---

## 0. What talks to what

```
Expo app ──┬─ web:    EXPO_PUBLIC_API_BASE_URL + /api/*  (cross-origin -> CORS)
           └─ native: EXPO_PUBLIC_API_BASE_URL + /api/*  (not a browser -> no CORS)
                              │
                              │  Authorization: Bearer <Firebase ID token>
                              ▼
        apps/api/api/index.ts  (the single Vercel function)
                        ├─ apps/api/src/router.ts ....... path -> handler table, lazy imports
                        ├─ apps/api/src/http.ts ......... CORS/method/auth wrapper, request id, structured logs
                        ├─ apps/api/src/auth.ts ......... verifies the token (jose)
                        ├─ apps/api/src/store/ .......... Firestore REST, service account
                        └─ apps/api/src/ai/ ............. Gemini / OpenAI, server-only key
```

Two dedicated origins, separate from each other and from the app's own web
build:

| Environment | API origin | Purpose |
| --- | --- | --- |
| Preview | `https://timber-preview.adam-montgomery.ca` | staging — Preview Vercel deployments, Preview Firebase env |
| Production | `https://timber-api.adam-montgomery.ca` | the API every real user's app talks to |

Two separate credential classes, easy to confuse:

| | Who holds it | What it does |
| --- | --- | --- |
| Firebase **web config** (`EXPO_PUBLIC_FIREBASE_*`) | the client, publicly | identifies the project. Not a secret — it's protected by `firestore.rules`, not by being hidden. |
| Firebase **service account** (`FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`) | Vercel only | lets the API read/write Firestore, **bypassing `firestore.rules`**. A real secret. |
| AI provider key (`GEMINI_API_KEY` or `OPENAI_API_KEY`) | Vercel only | only the *selected* provider's key is ever required (`apps/api/src/ai/model.ts`) |

---

## Stage 1 — Preview environment

Everything in this stage targets **Preview only**. Nothing here touches a
real user.

### 1a. Expo client configuration and Google registrations (Preview)

Set the following **public client** values for the EAS `preview` environment
(the checked-in `eas.json` selects it). They identify a Firebase/OAuth client;
they are safe to embed, but they are not a substitute for Firebase security
rules or server-side token verification.

| Variable | Preview value | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Firebase web config | Firebase client identity |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase web config | Firebase Auth redirect domain |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | `pumppal-c9199` | Firebase project |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase web config | Firebase storage bucket |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase web config | Firebase messaging sender ID |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | Firebase web config | Firebase app ID (not an OAuth client ID) |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google OAuth web client ID | browser sign-in/linking |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Google OAuth iOS client ID | installed iOS sign-in/linking |
| `EXPO_PUBLIC_API_BASE_URL` | Preview API origin | required for **every** build, native and web. The API is its own Vercel project, so there is no same-origin `/api/*` to fall back to. |

Before testing, enable Google in Firebase Authentication → Sign-in method. In
Google Cloud/Firebase OAuth settings, register the exact Preview web origin as
an authorized JavaScript origin, the exact Preview iOS bundle identifier on
the iOS OAuth client, and the Android package plus the SHA-1 and SHA-256 of
the EAS Preview signing certificate on the Android OAuth client. Use the OAuth
client IDs only—never a client secret, service-account JSON, or a signing key
in EAS variables or the repository.

### 1b. Vercel environment variables (Preview)

Vercel dashboard → the project → Settings → Environment Variables → scope to
**Preview**. None of these are prefixed `EXPO_PUBLIC_`, and none of them ever
should be — Metro inlines any `EXPO_PUBLIC_*` value into every APK and web
bundle, which is the exact leak this API exists to close.

| Variable | Value | Notes |
| --- | --- | --- |
| `AI_PROVIDER` | `google` or `openai` | **required**, no default — see `apps/api/src/ai/model.ts` |
| `AI_MODEL` | e.g. `gemini-3.5-flash` | **required**, no default |
| `AI_REASONING_EFFORT` | optional | `provider-default` (unset), `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max` (OpenAI-only — rejected at cold start against `google`) |
| `GEMINI_API_KEY` | from Google AI Studio | only if `AI_PROVIDER=google` |
| `OPENAI_API_KEY` | from the OpenAI dashboard | only if `AI_PROVIDER=openai` |
| `FIREBASE_PROJECT_ID` | `pumppal-c9199` | |
| `FIREBASE_CLIENT_EMAIL` | from the service account JSON | |
| `FIREBASE_PRIVATE_KEY` | from the service account JSON | literal `\n` escapes, see below |
| `API_ALLOWED_ORIGINS` | `https://timber-preview.adam-montgomery.ca` | comma-separated if more than one; native app calls (no `Origin` header) are unaffected |

#### Getting the service account

Firebase console → Project settings → **Service accounts** → *Generate new
private key*. Downloads a JSON file. From it:

- `client_email` → `FIREBASE_CLIENT_EMAIL`
- `private_key` → `FIREBASE_PRIVATE_KEY`, pasted **exactly as it appears**,
  literal `\n` two-character escapes intact — do not convert to real
  newlines. `apps/api/src/store/rest.ts` converts them back at runtime.

Delete the downloaded JSON afterwards. It is a full-access credential to
Firestore and belongs in exactly one place: Vercel.

Preview and Production may use the **same** service account (it's scoped to
the Firebase project, not the Vercel environment) — the separation that
matters is the AI provider key and `API_ALLOWED_ORIGINS`, which should differ
per environment so a Preview key leak doesn't cost Production spend.

### 1c. Point Preview at `timber-preview.adam-montgomery.ca`

Assign that domain to the project's Preview deployments in the Vercel
dashboard (Settings → Domains). Confirm a Preview deploy actually builds
`api/**` as functions — check the deployment's **Functions** tab. If it
produced only static output, nothing past this point will work.

### 1d. Run the focused test suite

```bash
bun run test:api
```

Covers isolation (`api/**` only imports `api/`+`shared/`; no Firebase SDK in
`api/`; no AI provider SDK/key outside `api/`), CORS allow/deny, auth,
contract schema validation, and ownership/conflict/idempotency for every
domain (see `docs/api-operations.md`). This is a prerequisite for Stage 1e,
not a substitute for it — none of these tests touch a live deployment.

### 1e. Cold-start check (Preview only, requires deployment)

The Firebase Admin cold-start gate is **p95 < 2s**. This API stayed on the
Firestore REST adapter (`apps/api/src/store/rest.ts`) rather than reintroducing
`firebase-admin`, specifically to avoid this risk — but verify it, don't
assume it.

Method: after a fresh Preview deploy (or ≥5 minutes idle, to force a genuinely
cold invocation), hit a representative route (e.g. `GET /api/catalog`) with a
valid token 20+ times, recording wall-clock time for **each** request
separately:

```bash
for i in $(seq 1 20); do
  curl -s -o /dev/null -w "%{time_total}\n" \
    -H "Authorization: Bearer $TOKEN" \
    https://timber-preview.adam-montgomery.ca/api/catalog
  sleep 20   # long enough that most requests are genuinely cold
done
```

Bucket by cold-vs-warm (first request after an idle gap vs. immediately
following one), compute p50/p95 for each bucket separately — a blended number
hides a bad cold p95 behind a fast warm p95.

**If cold p95 > 2s: stop and flag it for human review. Do not silently swap
the REST adapter for `firebase-admin`** — that trade only makes sense with
the actual measurement in hand, and it changes the isolation/dependency
story this whole epic was built around.

---

## Stage 2 — Production environment

Only after Stage 1 is fully green (tests pass, cold-start measured and under
gate) and someone has manually exercised each `api-operations.md` route
against Preview.

### 2a. Vercel environment variables (Production)

Same table as 1a, scoped to **Production**, with:

- `API_ALLOWED_ORIGINS=https://timber-api.adam-montgomery.ca` — a
  **different** value than Preview's, not a superset. If the web app is
  served from a separate origin than the API (rather than the same-origin
  setup `api/ai.ts` historically assumed), add that origin too,
  comma-separated.
- Provider keys **should be freshly issued**, not copy-pasted from Preview —
  see Stage 5 (key rotation) for why and the required order.

### 2b. Point Production at `timber-api.adam-montgomery.ca`

Same domain-assignment step as 1b, scoped to Production.

### 2c. Deploy

`api/` deploys automatically alongside the static web export — Vercel picks
up a root `api/` directory as functions with no extra config. Production
builds from `main`, so the branch has to land first (standard PR/merge flow,
not covered here).

### 2d. Verify — every operation, once, against Production

Exercise each route in `api-operations.md` at least once against the real
Production origin before treating this as done. At minimum:

| Op | Where in the app | What proves it worked |
| --- | --- | --- |
| `muscle-analysis` (AI) | Analytics tab → muscle insight cards | over/under-trained muscles render |
| `workout-completion` (AI) | Active workout → suggest exercises | 2–5 suggestions appear |
| `split-names` (AI) | Set-split screen → custom split description | day names generate |
| `daily-name` (AI) | Pushup Challenge tab | a name shows, and is the *same* name on a second device |
| `POST /api/workouts` → `PATCH .../:id` | log and complete a real workout | shows up in history, `injuries[]` reflects ongoing injuries |
| `GET /api/sync/manifest` | — | returns every workout/injury/profile/challenge id the test account owns |

**AI quota.** Call a metered op four times as one user. The fourth must fail
with "You've used all your AI suggestions for today." Then open
`users/{uid}` in the Firestore console and confirm `aiUsage.count == 3` **and
every other field on the document is still there** — Firestore's REST
`:commit` replaces the whole document unless the write carries an
`updateMask`; a bug there would silently wipe the user's split and injuries.
The type system enforces the mask (`apps/api/src/store/rest.ts`'s `FirestoreWrite`
requires it); confirm it against real data once anyway.

---

## Stage 3 — Monitoring & rollback

### Monitoring

Vercel dashboard → the deployment → **Logs**. Every route logs one
structured, redacted JSON line per request (`apps/api/src/http.ts` /
`api/ai.ts`): `requestId`, `route`, `method`, `status`, `durationMs`, and for
`/api/ai` additionally `op`/`provider`/`model`. Never a request body,
response payload, or secret. Filter on `"status":5` to find server errors; a
5xx also gets a full `console.error` line with the real error (still
server-side only — never returned to the client, since provider/Firestore
error bodies can echo request content and key hints).

Watch for:
- A spike in `401` — usually `FIREBASE_PROJECT_ID` drift or expired-token
  churn, not an attack.
- A spike in `403` with `code: origin_denied` — `API_ALLOWED_ORIGINS` missing
  an origin a real client is calling from.
- A spike in `409` (`conflict`) — expected at some background rate from
  concurrent edits (e.g. two devices); a sustained spike suggests a client
  retry loop isn't rebasing onto the returned `remote` correctly.

### Rollback

The API is stateless per-request (no migrations, no schema changes to
Firestore docs beyond what routes already write today) — rollback is a
Vercel deployment rollback (dashboard → Deployments → previous deployment →
**Promote to Production**), nothing else to undo. Firestore data written by
the new routes is shape-compatible with what the old direct-client writes
produced, so rolling the API back does not require rolling back data.

The one thing rollback does **not** undo: if Stage 4 (deny-all rules) has
already been deployed, rolling the API back would leave clients with no
Firestore access at all (deny-all + no working API = fully broken). **Do not
roll back the API after Stage 4 without also reverting `firestore.rules`
first.**

---

## Stage 4 — the deny-all cutover (human-gated, do LAST)

### Native offline-first verification checklist

Before the Stage 4 gate, a human must verify this on both iOS and Android
against the production API:

- Start, edit, finish, plan, reorder, and delete workouts while airplane mode
  is enabled; each committed change must remain visible after a force-close.
- Reconnect and confirm the same records arrive on a second device without
  duplicates. Make an intentional two-device edit and use both conflict
  choices once; a remote deletion must explain that the server copy was
  removed rather than silently losing the local workout.
- Confirm the Settings Sync row distinguishes offline, syncing, retrying, and
  attention-needed states.
- With pending data, attempt sign-out: verify **Sync and Sign Out**, **Discard
  and Sign Out**, and **Stay Signed In**. After either allowed sign-out path,
  sign into a different account and confirm no prior workout, widget, queue,
  or conflict data appears.
- Verify cached AI results remain readable offline and new AI generation says
  it needs a connection; reconnect and confirm normal generation resumes.

**Rollback while this checklist is in progress:** leave the local SQLite
database intact, stop the rollout, and restore the prior API deployment if
needed. Do not deploy deny-all rules and do not erase the device: the outbox
is the recovery copy for unsynced work.

This is the one step in this whole document that is genuinely
one-directional in practice (technically reversible, but every minute it's
live with a client not yet migrated is a minute that client is fully broken).

**Preconditions, all required:**

1. Stages 1–3 are done and stable in Production for a real usage period (not
   a fixed number — long enough that the user is confident, per the design
   note below).
2. **The user has personally verified the migrated app** — native and web,
   against Production, doing real workouts/injuries/pushup-challenge/AI
   flows. No fixed time or adoption threshold substitutes for this. This is
   the one non-negotiable gate.
3. Both client repositories (native, SQLite-backed; web, REST-backed — the
   offline-first epic's deliverable) no longer read/write Firestore directly
   outside `apps/mobile/src/config/firebase.ts`/auth-only files. Confirm with a repo-wide
   grep for `from 'firebase/firestore'` outside those files, or once it
   exists, a repo-wide isolation check equivalent to
   `tools/check-boundary-isolation.js`'s api-scoped version.

**The cutover itself**, only after all three:

```bash
cp firestore.deny-all.rules firestore.rules
git add firestore.rules
git commit -m "Cut client Firestore access over to deny-all; API is now the only path"
npx firebase-tools@latest login          # once
npx firebase-tools@latest deploy --only firestore:rules
```

> Use `firebase-tools`, **not** `npx firebase`. This repo depends on the
> `firebase` package — that's the client JS SDK, ships no executable. The CLI
> is the separate package `firebase-tools`.

Check the Firebase console afterwards and confirm the deployed rules match
`firestore.deny-all.rules`. The API is unaffected — its service-account
credential bypasses `firestore.rules` by design, same as it does today.

**If anything looks wrong after deploying:** revert with
`git revert`, redeploy the prior `firestore.rules` the same way. This is the
scenario Stage 3's rollback note above is about — reverting the API without
also reverting the rules leaves clients broken either way.

---

## Stage 5 — key rotation (after Stage 2 verification, not before)

Rotating a provider key before the proxy is verified working breaks the app
and makes the failure ambiguous — always confirm Stage 2d first.

1. Confirm all four AI ops work through Production (Stage 2d).
2. Provider dashboard (OpenAI / Google AI Studio) → revoke the old key →
   issue a new one.
3. Put the new key **only** in Vercel, for the environment it belongs to.
4. If any `EXPO_PUBLIC_*` provider-key/model/provider variable still exists
   in a client `.env` or EAS environment from before this API existed,
   delete it — Metro bundles `EXPO_PUBLIC_*` into every build regardless of
   whether code still reads it.
5. Rebuild and redistribute any client build that shipped with the old key
   embedded. Revoking the key is what makes old builds harmless; the rebuild
   is just cleanup.

---

## Local development

**Native** (dev build or Expo Go on device) — no local server needed. Point
`EXPO_PUBLIC_API_BASE_URL` at the deployed Preview or Production URL and
`bunx expo start` as usual. Native isn't a browser, so there's no CORS
preflight; calls to the deployed API just work.

**Web** — `bunx expo start --web` serves from Metro on `localhost:8081`, which
does **not** run Vercel functions.
- `npx vercel dev` serves the static output and every `api/**` function on
  one origin. Slower loop (runs the `expo export` build command), but it's
  the only way to exercise the API locally.
- Pointing web dev at a deployed API origin instead works too, since CORS is
  now handled (`API_ALLOWED_ORIGINS`) — add `http://localhost:8081` to the
  Preview environment's `API_ALLOWED_ORIGINS` if you want that loop.

---

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `You must be signed in to use AI features.` | thrown client-side before any request; no Firebase user |
| `Invalid or expired session` (401) | the client force-refreshes its Firebase token and replays once; if the replay still fails, compare Preview `FIREBASE_PROJECT_ID` with the client config and use the safe route/status/code/request ID diagnostic to find the server log |
| `403` with `code: origin_denied` | the caller's `Origin` isn't in Preview `API_ALLOWED_ORIGINS`; this is not retried, so correct the allowlist and correlate the route/status/code/request ID with Vercel logs |
| JSON parse error, response looks like HTML | hit a Vercel-SSO-protected `*.vercel.app` URL instead of the custom domain |
| `404` with API code `not_found` | the API route ran but the requested resource is absent; inspect the route and request ID rather than treating it as a deploy failure |
| `404` on every `/api/*` route, especially an HTML/non-API response | Vercel didn't build the function (check the Functions tab), the origin is wrong, or you're on `expo start --web` without `vercel dev` |
| `Missing required env var: ...` at cold start | one of `AI_PROVIDER`/`AI_MODEL`/`FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` unset for that environment |
| `Unsupported AI_REASONING_EFFORT "max"` for google | `max` is OpenAI-only; use `high` or switch `AI_PROVIDER` |
| 401 from the token exchange, function-side | `FIREBASE_PRIVATE_KEY` newlines mangled — must be literal `\n`, not real line breaks |
| Every AI request 429s immediately | `aiUsage` stuck from testing; clear the field on `users/{uid}` |
| `409 conflict` on every mutation from one client | that client is sending a stale/wrong `baseVersion` — check it's using the `version` from its last GET/mutation response, not a cached one |
| Works on web, fails on native (or vice versa) | `EXPO_PUBLIC_API_BASE_URL` unset for that build profile, or `API_ALLOWED_ORIGINS` missing the web origin |

Function logs are in the Vercel dashboard under the deployment → Logs (see
Stage 3, Monitoring).

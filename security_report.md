# Security Review: pump-pal

## Scope

Standard repository scan of the pump-pal Git worktree at scope .

- Scan mode: repository
- Target kind: git_worktree
- Target ID: target_sha256_b01302349401b7ab0498117c8d261a34fd7575515593fe79c99fbd6bfff6f272
- Revision: b5f6d0256c22b120b082d1ecb6a25b058a7bea7b
- Snapshot digest: codex-security-snapshot/v1:sha256:cb73823a4f75e35d7b16abdd2cb5afe2172b0729ffd6007a9a56975913473b28
- Inventory strategy: repository
- Included paths: .
- Excluded paths: none
- Runtime or test status: not recorded
- Artifacts reviewed: apps/api, apps/mobile, packages/contract, firestore.rules, tests/firestore.rules.test.ts

Limitations and exclusions:
- The repository inventory contains 421 files; the conservative fully reviewed lower bound is 69 files, so remaining repository areas require follow-up review.

### Scan Summary

| Field | Value |
| --- | --- |
| Reportable findings | 4 |
| Severity mix | medium: 3, low: 1 |
| Confidence mix | high: 3, medium: 1 |
| Coverage | partial |
| Validation mode | static source review with independent baseline and focused investigators |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

Protect user workout, injury, profile, social-graph, push-token, quota, and account data; protect the AI/provider budget and service-account Firestore authority. Attackers include unauthenticated callers, authenticated users, revoked-session holders, modified clients, and users who can write their own owner-scoped Firestore documents. Trust boundaries are mobile/web clients to Firebase Auth and Firestore rules, mobile/web clients to the Worker, the Worker service account to Firestore, and the Worker to AI and push providers.

### Assets

- User workout and injury history
- User profiles and usernames
- Social graph and buddy notifications
- Private push tokens and AI quota
- AI provider budget
- Service-account Firestore authority

### Trust Boundaries

- Client to Firebase Auth
- Client to Firestore security rules
- Client to authenticated Worker API
- Worker service account to Firestore
- Worker to AI and push providers

### Attacker Capabilities

- Send crafted authenticated API requests
- Write owner-scoped Firestore documents allowed by rules
- Retain and replay an unexpired token after revocation
- Use a modified or scripted client without App Check attestation

### Security Objectives

- Enforce prompt revocation of privileged sessions
- Keep App Check and environment boundaries fail-closed
- Validate owner-written data before cross-user processing
- Preserve social-graph membership authorization
- Bound provider and backend resource use

### Assumptions

- Firebase signature, issuer, audience, algorithm, expiry, and subject validation are intended controls.
- The committed Wrangler production configuration reflects the deployed security mode.
- The scan is offline and does not verify remote deployment state.

## Findings

| Finding | Severity | Confidence | Detailed write-up |
| --- | --- | --- | --- |
| [Revoked or disabled Firebase sessions remain accepted until expiry](#finding-1) | medium | high | inline below |
| [Malformed challenge data can disable buddy-list requests](#finding-2) | medium | high | inline below |
| [Production App Check is configured fail-open](#finding-3) | medium | high | inline below |
| [Underscore-delimited friendship keys can collide and bypass membership checks](#finding-4) | low | medium | inline below |

### Confidence Scale

| Label | Meaning |
| --- | --- |
| high | Direct evidence supports the finding with no material unresolved blocker. |
| medium | Evidence supports a plausible issue, but material runtime or reachability proof remains. |
| low | Evidence is incomplete and the item is retained only for explicit follow-up. |

<a id="finding-1"></a>

### [1] Revoked or disabled Firebase sessions remain accepted until expiry

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | The source explicitly documents the missing revocation check and the downstream middleware passes any cryptographically valid subject to privileged handlers. |
| Category | session-management |
| CWE | CWE-613 |
| Affected lines | apps/api/src/auth.ts:12-16, apps/api/src/auth.ts:22-41, apps/api/src/worker.ts:124-133 |

#### Summary

The API validates Firebase ID-token signatures and claims but does not check revocation or disabled-account state, so a revoked session retains privileged access until the token expires.

#### Root Cause

Authentication is local JWT validation only; it lacks a revocation or disabled-user state check before authorizing service-account-backed operations.

**Authentication explicitly omits revocation** — `apps/api/src/auth.ts:12-16`

The authentication module documents that cryptographic verification is not revocation-aware and that disabled or signed-out sessions remain usable.

```typescript
 * ponytail: no revocation check. verifyIdToken(token, true) used to ask Firebase whether the session was revoked; jose verifies locally and cannot. A signed-out or disabled account keeps working until its current token expires (<=1h).
```

**Valid token subject becomes request identity** — `apps/api/src/auth.ts:22-41`

No account-state or revocation lookup occurs after the signature, issuer, audience, algorithm, and subject checks.

```typescript
const { payload } = await jwtVerify(token, JWKS, { issuer: `https://securetoken.google.com/${projectId}`, audience: projectId, algorithms: ['RS256'] });
if (!payload.sub) throw new Error('Token missing sub');
return payload.sub;
```

**Verified subject gates privileged routes** — `apps/api/src/worker.ts:124-133`

The returned subject is accepted as uid and passed to every /api/\* handler.

```typescript
const uid = await verifyUid(context.req.header('Authorization'));
const appCheck = await verifyAppCheckToken(context.req.header('X-Firebase-AppCheck'), context.env);
context.set('uid', uid);
await next();
```

#### Validation

Validated by tracing the bearer token through requireUid into the /api/\* middleware and confirming the source's explicit no-revocation statement.

Validation method: Static source trace

- **Status:** validated
- **Disposition:** reportable

**Authentication explicitly omits revocation** — `apps/api/src/auth.ts:12-16`

The authentication module documents that cryptographic verification is not revocation-aware and that disabled or signed-out sessions remain usable.

```typescript
 * ponytail: no revocation check. verifyIdToken(token, true) used to ask Firebase whether the session was revoked; jose verifies locally and cannot. A signed-out or disabled account keeps working until its current token expires (<=1h).
```

**Valid token subject becomes request identity** — `apps/api/src/auth.ts:22-41`

No account-state or revocation lookup occurs after the signature, issuer, audience, algorithm, and subject checks.

```typescript
const { payload } = await jwtVerify(token, JWKS, { issuer: `https://securetoken.google.com/${projectId}`, audience: projectId, algorithms: ['RS256'] });
if (!payload.sub) throw new Error('Token missing sub');
return payload.sub;
```

**Verified subject gates privileged routes** — `apps/api/src/worker.ts:124-133`

The returned subject is accepted as uid and passed to every /api/\* handler.

```typescript
const uid = await verifyUid(context.req.header('Authorization'));
const appCheck = await verifyAppCheckToken(context.req.header('X-Firebase-AppCheck'), context.env);
context.set('uid', uid);
await next();
```

Assertions:
- Revocation state is never queried.
- The remaining token lifetime is documented as at most one hour.
- The affected middleware protects Firestore, AI, social, push, and account-deletion routes.

Counterevidence and remaining uncertainty:
- Issuer, audience, RS256, expiry-related claims, and non-empty subject are checked.
- The exposure is bounded by the token lifetime.

#### Dataflow

The canonical finding records the affected path at apps/api/src/auth.ts:12-16, apps/api/src/auth.ts:22-41, apps/api/src/worker.ts:124-133, but no expanded source-to-sink narrative was recorded.

**Authentication explicitly omits revocation** — `apps/api/src/auth.ts:12-16`

The authentication module documents that cryptographic verification is not revocation-aware and that disabled or signed-out sessions remain usable.

```typescript
 * ponytail: no revocation check. verifyIdToken(token, true) used to ask Firebase whether the session was revoked; jose verifies locally and cannot. A signed-out or disabled account keeps working until its current token expires (<=1h).
```

**Valid token subject becomes request identity** — `apps/api/src/auth.ts:22-41`

No account-state or revocation lookup occurs after the signature, issuer, audience, algorithm, and subject checks.

```typescript
const { payload } = await jwtVerify(token, JWKS, { issuer: `https://securetoken.google.com/${projectId}`, audience: projectId, algorithms: ['RS256'] });
if (!payload.sub) throw new Error('Token missing sub');
return payload.sub;
```

**Verified subject gates privileged routes** — `apps/api/src/worker.ts:124-133`

The returned subject is accepted as uid and passed to every /api/\* handler.

```typescript
const uid = await verifyUid(context.req.header('Authorization'));
const appCheck = await verifyAppCheckToken(context.req.header('X-Firebase-AppCheck'), context.env);
context.set('uid', uid);
await next();
```

#### Reachability

A user whose Firebase session is revoked or whose account is disabled continues sending the still-valid bearer token to the Worker; requireUid returns the subject, /api/\\\* stores it as uid, and the handler performs privileged operations.

Preconditions:
- The attacker possesses a previously issued valid ID token.
- The token has not yet expired.

#### Severity

**Medium** — A holder of a revoked or disabled session can continue owner-scoped and privileged API actions for the remaining token lifetime; the window is bounded but affects all authenticated operations.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Use revocation-aware Firebase verification or a bounded, cached Auth account-state lookup for revoked and disabled accounts; fail closed for deleted or disabled users.

Tests:
- A revoked token is rejected before reaching any /api/\* handler.
- A disabled account cannot use an unexpired token.
- A normal unrevoked token still authenticates.

<a id="finding-2"></a>

### [2] Malformed challenge data can disable buddy-list requests

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | The writable rule, unsafe consumer assumptions, and Promise.all error propagation are directly visible in source. |
| Category | input-validation |
| CWE | CWE-20 |
| Affected lines | firestore.rules:50-54, firestore.rules:97-100, apps/api/src/store/buddies.ts:135-150, apps/api/src/store/buddies.ts:175-193, apps/api/src/worker.ts:152-156 |

#### Summary

Owner-only Firestore rules accept arbitrary challenge-day list members and any string startDate, but the server assumes typed day objects and valid dates while building another user's buddy list.

#### Root Cause

The direct Firestore rule validates only top-level challenge types, while a privileged cross-user reader treats the stored data as the stricter shared API shape and lets one malformed record reject the entire Promise.all fan-out.

**Challenge rule accepts untyped list members** — `firestore.rules:50-54`

The rule does not validate that each days element is a map with a valid date, nor that startDate is a valid date.

```firestore-rules
function validChallenge(challenge) {
  return challenge.keys().hasOnly(['startDate', 'days', 'longestStreak'])
    && challenge.startDate is string
    && challenge.days is list && challenge.days.size() <= 400
    && challenge.longestStreak is int && challenge.longestStreak >= 0;
}
```

**Owner can write the weakly validated challenge** — `firestore.rules:97-100`

Any authenticated owner can store a malformed challenge that downstream buddy readers will consume.

```firestore-rules
match /users/{uid}/pushup-challenge/data {
  allow get: if owner(uid);
  allow create, update: if owner(uid) && validChallenge(request.resource.data);
  allow delete: if owner(uid);
}
```

**Buddy service assumes valid challenge data** — `apps/api/src/store/buddies.ts:135-150`

A null day element throws on d.date; an invalid date reaches toISOString through toDateKey.

```typescript
const completed = new Set(days.map((d) => d.date));
...
const cursor = new Date(`${startDate}T00:00:00Z`);
...
const firstMissing = toDateKey(cursor);
```

**Malformed buddy data fails the response** — `apps/api/src/store/buddies.ts:175-193`

The decoded untrusted challenge is cast without runtime validation before currentStreak is called.

```typescript
const days = ((challenge?.fields.days as DecodedValue[] | undefined) ?? []) as { date: string }[];
...
currentStreak: currentStreak(startDate, days, today),
```

**Buddy list is the affected API route** — `apps/api/src/worker.ts:152-156`

The route delegates to listBuddies, which resolves every accepted buddy detail.

```typescript
app.get('/api/buddies', async (context) => {
  const today = localDate.safeParse(context.req.query('today'));
  if (!today.success) throw new ApiError(400, 'today must be a YYYY-MM-DD local date');
  return context.json(await listBuddies(context.get('uid'), today.data));
});
```

#### Validation

Validated the owner-write path, the unsafe cast and date conversion, and the Promise.all fan-out used by buddy details.

Validation method: Static source trace

- **Status:** validated
- **Disposition:** reportable

**Challenge rule accepts untyped list members** — `firestore.rules:50-54`

The rule does not validate that each days element is a map with a valid date, nor that startDate is a valid date.

```firestore-rules
function validChallenge(challenge) {
  return challenge.keys().hasOnly(['startDate', 'days', 'longestStreak'])
    && challenge.startDate is string
    && challenge.days is list && challenge.days.size() <= 400
    && challenge.longestStreak is int && challenge.longestStreak >= 0;
}
```

**Owner can write the weakly validated challenge** — `firestore.rules:97-100`

Any authenticated owner can store a malformed challenge that downstream buddy readers will consume.

```firestore-rules
match /users/{uid}/pushup-challenge/data {
  allow get: if owner(uid);
  allow create, update: if owner(uid) && validChallenge(request.resource.data);
  allow delete: if owner(uid);
}
```

**Buddy service assumes valid challenge data** — `apps/api/src/store/buddies.ts:135-150`

A null day element throws on d.date; an invalid date reaches toISOString through toDateKey.

```typescript
const completed = new Set(days.map((d) => d.date));
...
const cursor = new Date(`${startDate}T00:00:00Z`);
...
const firstMissing = toDateKey(cursor);
```

**Malformed buddy data fails the response** — `apps/api/src/store/buddies.ts:175-193`

The decoded untrusted challenge is cast without runtime validation before currentStreak is called.

```typescript
const days = ((challenge?.fields.days as DecodedValue[] | undefined) ?? []) as { date: string }[];
...
currentStreak: currentStreak(startDate, days, today),
```

**Buddy list is the affected API route** — `apps/api/src/worker.ts:152-156`

The route delegates to listBuddies, which resolves every accepted buddy detail.

```typescript
app.get('/api/buddies', async (context) => {
  const today = localDate.safeParse(context.req.query('today'));
  if (!today.success) throw new ApiError(400, 'today must be a YYYY-MM-DD local date');
  return context.json(await listBuddies(context.get('uid'), today.data));
});
```

Assertions:
- days:\[null\] is allowed by the rule and causes days.map(d =\> d.date) to throw.
- An invalid startDate causes toISOString on an invalid Date to throw.
- Promise.all rejects the entire buddy response when one detail rejects.

Counterevidence and remaining uncertainty:
- The normal client contract defines structured challenge-day objects.
- The attack requires authentication and an accepted buddy relationship.

#### Dataflow

The canonical finding records the affected path at firestore.rules:50-54, firestore.rules:97-100, apps/api/src/store/buddies.ts:135-150, apps/api/src/store/buddies.ts:175-193, apps/api/src/worker.ts:152-156, but no expanded source-to-sink narrative was recorded.

**Challenge rule accepts untyped list members** — `firestore.rules:50-54`

The rule does not validate that each days element is a map with a valid date, nor that startDate is a valid date.

```firestore-rules
function validChallenge(challenge) {
  return challenge.keys().hasOnly(['startDate', 'days', 'longestStreak'])
    && challenge.startDate is string
    && challenge.days is list && challenge.days.size() <= 400
    && challenge.longestStreak is int && challenge.longestStreak >= 0;
}
```

**Owner can write the weakly validated challenge** — `firestore.rules:97-100`

Any authenticated owner can store a malformed challenge that downstream buddy readers will consume.

```firestore-rules
match /users/{uid}/pushup-challenge/data {
  allow get: if owner(uid);
  allow create, update: if owner(uid) && validChallenge(request.resource.data);
  allow delete: if owner(uid);
}
```

**Buddy service assumes valid challenge data** — `apps/api/src/store/buddies.ts:135-150`

A null day element throws on d.date; an invalid date reaches toISOString through toDateKey.

```typescript
const completed = new Set(days.map((d) => d.date));
...
const cursor = new Date(`${startDate}T00:00:00Z`);
...
const firstMissing = toDateKey(cursor);
```

**Malformed buddy data fails the response** — `apps/api/src/store/buddies.ts:175-193`

The decoded untrusted challenge is cast without runtime validation before currentStreak is called.

```typescript
const days = ((challenge?.fields.days as DecodedValue[] | undefined) ?? []) as { date: string }[];
...
currentStreak: currentStreak(startDate, days, today),
```

**Buddy list is the affected API route** — `apps/api/src/worker.ts:152-156`

The route delegates to listBuddies, which resolves every accepted buddy detail.

```typescript
app.get('/api/buddies', async (context) => {
  const today = localDate.safeParse(context.req.query('today'));
  if (!today.success) throw new ApiError(400, 'today must be a YYYY-MM-DD local date');
  return context.json(await listBuddies(context.get('uid'), today.data));
});
```

#### Reachability

An authenticated user writes days:\\\[null\\\] or an invalid startDate to their own challenge document; a connected user's /api/buddies request reads that document, currentStreak throws, and the route returns an internal error.

Preconditions:
- The attacker is authenticated and can write their own challenge document.
- The victim has accepted the attacker as a buddy.
- The malformed document remains present.

#### Severity

**Medium** — An authenticated user who is accepted as a buddy can poison their own challenge document and cause connected users' buddy-list requests to fail with a server error.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Validate every challenge-day element and date format in firestore.rules or route all writes through the validated contract, revalidate decoded challenge data server-side, and isolate or skip malformed buddy records so one record cannot fail the whole response.

Tests:
- A direct write containing days:\[null\] is rejected by rules.
- An invalid startDate is rejected.
- A malformed buddy document is skipped or yields a bounded per-record error without failing the whole list.

<a id="finding-3"></a>

### [3] Production App Check is configured fail-open

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | The production deployment value and the Worker enforcement branch are both explicit in source. |
| Category | security-misconfiguration |
| CWE | CWE-693 |
| Affected lines | apps/api/wrangler.toml:23-30, apps/api/src/worker.ts:124-131, apps/api/src/app-check.ts:21-46 |

#### Summary

Production configures App Check in monitor mode, while the Worker rejects failed App Check only in enforce mode, allowing any authenticated client without attestation to invoke privileged routes.

#### Root Cause

Deployment and runtime do not fail closed on App Check; the configured security boundary is observational in production.

**Production App Check mode** — `apps/api/wrangler.toml:23-30`

The production environment explicitly uses monitor mode.

```toml
[env.production.vars]
API_ALLOWED_ORIGINS = "https://timber.adam-montgomery.ca"
AI_PROVIDER = "openai"
AI_MODEL = "gpt-5.6-luna"
FIREBASE_PROJECT_ID = "pumppal-c9199"
FIREBASE_PROJECT_NUMBER = "631531267876"
APP_CHECK_ALLOWED_APP_IDS = "1:631531267876:android:408ab2aa328df72f2cb5b1,1:631531267876:android:fabd8253b44f27302cb5b1,1:631531267876:ios:64cee819c67f9eee2cb5b1,1:631531267876:web:d67fbca4633bf49c2cb5b1"
APP_CHECK_MODE = "monitor"
```

**Monitor mode permits unverified requests** — `apps/api/src/worker.ts:124-131`

A missing or invalid token is only rejected in enforce mode; production monitor mode logs and continues.

```typescript
const appCheck = await verifyAppCheckToken(context.req.header('X-Firebase-AppCheck'), context.env);
if (context.env.APP_CHECK_MODE === 'enforce' && !appCheck.verified) {
  throw new ApiError(401, 'Invalid or missing App Check token', 'app_check_failed');
}
if (!appCheck.verified) console.warn('[worker] app-check-unverified', { reason: appCheck.reason, route: context.req.path });
```

#### Validation

Validated by matching the production Wrangler variable to the runtime conditional and tracing the continuation into authenticated privileged handlers.

Validation method: Static configuration-to-code trace

- **Status:** validated
- **Disposition:** reportable

**Production App Check mode** — `apps/api/wrangler.toml:23-30`

The production environment explicitly uses monitor mode.

```toml
[env.production.vars]
API_ALLOWED_ORIGINS = "https://timber.adam-montgomery.ca"
AI_PROVIDER = "openai"
AI_MODEL = "gpt-5.6-luna"
FIREBASE_PROJECT_ID = "pumppal-c9199"
FIREBASE_PROJECT_NUMBER = "631531267876"
APP_CHECK_ALLOWED_APP_IDS = "1:631531267876:android:408ab2aa328df72f2cb5b1,1:631531267876:android:fabd8253b44f27302cb5b1,1:631531267876:ios:64cee819c67f9eee2cb5b1,1:631531267876:web:d67fbca4633bf49c2cb5b1"
APP_CHECK_MODE = "monitor"
```

**Monitor mode permits unverified requests** — `apps/api/src/worker.ts:124-131`

A missing or invalid token is only rejected in enforce mode; production monitor mode logs and continues.

```typescript
const appCheck = await verifyAppCheckToken(context.req.header('X-Firebase-AppCheck'), context.env);
if (context.env.APP_CHECK_MODE === 'enforce' && !appCheck.verified) {
  throw new ApiError(401, 'Invalid or missing App Check token', 'app_check_failed');
}
if (!appCheck.verified) console.warn('[worker] app-check-unverified', { reason: appCheck.reason, route: context.req.path });
```

Assertions:
- Production sets APP_CHECK_MODE to monitor.
- Only enforce mode throws on unverified App Check.
- Bearer authentication remains a separate mandatory control.

Counterevidence and remaining uncertainty:
- App Check JWT verification itself validates issuer, audience, algorithm, type, and app ID.
- A valid Firebase ID token is still required.

#### Dataflow

The canonical finding records the affected path at apps/api/wrangler.toml:23-30, apps/api/src/worker.ts:124-131, apps/api/src/app-check.ts:21-46, but no expanded source-to-sink narrative was recorded.

**Production App Check mode** — `apps/api/wrangler.toml:23-30`

The production environment explicitly uses monitor mode.

```toml
[env.production.vars]
API_ALLOWED_ORIGINS = "https://timber.adam-montgomery.ca"
AI_PROVIDER = "openai"
AI_MODEL = "gpt-5.6-luna"
FIREBASE_PROJECT_ID = "pumppal-c9199"
FIREBASE_PROJECT_NUMBER = "631531267876"
APP_CHECK_ALLOWED_APP_IDS = "1:631531267876:android:408ab2aa328df72f2cb5b1,1:631531267876:android:fabd8253b44f27302cb5b1,1:631531267876:ios:64cee819c67f9eee2cb5b1,1:631531267876:web:d67fbca4633bf49c2cb5b1"
APP_CHECK_MODE = "monitor"
```

**Monitor mode permits unverified requests** — `apps/api/src/worker.ts:124-131`

A missing or invalid token is only rejected in enforce mode; production monitor mode logs and continues.

```typescript
const appCheck = await verifyAppCheckToken(context.req.header('X-Firebase-AppCheck'), context.env);
if (context.env.APP_CHECK_MODE === 'enforce' && !appCheck.verified) {
  throw new ApiError(401, 'Invalid or missing App Check token', 'app_check_failed');
}
if (!appCheck.verified) console.warn('[worker] app-check-unverified', { reason: appCheck.reason, route: context.req.path });
```

#### Reachability

A signed-in script sends a valid Firebase bearer token but omits or forges App Check; the Worker verifies the ID token, logs an App Check warning, and proceeds to AI, social, catalog, profile, push, and account handlers.

Preconditions:
- The attacker has a valid Firebase account and ID token.
- The production deployment uses the committed monitor configuration.

#### Severity

**Medium** — A valid Firebase account is still required, but unapproved scripts can automate provider-backed AI and service-account operations without the configured app-attestation control.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

After verifying all production clients, set production APP_CHECK_MODE=enforce and add a deployment check that rejects missing, invalid, or unknown App Check mode values.

Tests:
- A production request with a valid ID token and no App Check token returns 401.
- A valid production App Check token succeeds.
- An unset or invalid production mode fails closed.

<a id="finding-4"></a>

### [4] Underscore-delimited friendship keys can collide and bypass membership checks

| Field | Value |
| --- | --- |
| Severity | low |
| Confidence | medium |
| Confidence rationale | The key collision and missing membership check are certain in source; exploitability depends on the presence of colliding real Firebase UIDs and a matching relationship. |
| Category | authorization |
| CWE | CWE-639 |
| Affected lines | apps/api/src/store/buddies.ts:28-29, apps/api/src/store/buddies.ts:283-299, apps/api/src/worker.ts:163-166, packages/contract/src/api-contract.ts:452-454 |

#### Summary

The friendship document key is formed by sorting two UIDs and joining them with an underscore, so pairs such as (a_b,c) and (a,b_c) address the same document; acceptBuddyRequest never confirms that the loaded document contains the caller and target.

#### Root Cause

Social authorization relies on an ambiguous derived document key and a requestedBy check rather than validating the membership of the loaded friendship document.

**Ambiguous pair key** — `apps/api/src/store/buddies.ts:28-29`

Joining unescaped identifiers with an underscore is not injective when UIDs may contain underscores.

```typescript
export function pairId(a: string, b: string): string {
  return [a, b].sort().join('_');
}
```

**Accept path trusts the colliding document** — `apps/api/src/store/buddies.ts:283-299`

After loading by the ambiguous key, the function checks requestedBy but never checks friendship.users contains uid and targetUid.

```typescript
const friendship = await loadFriendship(uid, targetUid);
if (!friendship) throw new ApiError(404, 'No pending request from that user.', 'request_not_found');
if (friendship.status === 'accepted') return { state: 'buddies' };
if (friendship.requestedBy === uid) throw new ApiError(403, 'You can\\'t accept your own request.', 'not_recipient');
...
```

**Target identifier is only nonempty** — `packages/contract/src/api-contract.ts:452-454`

The request schema does not constrain identifier syntax or exclude delimiter-bearing values.

```typescript
export const sendBuddyRequestInput = z.object({ uid: z.string().min(1) });
```

#### Validation

Validated the key collision algebraically and confirmed the accept path lacks a users-membership invariant.

Validation method: Static source trace plus key-collision analysis

- **Status:** validated
- **Disposition:** reportable

**Ambiguous pair key** — `apps/api/src/store/buddies.ts:28-29`

Joining unescaped identifiers with an underscore is not injective when UIDs may contain underscores.

```typescript
export function pairId(a: string, b: string): string {
  return [a, b].sort().join('_');
}
```

**Accept path trusts the colliding document** — `apps/api/src/store/buddies.ts:283-299`

After loading by the ambiguous key, the function checks requestedBy but never checks friendship.users contains uid and targetUid.

```typescript
const friendship = await loadFriendship(uid, targetUid);
if (!friendship) throw new ApiError(404, 'No pending request from that user.', 'request_not_found');
if (friendship.status === 'accepted') return { state: 'buddies' };
if (friendship.requestedBy === uid) throw new ApiError(403, 'You can\\'t accept your own request.', 'not_recipient');
...
```

**Target identifier is only nonempty** — `packages/contract/src/api-contract.ts:452-454`

The request schema does not constrain identifier syntax or exclude delimiter-bearing values.

```typescript
export const sendBuddyRequestInput = z.object({ uid: z.string().min(1) });
```

Assertions:
- pairId('a_b','c') and pairId('a','b_c') both produce a_b_c.
- acceptBuddyRequest never compares friendship.users with uid and targetUid.

Counterevidence and remaining uncertainty:
- The attack requires real colliding UID shapes and a pending relationship.
- No direct client write rule permits arbitrary friendship documents.

#### Dataflow

The canonical finding records the affected path at apps/api/src/store/buddies.ts:28-29, apps/api/src/store/buddies.ts:283-299, apps/api/src/worker.ts:163-166, packages/contract/src/api-contract.ts:452-454, but no expanded source-to-sink narrative was recorded.

**Ambiguous pair key** — `apps/api/src/store/buddies.ts:28-29`

Joining unescaped identifiers with an underscore is not injective when UIDs may contain underscores.

```typescript
export function pairId(a: string, b: string): string {
  return [a, b].sort().join('_');
}
```

**Accept path trusts the colliding document** — `apps/api/src/store/buddies.ts:283-299`

After loading by the ambiguous key, the function checks requestedBy but never checks friendship.users contains uid and targetUid.

```typescript
const friendship = await loadFriendship(uid, targetUid);
if (!friendship) throw new ApiError(404, 'No pending request from that user.', 'request_not_found');
if (friendship.status === 'accepted') return { state: 'buddies' };
if (friendship.requestedBy === uid) throw new ApiError(403, 'You can\\'t accept your own request.', 'not_recipient');
...
```

**Target identifier is only nonempty** — `packages/contract/src/api-contract.ts:452-454`

The request schema does not constrain identifier syntax or exclude delimiter-bearing values.

```typescript
export const sendBuddyRequestInput = z.object({ uid: z.string().min(1) });
```

#### Reachability

A pending friendship for one colliding pair is loaded through the key for a different pair; the second pair's authenticated recipient passes the requestedBy check and commits status accepted without membership validation.

Preconditions:
- Real Firebase UIDs contain the necessary underscore pattern.
- A pending friendship document exists for the colliding pair.
- The attacker can authenticate as the alternate pair's recipient.

#### Severity

**Low** — The issue can corrupt social-graph state across colliding UID pairs, but it requires underscore-containing identifiers and a specific existing pending relationship.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Use a collision-resistant pair key such as length-prefixed encoding or a hash, validate identifier segments consistently, and require friendship.users to contain both the authenticated UID and requested target before every social mutation.

Tests:
- Pair keys are injective for identifiers containing underscores.
- Accept rejects a friendship whose users array does not contain both route target and authenticated uid.
- Existing accepted relationships still work.

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| Worker authentication, App Check, CORS, and privileged route gate | identity and privileged API authorization | Reported | Reviewed through source and deployment configuration; revoked-session and App Check findings reported. |
| Firestore rules and direct REST client ownership boundary | owner isolation and stored-data validation | Needs follow-up | Rules and canonical path helpers reviewed; remaining repository files are not fully covered. |
| Buddy search, requests, acceptance, and cross-user detail processing | cross-user authorization and data integrity | Reported | Malformed challenge and pair-key findings reported. |
| Account, catalog, injury, quota, and push stores | service-account operations and resource controls | Needs follow-up | Targeted review performed; full repository coverage remains partial. |
| Mobile and web authentication, Firestore transport, and client data paths | client trust boundary | Needs follow-up | Targeted review performed; remaining files require follow-up. |

## Open Questions And Follow Up

- Does the committed production APP_CHECK_MODE reflect the currently deployed Worker?
- Are Firebase revocation checks intentionally omitted for the full token lifetime or only as a temporary optimization?
- Only a conservative lower bound of 69 of 421 inventory files was fully reviewed by independent workers; the remainder was not claimed complete.
    - Follow-up prompt: Review deferred unit remaining-repository-review and close its stated proof gap. Paths: .. Surfaces: firestore-ownership, privileged-stores, mobile-client.
- The workflow is offline and does not inspect remote Worker or Firebase deployment state.
    - Follow-up prompt: Review deferred unit remote-deployment-verification and close its stated proof gap. Paths: apps/api/wrangler.toml. Surfaces: api-auth-boundary.

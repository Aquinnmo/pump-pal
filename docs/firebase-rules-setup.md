# Updating Firebase Firestore rules

The source of truth for Firestore security rules is
[`firestore.rules`](../firestore.rules). Firebase deploys that file to the
project you explicitly select; it does not deploy to every Firebase project
automatically.

## Prerequisites

- Firebase CLI available through this repository’s dependencies.
- Access to the Firebase project you intend to update.
- JDK 21 or newer for the local Firestore emulator tests.

Authenticate from the repository root:

```bash
bunx firebase login
bunx firebase projects:list
```

Use separate Firebase projects for preview and production. The project ID
must match the environment whose rules you are changing.

## 1. Edit the rules

Make the smallest possible change in [`firestore.rules`](../firestore.rules).
The current rules intentionally allow direct clients to access only
owner-safe data. Worker-only collections and unknown paths are denied by the
final catch-all rule.

Before changing a rule, check the related data and client behavior:

```bash
rg -n "match /|allow |firestore|collection\\(" firestore.rules apps/mobile packages tests
```

Every new `allow` should have a test for both the permitted case and the
corresponding denied case. Do not weaken rules to make a client or emulator
test pass.

## 2. Test locally

Run the repository’s Firestore rules test from the root:

```bash
bun run test:firestore-rules
```

This starts the local Firestore emulator, loads `firestore.rules`, runs
[`tests/firestore.rules.test.ts`](../tests/firestore.rules.test.ts), and stops
when the test completes. The test project is `timber-rules-test`; it is local
only and does not modify a real Firebase project.

If the emulator reports a Java error, check the version first:

```bash
java -version
```

The repository rollout requires JDK 21 or newer. Install or select that JDK,
then rerun the test.

## 3. Deploy to preview

First identify the preview project ID. Then deploy only Firestore rules from
the repository root:

```bash
bunx firebase deploy \\
  --only firestore:rules \\
  --project YOUR_PREVIEW_PROJECT_ID
```

Replace `YOUR_PREVIEW_PROJECT_ID`; do not paste a production ID into a preview
command. The command reads the rules path from [`firebase.json`](../firebase.json).

Verify the deployment in Firebase Console:

1. Open the preview project.
2. Go to **Firestore Database → Rules**.
3. Confirm the published timestamp and deployed source match the change.
4. Exercise the affected read/write flow with a preview client.
5. Check **Firestore Database → Usage** and the app logs for unexpected
   permission errors.

Deploying rules does not deploy indexes, Worker code, or mobile code. If an
index change is also required, review and deploy that separately.

## 4. Deploy to production

Only after preview tests pass, deploy the same working tree to production:

```bash
bunx firebase deploy \\
  --only firestore:rules \\
  --project YOUR_PRODUCTION_PROJECT_ID
```

Repeat the console verification against the production project. Test an
authenticated owner flow, an unauthenticated request, and a cross-account
request where applicable.

## Rollback

If the new rules cause an incident, redeploy the last known-good
`firestore.rules` file to the affected project:

```bash
bunx firebase deploy \\
  --only firestore:rules \\
  --project YOUR_PROJECT_ID
```

That command deploys whatever is currently in the working tree, so restore or
check out the reviewed previous rules file first. Confirm the rollback in the
Firebase Console, then preserve the failing rules version and emulator output
for investigation.

Do not roll back by opening broad access such as `allow read, write: if true`.
If a client is incompatible, update the client or add a narrowly scoped,
tested rule with an explicit removal plan.

## Quick checklist

- [ ] `firestore.rules` is the only intended rules change.
- [ ] Allowed and denied cases are covered by emulator tests.
- [ ] `bun run test:firestore-rules` passes on JDK 21+.
- [ ] The command includes the intended `--project` ID.
- [ ] Preview was deployed and manually verified first.
- [ ] Production was deployed with `--only firestore:rules`.
- [ ] Firebase Console shows the expected published version.


# Timber policy operations

Owner: **Montgomery Software Foundry Inc.** · **dev@adam-montgomery.ca**

Tracks [#89](https://github.com/Aquinnmo/pump-pal/issues/89) / `pump-pal-5bje.2`.
The public pages are in `policies/`; this document is operational guidance,
not part of the Pages artifact.

## Publish the static pages

1. Review the copy and confirm the mailbox is monitored and the 30-day deletion
   commitment can be met. Check the production provider settings against the
   inventory below before publishing.
2. After the workflow is on the repository's default branch, set repository
   **Settings → Pages → Source → GitHub Actions**. This repository has no
   existing Pages site. Do not enable publishing from the whole `docs/` folder.
3. Run **Publish Timber policies** manually against the reviewed revision.
   Its artifact contains only `docs/policies/` and requires no app build.
   If publishing from another branch, explicitly allow that branch in the
   `github-pages` environment's deployment protection settings.
4. Verify, signed out, that these pages return HTTP 200 and need no login:
   - `https://aquinnmo.github.io/pump-pal/privacy.html`
   - `https://aquinnmo.github.io/pump-pal/delete-account.html`
5. Verify the links under **About → Legal** on a fresh mobile development build, then use the
   URLs in the store privacy/deletion fields. If GitHub reports a different
   canonical origin, update `src/constants/policies.ts` in the mobile package
   before releasing it. Keep #89 open until live URLs and app links pass.

The workflow is manual only. Future changes require another reviewed dispatch.
No app/API build or deploy is part of this workflow. See [GitHub's Pages workflow
instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Data Safety inventory

Reviewed from source on September 29, 2026. **These are proposed answers, not
verified Play Console declarations or evidence from the production AAB.**
Reconcile the shipped SDKs and actual provider settings under
[#90](https://github.com/Aquinnmo/pump-pal/issues/90).

“Collected” includes transmitting data to SDK/provider servers. Local-only
drafts do not count until sent off the device. “Optional” requires a real choice
for every user; a field being nullable is not enough. Provider transfers may
qualify for Google's service-provider exception to “sharing”; confirm the
contracts/settings before selecting “not shared.” Social/user-directed
transfers need their own assessment. See the [Data Safety form guidance](https://support.google.com/googleplay/android-developer/answer/10787469).

| Data / proposed Play category | Collection and choice | Purpose / recipients | Retention and deletion | Source evidence |
| --- | --- | --- | --- | --- |
| UID, username/profile name — Personal info: User IDs, Name | Collected; required account identity | Account management, functionality; Firebase; Cloudflare for privileged requests; username exposed to social participants when enabled | Account lifetime; delete Auth, profile and username reservation; provider retention below | `apps/mobile/src/context/auth-context.tsx`, `apps/api/src/store/profile.ts`, `docs/data-model/users.md` |
| Email, phone — Personal info: Email address, Phone number | Collected depending on sign-in method; email/phone credentials required for the selected method, other methods optional | Authentication/account management and abuse prevention; Firebase, Google/Apple when their sign-in method is used | Firebase Auth deletion; support messages separately below | `apps/mobile/app/(auth)/phone-auth.tsx`, `apps/mobile/src/lib/google-sign-in.ts`, `apps/mobile/src/lib/apple-sign-in.ts`, `apps/mobile/src/config/firebase.ts` |
| Workouts, sets, weights, reps, timing, splits, push-up progress — Health and fitness: Fitness info | Collected when logged/synced; primary workout data supports core functionality; extra records/notes chosen by user | Functionality and training insights; Firebase; Cloudflare for privileged operations; relevant summaries to OpenAI only with AI opt-in | Edit/delete records or delete account; native cache/draft limits below | `docs/data-model/workouts.md`, `docs/data-model/pushup-challenge.md`, `apps/mobile/src/types/workout.ts`, `apps/mobile/src/lib/workout-suggestions.ts` |
| Injury body parts, severity, dates, avoid-list, notes — Health and fitness: Health info | Collected only when entered; optional | Functionality/personalization; Firebase; Cloudflare for history operations; active details and notes to OpenAI with AI opt-in | Remove injury records or account; earlier AI requests subject to provider retention | `docs/data-model/users.md`, `apps/mobile/src/types/user.ts`, `apps/mobile/src/lib/workout-suggestions.ts` |
| Buddies, requests, Chop timestamps, blocks, user reports (reporter, reported account, reason, note), terms acceptance, trained-today/streak indicators — App activity: Other actions; Fitness info for training indicators | Collected during social use; social can be disabled, existing relationships remain stored | Functionality; Firebase, Cloudflare; usernames/activity indicators visible to other users as the feature allows | Delete friendships on account deletion; disabling social hides participation without deleting relationships | `docs/data-model/buddies.md`, `apps/api/src/store/buddies.ts` |
| Submitted exercise names/custom split text/notes — App activity: Other user-generated content (also fitness/health where applicable) | Collected if submitted/synced; optional; custom split text included in relevant AI operations | Functionality/catalog maintenance; Firebase, Cloudflare; OpenAI for opted-in split/workout context; approved exercise names enter shared catalog | Delete personal records; manually remove `createdBy` attribution from retained catalog entries | `apps/api/src/store/catalog.ts`, `apps/mobile/src/lib/workout-suggestions.ts`, `apps/api/src/ai/prompts.ts` |
| Expo push tokens, installation/device identifiers — Device or other IDs | Push token optional with notification permission; automatic SDK identifiers required where collection is enabled | Functionality, fraud prevention/security; Firebase/App Check and attestation providers; Cloudflare, Expo, Apple/Google push delivery | Delete private notification document and account caches; SDK identifiers follow provider rules | `apps/mobile/src/hooks/use-push-token.native.ts`, `apps/api/src/store/push.ts`, `apps/mobile/src/config/firebase.ts` |
| Crash traces, app/device version, identifiers — App info and performance: Crash logs, Diagnostics; Device or other IDs | Native Crashlytics collection enabled automatically; no user opt-out in current app | Analytics for reliability, security; Firebase Crashlytics, Cloudflare service logs | Provider retention; do not promise account deletion erases unlinked crash logs immediately | `apps/mobile/firebase.json`, `apps/mobile/app.json`, `apps/mobile/package.json`, `apps/api/wrangler.toml`, `apps/api/src/worker.ts` |
| IP addresses, user-agent and attestation information — Security/network information; check SDK guidance for Device IDs/Approximate location classification | Provider-side collection during authentication/network use; not a location permission or proven location feature | Authentication, functionality and abuse prevention; Firebase, Cloudflare, attestation providers | Provider security/log retention; confirm deployed configuration | `apps/mobile/src/config/firebase.ts`, `apps/mobile/src/config/firebase.web.ts`, [Firebase privacy](https://firebase.google.com/support/privacy) |
| Support/deletion emails — Messages: Emails, Personal info as included | Optional user email; outside direct app transmission, assess whether relevant to the form | Developer communications/deletion handling; company mailbox and its email provider | Until resolved; remove personal correspondence afterward unless legally required | Public deletion page and the manual process below |

AI is default-off and enforced both at the client request seam and Worker
boundary (`apps/mobile/src/lib/ai-client.ts`, `apps/api/src/worker.ts`,
`apps/api/src/store/quota.ts`). The declared production configuration selects
OpenAI (`apps/api/wrangler.toml`); source also supports Google, so changing the
live provider requires updating the policy and app disclosure. AI payloads are
training context, not the entire database; do not assert that all free text is
anonymous or harmless.

Proposed overall answers: data **is collected**, no ads or sale of personal
data, HTTPS in transit (not end-to-end encryption), account creation and a
deletion request mechanism. Final sharing, purpose and required/optional
checkboxes must reflect the combined behavior of all shipped versions/SDKs.
Do not claim an independent security review or Families compliance. No active
Apple Health/Health Connect ingestion was found; the integration issues are
planned work, not a reason to declare collection that does not occur.

GitHub Pages visits may log visitor IP addresses for security; the public
policy discloses that separately. The site itself has no JavaScript, forms or
analytics. A Firebase `measurementId` config value alone does not establish
Google Analytics collection; no Analytics initialization was found.

## Retention evidence and limits

- Account cloud records have no source-defined automatic expiry; records remain
  until removed or account deletion. Drafts are local; native SQLite rows,
  AsyncStorage snapshots and widget/Live Activity caches may survive an email
  request because the server cannot remotely wipe every device.
- [Firebase](https://firebase.google.com/support/privacy) describes Auth
  deletion from live/backups within 180 days, Auth IP logs for a few weeks,
  and Crashlytics reports/identifiers for 90 days before starting removal.
  App Check attestation is passed to the attestation provider; do not claim all
  SDK metadata has a 30-day limit.
- [OpenAI](https://developers.openai.com/api/docs/guides/your-data) describes
  default abuse logs up to 30 days, subject to exceptions, plus endpoint-specific
  application state. The SDK selects the Responses API and no explicit `store`
  override is set in this app. Do not claim zero retention or no stored prompts.
  Verify the account's data-sharing controls before promising exclusion from
  training; API defaults are not proof of the account's current settings.
- Cloudflare observability is enabled in source; actual log retention,
  Firestore backup/PITR settings, OpenAI controls and shipped native SDK behavior
  need provider/production verification. No invented universal deletion period
  applies to these systems.

## Handle an email deletion request

This is a developer-operated procedure, not an automated deletion service.
Never execute it for an unverified request. Do not put customer identifiers or
email content in public GitHub issues or commit them to this repository.

1. Acknowledge the request through **dev@adam-montgomery.ca**. Use the account
   email/username to find the Firebase Auth UID. Confirm ownership through the
   account's linked email; for phone-only/Apple-relay/inaccessible accounts,
   arrange confirmation through an existing verified account channel. Never
   request passwords or sign-in codes. Do not delete based only on a username.
   Start the 30-day completion window after ownership is confirmed.
2. In the correct Firebase project (`pumppal-c9199`), record the UID and current
   `usernameLower` privately before removing the profile. Confirm the project
   and target UID twice; use Firebase Console or an authorized admin tool, not
   a customer password or a developer's client bearer token.
3. Disable the verified Auth account to prevent new writes while cleanup runs.
   Revoke existing refresh sessions with authorized admin tooling; existing
   short-lived ID tokens can still be valid. Allow issued sessions to expire
   and recheck for new records before closing the request. Disabled alone is
   not deletion; retain the UID privately so failures can be retried.
4. Delete all `blocks` where `blocker == uid` or `blocked == uid`. Keep `reports`
   the user filed or that name them; they are retained for moderation. Then delete all canonical `workouts` where `userId == uid`, legacy
   `users/{uid}/workouts`, `users/{uid}/injuries`, `users/{uid}/private`
   (including AI usage and notifications), push-up challenge data, and any other
   documents under `users/{uid}`. Query `friendships` where `users` contains UID
   and delete the whole relationship documents. Remove the matching
   `usernames/{usernameLower}` reservation. Paginate/inspect all results; deleting
   a parent through a generic API does not necessarily delete subcollections.
5. Query `exercises` where `createdBy == uid`: delete pending submissions;
   remove the `createdBy` field from approved shared entries. Inspect retained
   names for personal details and remove/redact them too. Remove the profile
   only after child/related cleanup succeeds, then delete the Firebase Auth
   user. If cleanup fails, retry it; do not mark the request complete.
6. Re-query the paths and relationship/catalog filters and confirm the Auth UID
   no longer exists. Initiate supported provider deletion requests for
   identifiable retained data; explain security/backup retention limits rather
   than claiming every crash report or old AI request has vanished.
7. Email completion within 30 days after verification. Explain that local copies
   on their other devices need local data removal/uninstallation; uninstalling
   alone never initiates cloud account deletion. Remove personal request
   correspondence from the mailbox/trash after resolution unless a legal
   obligation requires retaining it; explain any such exception to the user.

The in-app flow still ignores the server's `partial: true`, and the fixed active
workout/push-token caches need cleanup under [#88](https://github.com/Aquinnmo/pump-pal/issues/88).
The existing server cleanup also does not remove catalog `createdBy` fields.
These are known limits, not fixes made by this policy change. Keep #88 open;
use the manual path to verify email-request cleanup. Social terms,
reporting and blocking are [#87](https://github.com/Aquinnmo/pump-pal/issues/87);
see the next section.

## Moderate user reports

Tracks [#87](https://github.com/Aquinnmo/pump-pal/issues/87). Users file reports
in-app (a "more" button beside any username on the Social tab). Each becomes a
`reports/{reporter_target_day}` document with status `open`; see
[buddies.md](./data-model/buddies.md#reports--reportsreporter_target_day). The
public rules are `docs/policies/terms.html`.

Review at least weekly, and at once for anything threatening. Use a service
account with Firestore write access. Never a customer token, and keep the JSON
out of the repo (`db-agent-write-perms.json` is already gitignored).

```bash
bun run moderation:review -- --dry-run     # list open reports, writes nothing
bun run moderation:review -- --apply       # walk them and write your decisions
```

For each report choose **dismiss** (no violation), **action**, or **skip**.
Actioning marks it `actioned` and can also suspend the reported user by setting
`users/{uid}.socialSuspended = true`. A suspended account disappears from
search and buddy lists, its buddy actions return 403 `social_suspended`, and it
is not told why. Its workouts and sign-in are untouched. To lift a suspension,
remove the field in Firebase Console; the script does not unsuspend.

For a serious violation, also consider deleting the account with the manual
procedure above. Do not put reporter or reported identifiers in public GitHub
issues. Reports outlive the reporter's account deletion on purpose, and the
privacy policy says so. Bumping `SOCIAL_TERMS_VERSION` requires a reviewed
`terms.html` change first, and republishing the Pages site.

Publishing `terms.html`: it ships with the other pages through the **Publish
Timber policies** workflow above. Verify
`https://aquinnmo.github.io/pump-pal/terms.html` returns HTTP 200 signed out
before releasing an app version that links to it.

## Store disclosure copy

> Timber logs your strength workouts and shows training insights. Optional AI
> features send training summaries and injury details, including notes, to
> OpenAI. AI is off by default and can be turned off in About → App.
>
> Timber is not a medical device and does not provide medical advice, diagnosis,
> or treatment. Consult a healthcare professional for medical advice, diagnosis,
> or treatment.

Privacy URL: `https://aquinnmo.github.io/pump-pal/privacy.html`

Account deletion URL: `https://aquinnmo.github.io/pump-pal/delete-account.html`

Do not submit the URLs until public access is verified. The activity/fitness
declaration and final store wording must be checked under #90 using the
[Health Content and Services requirements](https://support.google.com/googleplay/android-developer/answer/16679511).

## Production AAB and Play Console (#90)

Tracks [#90](https://github.com/Aquinnmo/pump-pal/issues/90) /
`pump-pal-5bje.4.1`, `5.1`. Phone release only; the Wear OS release stays out
of scope. Agents cannot build the production bundle (`CLAUDE.md` forbids
release builds), so the checks below are run by the user against the real AAB.

### Inspect the production AAB

1. `eas build -p android --profile production`, then download the `.aab`.
2. `bundletool dump manifest --bundle=<file>.aab` for the merged manifest.
   Narrow with `--xpath`, for example
   `--xpath /manifest/uses-sdk/@android:targetSdkVersion` and
   `--xpath /manifest/uses-permission/@android:name`.
3. List every component with `android:exported="true"` and match it against the
   retained table below. Anything not listed is a finding.
4. After upload, read the SDK list under Play Console → **App bundle explorer**
   and resolve any pre-launch or SDK warnings.

`targetSdkVersion` is currently 36, from Expo 57 defaults; record the value
`bundletool` reports rather than assuming it.

### Removed from the manifest

Source: `android.blockedPermissions` in `apps/mobile/app.json` (emits
`tools:node="remove"`) and `apps/mobile/plugins/with-android-release-manifest.js`.
Guarded by `apps/mobile/android-release-manifest.test.js`.

| Item | Origin | Why unused |
|---|---|---|
| `SYSTEM_ALERT_WINDOW` | Expo prebuild template | No overlay UI |
| `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` | Expo prebuild template | CSV export uses the cache dir and `expo-sharing` |
| `SCHEDULE_EXACT_ALARM` | `@notifee/react-native` | Streak reminders use inexact triggers (`src/lib/streak-notification.native.ts`) |
| `FOREGROUND_SERVICE` | `@notifee/react-native` | Nothing calls `asForegroundService`; workout notification is plain ongoing |
| service `app.notifee.core.ForegroundService` | `@notifee/react-native` | Same; would need a Play foreground-service-type declaration |
| receiver `app.notifee.core.AlarmPermissionBroadcastReceiver` (exported) | `@notifee/react-native` | Only reacts to exact-alarm permission changes |

Undo the notifee removals only if the app adopts notifee foreground services or
exact alarms, and then add the matching Play declaration first.

### Retained items

| Item | Justification |
|---|---|
| `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, notifee reboot receivers | Re-arm streak reminders after a reboot |
| `com.reactnativeandroidwidget.RNWidgetImageProvider` (`exported=true`) | Read-only; path-traversal checked; the launcher process reads widget images |
| `.widget.UpNext` receiver | `exported=false` |
| `com.aquinnmo.timber.wearsync.WearMessageService` (`exported=true`) | Phone side of the watch bridge, invoked by Google Play services Wearable |
| `POST_NOTIFICATIONS`, `POST_PROMOTED_NOTIFICATIONS`, launcher badge permissions, `c2dm.permission.RECEIVE`, install referrer | Normal or SDK permissions; no Play declaration |

Confirm these are **absent** from the production AAB (debug/dev-client only):

- expo-dev-client `DevLauncherActivity` and its auth activity
- androidx compose `PreviewActivity`
- `com.google.mlkit.vision.DEPENDENCIES` meta-data
- the `timber_dev` package name

### Play Console checklist

Capture a screenshot of each final value for `pump-pal-5bje.5.2`.

| Item | Value to set | Evidence |
|---|---|---|
| Data Safety | Answers from [Data Safety inventory](#data-safety-inventory) | Submitted form summary |
| Health apps declaration | Activity and Fitness | Declaration page |
| Privacy policy URL | `https://aquinnmo.github.io/pump-pal/privacy.html` | Signed-out HTTP 200 plus field |
| Account deletion URL | `https://aquinnmo.github.io/pump-pal/delete-account.html` | Signed-out HTTP 200 plus field |
| Target audience | Adults only; not Families | Audience page |
| Content rating | Questionnaire incl. user interaction/social (buddies, searchable usernames) | Rating certificate |
| Ads | None | App content page |
| SDK and pre-launch warnings | All resolved | App bundle explorer, pre-launch report |
| App access | Reviewer account with credentials and steps | App access page |
| Store listing | Description below, incl. disclaimer | Listing preview |

### Store description disclaimer

Include in the full description, alongside the [store disclosure copy](#store-disclosure-copy):

> Timber is a workout log and training aid. It is not a medical device and does
> not provide medical advice. Consult a healthcare professional before starting
> or changing an exercise program, especially if you have an injury or health
> condition.

Bead `pump-pal-5bje.5.2` (user) closes the loop with the AAB manifest output
and Console screenshots.

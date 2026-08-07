# Dev Build Guide (Android)

Since the active-workout notification uses `@notifee/react-native` (a native
module), **Expo Go can't run this app anymore** — you need a _development build_:
your own compiled binary that behaves exactly like Expo Go (Metro, QR, hot
reload) but includes your native modules.

This guide is Android-only (the notification is Android-only).

## Separate app from your "Timber" preview

The dev build installs as a **separate app** so it doesn't clobber the
"Timber" preview/production build on your phone. This is driven by the
`APP_VARIANT=development` env var (see `app.config.js` + `eas.json`):

| Variant                   | App name       | Android package           |
| ------------------------- | -------------- | ------------------------- |
| dev build (`development`) | **Timber Dev** | `com.aquinnmo.timber_dev` |
| preview / production      | Timber         | `com.aquinnmo.timber`     |

Different package = both apps coexist on the same phone. The dev one shows as
**"Timber Dev"** on your home screen.

> Android package IDs cannot contain hyphens, so development uses an underscore.
> The corresponding iOS development bundle ID is `com.aquinnmo.timber-dev`.

> EAS sets `APP_VARIANT` automatically for the `development` profile. For a
> **local** `expo run:android` you must set it yourself (commands below) — miss
> it and the local build takes the base package and overwrites your preview.

---

## One-time setup

Pick **one** of the two build paths.

### Path A — Local build (`expo run:android`)

Fastest iteration, but needs the Android toolchain installed on your machine:

- **Android Studio** with the Android SDK + an emulator, **or** a physical
  Android phone with USB debugging enabled.
- **Java JDK 17** (Android Studio bundles one).

Then, from the repo root (**set `APP_VARIANT` so it installs as "Timber Dev"**):

```powershell
# Windows PowerShell
$env:APP_VARIANT="development"; npx expo run:android
```

```bash
# macOS / Linux / Git Bash
APP_VARIANT=development npx expo run:android
```

First run generates the native `android/` project (CNG prebuild), compiles the
dev client, installs it on the connected device/emulator, and starts Metro.
Takes a few minutes the first time.

> Note: `android/` is generated and **not committed** (this is a managed / CNG
> project). Don't hand-edit it — change `app.json` and let prebuild regenerate.

### Path B — Cloud build (EAS)

No local Android toolchain needed; builds on Expo's servers. Uses the
`development` profile already in `eas.json`.

```bash
npm i -g eas-cli          # once
eas login                 # once
eas build --profile development --platform android
```

When it finishes, EAS gives you a URL / QR — install the `.apk` on your phone.
You only rebuild when **native** deps change (see below).

**Git clone error?** If the build fails with
`git upload-pack ... active core.hooksPath found ... disallowed by default`,
that's git's clone-protection tripping on this repo's beads hooks
(`.beads/hooks`) — not a code problem. Set the escape-hatch env var and rebuild:

```powershell
# Windows PowerShell
$env:GIT_CLONE_PROTECTION_ACTIVE="false"; eas build --profile development --platform android
```

```bash
# macOS / Linux / Git Bash
GIT_CLONE_PROTECTION_ACTIVE=false eas build --profile development --platform android
```

> **Cloud builds ship only _committed_ code.** EAS clones your git HEAD — any
> uncommitted working changes are **not** uploaded. To test in-progress work
> (like the notification feature) via a cloud build, commit it first. To build
> straight from your working directory with no commit, use the local
> `expo run:android` path instead.

---

## Daily loop (after the dev build is installed)

The dev build is installed once; day-to-day you just run Metro and edit JS:

```bash
npx expo start --dev-client
```

- Open the installed **dev-build app** (not Expo Go) and it connects to Metro.
- Edit JS/TS → hot reload, same as Expo Go.
- Shake the device (or `m` in the terminal) for the dev menu.

**You do NOT rebuild for JS changes.** Rebuild (repeat one-time setup) only
when you:

- add/remove/upgrade a **native** module (any `expo-*` with native code, or a
  library like Notifee), or
- change native config in `app.json` (permissions, plugins, package name).

---

## Testing the workout notification

1. Start Metro: `npx expo start --dev-client`; open the dev-build app.
2. Grant the notification permission when prompted (Android 13+).
3. **Start a workout** → a silent ongoing notification appears with a
   **live-ticking elapsed timer**.
4. **Log a set** (check it off) → the body updates (reps · volume · current
   exercise), **no sound**; timer keeps ticking.
5. **Background the app** (home button) → pull down the shade; the timer
   **keeps ticking** (it's OS-driven, not JS).
6. **Finish** or **Discard** the workout → notification disappears.
7. **Force-quit** mid-workout (swipe app away) → notification persists; reopen
   the app and land on Home → it gets cleared (stale-doc reconcile).
8. **Deny** the permission (Settings → app → Notifications off) → app works
   normally, just no notification. No crash.

> **Channel importance is locked after first creation.** If an existing
> install already created the `active-workout` channel before an
> importance/behavior change, Android won't pick up the new value —
> uninstall/reinstall to get a clean channel.

### Testing the Android 16 Live Update (Pixel, API 36+)

9. **Start a workout with three exercises that have different set counts**
   (e.g. 2 / 4 / 3 sets) → the compact status-bar chip reads `0/9 · elapsed
   time`; Android owns the live timer. Pulling it down shows the unchanged
   progress bar with **three grey ovals**, widths proportional to each
   exercise's set count, and one **Complete set** control beneath it.
   Start a workout with no nonblank exercise rows as a separate boundary case:
   it has no current-set detail and **no controls**.
10. **Check the AOD/lock screen** → the header reads `Logging Push Workout`
    (without doubling a name that already ends in “Workout”), and the detail
    reads the current set, for example `Bench Press · Set 1 · 10 reps · 135 lbs` or
    `Plank · Set 1 · 0:45`. Bodyweight, zero weight, and zero/irrelevant
    duration are omitted rather than shown as placeholders.
11. **Tap Complete set once** → the chip becomes `1/9 · elapsed time`; the
    control row becomes **Complete set** and **Undo set**. The segmented bar
    must look and behave exactly as it did before this feature: the exercise
    oval flips fully red on its first completed set, not partially.
12. **Tap Undo set** → only the most recently completed set clears, the compact
    count returns, and the previous current-set detail/control state returns.
13. **Complete every sequential current set** → after the final one, no current
    detail row appears and the controls become **Finish workout** and **Undo
    set**. Tap **Finish workout** → completed sets persist, the native Live
    Update and Notifee notification are both dismissed, and Wear returns idle.
14. **Foreground, background, and killed delivery** — repeat Complete, Undo,
    and final Finish with the workout screen open, the app backgrounded, and
    the app swiped away. Each action must change exactly one sequential set;
    a malformed/stale notification action must not change the workout.
15. **Keep logging sets across the 800ms autosave refreshes** → the
    chronometer keeps ticking (OS-driven) with **no repeated sound** — only
    the initial post should make noise.
16. **Permission denial** — disable notification permission in Settings → the
    workout still logs normally and action taps are unavailable; no crash.
17. **Promotion check** — confirm the OS actually granted promotion:
    ```bash
    adb shell dumpsys notification --noredact | grep -i PROMOTED_ONGOING
    ```
18. **Fallback path** — disable promoted notifications for Timber (system
    Settings → Apps → Timber → Notifications → promoted notifications off),
    or test on a pre-Android-16 device → the Notifee notification uses the
    same `Logging … Workout` title and current-set detail, with its existing
    chronometer, but has **no action controls**. Confirm no crash and no
    duplicate notification. This is the subtlest part of the feature: two
    surfaces (the native `LiveUpdateNotification` module and Notifee) post this
    notification, and `utils/workout-notification.android.ts` keeps them
    mutually exclusive — a regression shows up as two notifications instead
    of one, not as a crash.

**Check on-device — neither of these can be verified from source:**

- **Small icon legibility at 24dp.** `ic_stat_timber` is trimmed full-bleed
  from a non-square 672×612 bounding box, so it may read oversized or
  letterboxed next to the system's status-bar icons. See the troubleshooting
  table below if it looks wrong.
- **Does the Live Update survive backgrounding / force-quit?** Step 7 above
  confirmed the *Notifee* notification survives a force-quit. Whether a
  *promoted* ongoing notification keeps its promotion once the app process
  isn't running is unverified — check it. If it demotes, the escalation is
  `notifee.registerForegroundService`; don't add that preemptively, only if
  this actually reproduces.

---

## Troubleshooting

| Symptom                                            | Fix                                                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "This project uses a native module not in Expo Go" | You opened Expo Go. Open the **dev-build** app instead.                                                                                                 |
| No notification appears                            | Permission denied → enable in system Settings → app → Notifications.                                                                                    |
| Small icon looks oversized or letterboxed          | Add padding around the glyph in `scripts/generate-ic-stat-timber.js` and regenerate (`node scripts/generate-ic-stat-timber.js`) — don't hand-edit the PNGs. |
| Timer not ticking                                  | Confirm you're on a real dev build, not Expo Go; the chronometer needs the native Notifee module.                                                       |
| Changes not showing                                | JS change → save should hot-reload. Native/`app.json` change → rebuild (one-time setup again).                                                          |
| Metro connects but app is old                      | Rebuild — you likely changed a native dep without recompiling.                                                                                          |

---

## Which command when — cheat sheet

| Situation                                        | Command                                                |
| ------------------------------------------------ | ------------------------------------------------------ |
| First build / after native change (local)        | `$env:APP_VARIANT="development"; npx expo run:android` |
| First build / after native change (cloud)        | `eas build --profile development --platform android`   |
| Everyday JS work                                 | `npx expo start --dev-client`                          |
| Preview (release) build onto the plugged-in phone | `npm run install:android`                             |
| Web / non-native work (Notifee is a no-op there) | `npx expo start` (Expo Go still fine for web)          |

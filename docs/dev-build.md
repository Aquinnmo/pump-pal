# Dev Build Guide (Android)

Since the active-workout notification uses `@notifee/react-native` (a native
module), **Expo Go can't run this app anymore** — you need a *development build*:
your own compiled binary that behaves exactly like Expo Go (Metro, QR, hot
reload) but includes your native modules.

This guide is Android-only (the notification is Android-only).

## Separate app from your "Timber" preview

The dev build installs as a **separate app** so it doesn't clobber the
"Timber" preview/production build on your phone. This is driven by the
`APP_VARIANT=development` env var (see `app.config.js` + `eas.json`):

| Variant | App name | Android package |
|---|---|---|
| dev build (`development`) | **Timber Dev** | `com.aquinnmo.timber.dev` |
| preview / production | Timber | `com.aquinnmo.timber` |

Different package = both apps coexist on the same phone. The dev one shows as
**"Timber Dev"** on your home screen.

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

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "This project uses a native module not in Expo Go" | You opened Expo Go. Open the **dev-build** app instead. |
| No notification appears | Permission denied → enable in system Settings → app → Notifications. |
| Shade icon is a white square | Expected fallback (no small icon shipped). Add a white-transparent `ic_stat_*` drawable and set `smallIcon` in `utils/workout-notification.android.ts`. |
| Timer not ticking | Confirm you're on a real dev build, not Expo Go; the chronometer needs the native Notifee module. |
| Changes not showing | JS change → save should hot-reload. Native/`app.json` change → rebuild (one-time setup again). |
| Metro connects but app is old | Rebuild — you likely changed a native dep without recompiling. |

---

## Which command when — cheat sheet

| Situation | Command |
|---|---|
| First build / after native change (local) | `$env:APP_VARIANT="development"; npx expo run:android` |
| First build / after native change (cloud) | `eas build --profile development --platform android` |
| Everyday JS work | `npx expo start --dev-client` |
| Web / non-native work (Notifee is a no-op there) | `npx expo start` (Expo Go still fine for web) |

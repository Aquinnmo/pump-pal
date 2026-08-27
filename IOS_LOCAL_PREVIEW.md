# iOS local preview

Build and install Timber directly from this checkout on a connected iPhone. This is a local Xcode build, not an EAS Preview build.

## What you need

- A Mac, an iPhone, and a USB connection (or network pairing in Xcode).
- [Xcode](https://developer.apple.com/xcode/) from the App Store. Open it once after installation to finish its setup and accept its license.
- Node.js and Bun. Xcode's React Native build phase invokes `node`, while this repository uses Bun for dependencies and scripts.

  ```bash
  brew install node bun
  ```

- Access to the Apple developer team that can sign `com.aquinnmo.timber` and its `group.com.aquinnmo.timber.liveactivity` App Group. A different personal team cannot sign the default configuration. The project includes a Live Activity extension and App Group entitlement, so its required signing capabilities must be available to that team. Ask a project administrator for a separately configured personal build if you do not have that access.

  Before the first iOS prebuild, a project administrator must provide that team's 10-character ID. It can be added to `apps/mobile/app.json`:

  ```json
  {
    "expo": {
      "ios": {
        "appleTeamId": "YOUR_TEAM_ID"
      }
    }
  }
  ```

  For a local-only override, set `TIMBER_IOS_TEAM_ID` to the same ID when invoking Expo. The dynamic app config validates this value and forwards it to `@bacons/apple-targets`; it has no default and must never be guessed. Do not use an Apple Account email address or the `YOUR_TEAM_ID` placeholder.

  In Xcode, find it under **Signing & Capabilities → Team** after signing in. Do not guess this value or use an Apple Account email address.

## First install

1. In Xcode, sign in with the Apple Account that belongs to the signing team. Connect and unlock the iPhone, then trust the Mac if prompted.
2. Create the local mobile configuration and fill in every required `EXPO_PUBLIC_*` value. These are client-visible identifiers, not secrets.

   ```bash
   cp apps/mobile/.env.example.eas apps/mobile/.env
   ```

   `EXPO_PUBLIC_API_BASE_URL` is required for a native build. The iOS Google OAuth client must match the bundle identifier being built; leave it unset for a personal build where Google sign-in is unavailable.

3. Install dependencies and build to the connected device from the repository root:

   ```bash
   bun install
   bunx expo run:ios --device --configuration Release
   ```

   Select the connected iPhone if Expo asks. The first run generates the native iOS project, builds it with Xcode, and installs the app.

## Rebuilds

For JavaScript or TypeScript-only changes, start Metro and open the installed app instead of recompiling:

```bash
bun start
```

For native dependency, app-config, entitlement, or extension changes, rerun the build command:

```bash
bunx expo run:ios --device --configuration Release
```

`bun run install:apple` rebuilds the current checkout without changing branches or
pulling. For a separate iOS development install, use `bun run dev:apple`; it sets
`APP_VARIANT=development` and uses the development bundle identifier so it can
coexist with the release-shaped app.

## Live Activity verification

Live Activities require iOS 17 or later and a physical iPhone with Dynamic Island
for the Island-specific surfaces. The extension and host app must be signed by a
team that owns `group.com.aquinnmo.timber.liveactivity`; a simulator or unsigned
target cannot verify App Group action delivery.

Run this checklist after a native rebuild. It is intentionally a device check —
there is no iOS notification fallback when Activities are disabled or unsupported.

1. Start a workout with three exercises containing different set counts (for
   example 2 / 4 / 3). Confirm the Lock Screen/banner shows the workout title,
   current-set detail, elapsed timer, `0/9`, and three pending segments whose
   widths follow the set counts. Confirm Dynamic Island expanded, compact, and
   minimal views remain readable; controls appear only in expanded/Lock Screen.
2. Tap **Complete set** once from the phone and once from the Live Activity. The
   host session must confirm the action before the count, detail, segments, and
   action labels redraw. Tap **Undo set** and confirm only the latest completed
   set is cleared. Complete every set and confirm controls become **Finish
   workout** and **Undo set**; Finish writes the workout and then dismisses the
   Activity.
3. Discard a workout from the phone and confirm the Activity and pending action
   state disappear. Start a different workout immediately and confirm it never
   inherits the previous title, count, segments, or actions. Trigger rapid taps
   and verify stale `workoutId`/expected-count actions are ignored and duplicate
   activities are not created.
4. Repeat Complete, Undo, Finish, and Discard with the app foregrounded,
   backgrounded but alive, and force-quit — these are two different cases with
   two different expected outcomes:
   - **Backgrounded but alive** (not swiped away): tap a Live Activity action.
     iOS must background-launch the app to run the intent; a live JS runtime
     receives it, applies the mutation, and the Activity redraws with the new
     count, detail, segments, and action labels — the same result as a
     foregrounded tap.
   - **Force-quit**: swipe the app away, then tap a Live Activity action. The
     visual state must not advance or dismiss Finish; the Activity stays frozen.
     On relaunch, the in-memory session is gone by design, so the
     queued action is rejected and cleared and the stale Activity is
     reconciled; the app must not pretend to resume that workout or claim that
     its data was saved.
5. Test an empty workout (no nonblank exercise rows), a duration set such as
   `Plank · 0:45`, and a very long workout title/detail. Empty workouts show no
   controls; duration copy omits irrelevant weight/reps; long text truncates
   without displacing the count or timer.
6. Turn off Live Activities for Timber in iOS Settings (or test below iOS 17).
   Starting/logging a workout must continue normally with no crash and no
   alternate iOS notification. Re-enable Activities and repeat step 1.

## Signing issues

- If Xcode reports a missing provisioning profile or capability, confirm the selected team owns the bundle ID and has the required App Group enabled.
- A free Apple Account can install simple Xcode projects on a personal device, but it cannot sign another team's identifier or capabilities. Ask a project administrator for team access or a separately configured personal build.

See Expo's [local iOS build guide](https://docs.expo.dev/guides/local-app-development/) and Apple's [signing-capability guide](https://developer.apple.com/documentation/xcode/adding-capabilities-to-your-app) for Xcode-specific troubleshooting. For more help go to the [Expo local iOS development page](https://docs.expo.dev/guides/local-app-development/).

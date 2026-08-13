# Timber for Wear OS

Companion watch app. It holds no credentials and never talks to Firestore: the phone
app is the source of truth, and the two exchange state over the Google Wearable Data
Layer. The watch shows what the phone last pushed and asks the phone to make changes.

- Idle: one button that starts (or resumes) whatever the phone's Up Next card points at.
- During a workout: the next incomplete set, a Complete set button, a small Undo last
  set button, and the rotary crown/bezel to adjust reps and weight — no keyboard.
- When every set is done: a Finish workout button.

Built and installed from Android Studio. It is deliberately **not** part of the Expo
prebuild or EAS build — this directory is a standalone Gradle project.

## Protocol

| Direction | Channel | Path | Payload |
| --- | --- | --- | --- |
| phone → watch | DataClient | `/timber/state` | `WearState` JSON in DataMap key `json` |
| watch → phone | MessageClient | `/timber/action` | `startWorkout` / `completeSet` / `uncompleteSet` / `finishWorkout` JSON |

Phone side: [`utils/wear-state.ts`](../utils/wear-state.ts) (shape + rules),
[`modules/wear-sync/`](../modules/wear-sync) (native bridge).
Watch side: [`Protocol.kt`](app/src/main/java/com/aquinnmo/timber/wear/Protocol.kt).

The watch never advances on its own. After sending an action it waits for the phone's
next state push, which serves as the acknowledgement — so the two can never disagree
about what was actually logged.

## Setup

**1. Signing key.** The Data Layer only connects two apps that share a package name
*and* a signing key. The watch build must therefore use the same keystore EAS uses for
the phone app, or the two will simply never see each other — with no error message.

```bash
eas credentials -p android      # pick the profile whose applicationId you're targeting
                                # download the keystore
```

Put it in `wear/keystore/` and copy `keystore.properties.example` to
`keystore.properties`, filling in the passwords. Both are gitignored.

**2. Pick the matching flavor.** `app.config.js` renames the dev build, so there are
two:

| Flavor | applicationId | Pairs with |
| --- | --- | --- |
| `prod` | `com.aquinnmo.timber` | production / preview builds |
| `dev` | `com.aquinnmo.timber_dev` | `APP_VARIANT=development` builds |

**3. Build.** Open this directory (not the repo root) in Android Studio, select the
build variant matching the phone build you have installed, and run it on a paired
watch or a Wear emulator paired to the phone.

## Checking it works

```bash
adb -s <watch-serial> logcat | grep -i wearable   # watch side
adb -s <phone-serial> logcat | grep WearSync      # phone side
```

If the watch shows "Open Timber on your phone" forever, the two apps are not paired at
the Data Layer level — almost always a package name or signing key mismatch, not a
pairing problem.

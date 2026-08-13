# Wear OS: setup and release checklist

Everything you have to do to get the watch app talking to the phone app the first
time, then the short loop you repeat for every change after that.

Background on how the two halves talk: [apps/wear/README.md](../apps/wear/README.md).

---

## The one rule that breaks everything

The Wearable Data Layer connects two apps **only** if they share both:

1. the same `applicationId` (`com.aquinnmo.timber`, or `com.aquinnmo.timber_dev` for dev builds), and
2. the same signing key.

If either differs, the phone and watch never see each other and **nothing is logged
anywhere** — no error, no warning, no crash. The watch just sits on "Open Timber on
your phone" forever. Almost every first-time failure is this, not pairing.

That is why the watch app has to be signed with the keystore EAS holds for the phone
app, and why you build the `release` variant rather than `debug` (a debug build is
signed with Android's throwaway debug key, which will never match).

---

## Part 1 — First-time setup

### 1. Prerequisites

- **Android Studio** (Ladybug or newer) with the Wear OS system image if you plan to
  use an emulator
- **JDK 17** (Android Studio bundles it — no separate install needed)
- **eas-cli**, logged in: `npx eas login`
- `adb` on your PATH

### 2. Download the phone app's keystore

The watch build needs the key EAS already uses. Which one depends on the flavor you
intend to build:

| Watch flavor | applicationId | Get the keystore from EAS profile |
| --- | --- | --- |
| `prod` | `com.aquinnmo.timber` | `preview` or `production` (they share one keystore) |
| `dev` | `com.aquinnmo.timber_dev` | `development` |

```bash
npx eas credentials -p android
```

Then in the prompts: pick the build profile from the table → **Keystore: Manage
everything needed to build your project** → **Download existing keystore**.

It writes a `.jks` file into the current directory and prints the **keystore
password, key alias, and key password**. Copy those three now — the prompt does not
show them again, though you can always re-download.

### 3. Wire the keystore into the watch project

```bash
mkdir -p apps/wear/keystore
mv <downloaded>.jks apps/wear/keystore/timber.jks
cp apps/wear/keystore.properties.example apps/wear/keystore.properties
```

Fill in `apps/wear/keystore.properties` with the three values from step 2. Both the
`keystore/` directory and `keystore.properties` are gitignored — never commit either.

### 4. Build and install the phone app

The watch bridge is a **new native module** (`modules/wear-sync`), so an over-the-air
update cannot deliver it. You need a fresh binary at least once:

```bash
npx eas build --profile preview --platform android
```

Install the resulting APK on your phone. (Use `--profile development` instead if you
work against the dev client; then build the watch's `dev` flavor to match.)

### 5. Pair the watch

**Physical watch:** on the watch, Settings → System → About → tap *Build number*
seven times, then Settings → Developer options → enable **ADB debugging** and
**Debug over Wi-Fi**. Note the IP shown, then:

```bash
adb pair <watch-ip>:<pairing-port>     # code shown on the watch
adb connect <watch-ip>:5555
adb devices                            # confirm it is listed
```

**Emulator:** create a Wear OS AVD, then use Android Studio's *Pair Devices for Wear
OS* assistant to attach it to your phone. The phone and the emulator must both be
visible to `adb`.

### 6. Open and build the watch app

Open **`apps/wear/`** in Android Studio — the directory itself, not the repo root. It is a
standalone Gradle project and Android Studio will not find it from the top level.

On first sync Gradle downloads its distribution, which takes a few minutes. If
Android Studio complains that the Gradle wrapper is incomplete, either let it
regenerate the wrapper when prompted, or run `gradle wrapper` inside `apps/wear/` if you
have Gradle installed system-wide. The wrapper JAR is intentionally not committed.

Then, in the **Build Variants** panel (left edge), select:

- **`prodRelease`** — pairs with a `preview` or `production` phone build
- **`devRelease`** — pairs with a `development` (dev client) phone build

> Use a **Release** variant. `prodDebug` and `devDebug` are signed with the debug key
> and will silently fail to connect, exactly as described at the top of this page.

Press Run and pick the watch as the target.

### 7. Confirm it works

Open Timber on the phone once so the Home screen pushes its first state, then look at
the watch. You should see the same "Up next" name your Home card shows.

If it stays on "Open Timber on your phone":

```bash
adb -s <watch-serial>  logcat | grep -i wearable
adb -s <phone-serial>  logcat | grep -iE "WearSync|wearable"
```

Re-check the applicationId and signing key before anything else.

---

## Part 2 — The loop for every change after that

What you have to rebuild depends entirely on **what you touched**.

### Changed only JavaScript / TypeScript (phone)

Includes `apps/mobile/src/lib/wear-state.ts`, `apps/mobile/src/lib/wear-sync.android.ts`,
`apps/mobile/src/lib/wear-action-task.ts`, `index.js`, and every screen. Ship it over the air —
no rebuild, no reinstall:

```bash
bun run test:wear-state      # the shared set/dial logic
bun run test:up-next         # the Up Next priority chain
bun run lint

npx eas update --branch preview --message "what changed"
```

Then force-close and reopen Timber on the phone to pull the update.

> Updates only reach an installed build whose runtime version matches. The policy is
> `appVersion`, so **bumping `version` in app.json cuts off every already-installed
> build** — after a version bump you must run a new `eas build`, not an update.

### Changed Kotlin under `apps/mobile/modules/wear-sync/`

Native code cannot go over the air. New build, reinstall on the phone:

```bash
npx eas build --profile preview --platform android
```

The watch app itself does not need rebuilding unless the protocol changed too.

### Changed anything under `apps/wear/`

Just press Run in Android Studio against the same variant. Nothing on the phone
changes.

### Changed the protocol (message paths, JSON field names, capability name)

Both halves have to move together, or the older half silently ignores the newer one.
Rebuild the phone (`eas build`) **and** re-run the watch app, and check that these
three still agree:

- [`apps/mobile/src/lib/wear-state.ts`](../apps/mobile/src/lib/wear-state.ts) — the payload shape
- [`Protocol.kt`](../apps/wear/app/src/main/java/com/aquinnmo/timber/wear/Protocol.kt) — the watch's parser
- [`wear.xml`](../apps/mobile/modules/wear-sync/android/src/main/res/values/wear.xml) — the `timber_phone` capability name

---

## Smoke test before publishing a preview

Roughly two minutes, and it covers every path the watch can take. Run it against the
build you are about to hand out.

**Idle**

1. No workout running → watch shows the same name as the phone's Home card.
2. Tap the start button → the phone opens the workout, watch switches to the first set.

**During a workout**

3. Tap **Complete set** → the phone's set ticks, the watch advances to the next one.
4. Turn the crown to change the weight, then complete → the phone shows the adjusted
   weight, and it carries forward to the following sets that matched the old value.
5. Tap **Undo last set** → the tick clears on the phone and the watch steps back.
6. Complete the final set → the watch switches to **Finish workout**; tap it and
   confirm the workout lands in history.

**The awkward cases — these are where it breaks**

7. **Phone app killed** (swipe it from recents), then tap Complete set on the watch.
   It should still work, via the headless task. If it times out with "No answer —
   check your phone", Android refused the background start; see the `ponytail:` note
   in [`WearMessageService.kt`](../apps/mobile/modules/wear-sync/android/src/main/java/com/aquinnmo/timber/wearsync/WearMessageService.kt).
8. **Phone on the Home tab, workout still running**, tap Complete set on the watch →
   handled by the root-layout fallback, should still log.
9. **Watch out of range**: walk away, complete sets on the phone, come back → the
   watch catches up on its own, because the state is a persisted DataItem.
10. **Bodyweight exercise** → no weight dial, reps only.
11. **Duration exercise** → shows the time, no dial, still completable.

---

## Publishing a preview build

```bash
bun run lint
bun run test:wear-state && bun run test:up-next

npx eas build --profile preview --platform android
```

The watch app is **not** part of that build and is not distributed by EAS. Anyone
testing the watch side has to install it from Android Studio using the steps in
Part 1 — including having the phone app's keystore. In practice that means the watch
app is developer-only until it gets its own Play Console listing.

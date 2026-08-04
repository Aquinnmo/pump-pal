# Getting Timber on your iPhone

This guide assumes you have a Mac and nothing else set up. The scripts handle
everything — you mostly just answer prompts.

Total time: **20–40 minutes**, most of it waiting on downloads.

---

## Before you start

**1. Install Xcode from the App Store.** It's about 10 GB, so start it now and
read the rest while it downloads. Once it's installed, **open it once** and let
it finish "installing components".

**2. Get the settings block from Aidan.** It's ~10 lines of text starting with
`EXPO_PUBLIC_FIREBASE_API_KEY=`. Copy it somewhere you can paste from later.

**3. Have your iPhone and its USB cable handy.** You'll also need your own
Apple ID — any free one works, you do *not* need a paid developer account.

---

## First-time setup

Open **Terminal** (Cmd+Space, type "Terminal") and run:

```bash
git clone https://github.com/Aquinnmo/pump-pal.git
cd pump-pal
bash scripts/ios/setup.sh
```

That's it. The script walks you through the rest:

| Step | What happens |
| --- | --- |
| Xcode check | Makes sure Xcode and its command line tools are ready |
| Homebrew | Installs the package manager (asks first) |
| Node.js | Installs Node via Homebrew |
| Build tools | Installs CocoaPods and Watchman |
| Settings | Asks you to paste the block Aidan sent |
| Dependencies | Downloads the app's packages |
| iPhone | Tells you when to plug the phone in |
| Build | Compiles and installs the app (10–25 min the first time) |

The script asks before installing anything and is safe to stop with **Ctrl-C**
and re-run later — it picks up where it left off.

### Two prompts that need your attention during the build

- **"Select a device"** — pick your iPhone from the list, not a simulator.
- **"Apple ID"** — sign in with **your own** Apple ID. This only signs the app
  so your phone will run it. Aidan never sees your credentials.

### One last step on the phone

iOS won't open the app until you approve the developer:

> **Settings → General → VPN & Device Management → tap your Apple ID → Trust**

Then open Timber from your home screen.

---

## Every time after that

```bash
cd pump-pal
bash scripts/ios/update.sh
```

It pulls the latest code, updates packages, and asks how to run:

- **1) Just start it** — the normal choice. Takes ~30 seconds. Your phone
  already has the app; this starts the server it talks to. Keep the terminal
  window open while you use the app, and press Ctrl-C when you're done.
- **2) Rebuild and reinstall** — takes 5–20 minutes. Use it when the app won't
  open, crashes right after an update, or Aidan says a rebuild is needed.

---

## The 7-day thing

Because the app is signed with a free Apple ID, **it stops working after 7
days.** That's Apple's rule for free accounts, not a bug.

When it happens, plug the phone in and run `bash scripts/ios/update.sh`, then
choose **2) Rebuild**. Takes a few minutes and resets the clock.

(If you get tired of this, a paid Apple Developer account — $99/year — extends
it to a year.)

---

## If something goes wrong

**"Install Xcode first"**
Xcode isn't in your Applications folder yet. Finish the App Store download,
open Xcode once, then re-run the script.

**"Xcode's licence hasn't been accepted"**
The script offers to fix this — say yes and type your Mac password. Manually:
`sudo xcodebuild -license accept`

**"Developer Mode disabled" during the build**
On the iPhone: **Settings → Privacy & Security → Developer Mode → On**. The
phone restarts, which is expected. Then re-run the script.

**Build fails with a signing or bundle identifier error**
Usually means the app ID `com.aquinnmo.timber` is already claimed by another
Apple account. Build under your own identifier instead:

```bash
APP_VARIANT=development bash scripts/ios/setup.sh
```

This installs as "Timber Dev" with the identifier `com.aquinnmo.timber.dev`.
If you use this, use the same prefix for updates too:

```bash
APP_VARIANT=development bash scripts/ios/update.sh
```

**The app opens but can't connect / stuck on a loading screen**
Make sure `bash scripts/ios/update.sh` (option 1) is running in a terminal, and
that the phone and Mac are on the same Wi-Fi network.

**`brew: command not found` in a new terminal**
Close and reopen Terminal. The setup script adds Homebrew to your shell
profile, but existing windows don't pick it up.

**Anything else**
Copy the last ~20 lines of terminal output and send them to Aidan. Don't try to
fix build errors blind.

---

## Notes for maintainers

- `scripts/ios/_common.sh` holds shared helpers and the `.env` validator.
  Run its check with `bash scripts/ios/_common.sh --self-test`.
- `REQUIRED_ENV_KEYS` in that file lists only the Firebase keys, because
  `config/firebase.ts` reads them with no fallback. The AI keys default to `''`
  in `constants/ai-config.ts`, so a missing one degrades AI features instead of
  crashing the app — update `REQUIRED_ENV_KEYS` if that ever changes.
- `ios/` is not committed; `npx expo run:ios` prebuilds and pod-installs on its
  own, which is why the scripts have no separate prebuild step.
- The Wear OS module, the Android widget, and `wear/` are all Android-only and
  are skipped by autolinking on iOS. No iOS-side work is needed for them.

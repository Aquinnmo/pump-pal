# Getting Timber on your iPhone

There are two commands:

1. Run `bash scripts/ios/setup.sh` once to prepare the Mac.
2. From then on, run `npm run install:apple` to update and install Timber.

The installed app is a standalone Release build. It does not need the Mac or a
development server after installation.

## Before you start

Have all of these ready:

- A Mac that supports the current Xcode release.
- Xcode from the App Store. Open it once and let it finish installing
  components.
- This repository cloned onto the Mac.
- The `.env` file from Aidan saved in the repository root.
- An iPhone, USB cable, phone passcode, internet access, and enough free disk
  space for Xcode and the build.
- The Mac administrator password.
- An Apple Account, including access to its two-factor authentication.

A paid Apple Developer membership is not required. Xcode calls an unpaid
account a **Personal Team**. Apple limits Personal Teams to 10 active App IDs,
3 devices, and 3 installed apps per device; their provisioning profiles expire
after 7 days. See [Apple's developer account overview][apple-account].

[apple-account]: https://developer.apple.com/help/account/basics/about-your-developer-account

## One-time Mac setup

In Terminal, enter the cloned repository and run:

```bash
cd pump-pal
bash scripts/ios/setup.sh
```

The setup script:

- checks Xcode, installs its command-line tools, selects the full Xcode
  toolchain, and accepts the license;
- installs Homebrew, Node.js 20 or newer, and CocoaPods when missing;
- validates the supplied `.env`;
- creates an ignored `.env.apple.local` file containing a stable, unique bundle
  identifier for this clone; and
- guides you through adding your Apple Account in Xcode → Settings → Accounts.

It does not install JavaScript packages or build the app. It is safe to stop
with Ctrl-C and run again: the generated app identifier remains unchanged.

## Install or update Timber

After setup, this is the only command to use:

```bash
npm run install:apple
```

The installer:

1. Verifies the one-time setup.
2. Stops safely if tracked repo files were edited locally.
3. Runs a fast-forward-only Git pull.
4. Restarts itself if the pull updated the installer.
5. Installs the exact dependencies from `package-lock.json` with `npm ci`.
6. Builds a standalone Release app and installs it on the selected iPhone.

Connect and unlock the iPhone before the build. Tap **Trust** if the phone asks
whether to trust the Mac. On iOS 16 or newer, enable **Settings → Privacy &
Security → Developer Mode**; the phone restarts and asks for confirmation.
[Apple explains why Developer Mode is required here][developer-mode].

During the build, select the connected iPhone rather than a simulator. If Xcode
asks for a development team, choose the Personal Team for your Apple Account.

[developer-mode]: https://developer.apple.com/documentation/Xcode/enabling-developer-mode-on-a-device

After installation, iOS may require one final approval:

> Settings → General → VPN & Device Management → your Apple Account → Trust

You can then disconnect the phone, close Terminal, and use Timber normally.

## Reinstall every 7 days with a free account

Apple's free Personal Team provisioning expires after 7 days. When Timber stops
opening, reconnect and unlock the phone, then run:

```bash
npm run install:apple
```

The same command installs app updates whenever Aidan publishes new code. A paid
Apple Developer membership has longer-lived signing and does not require the
weekly Personal Team reinstall.

## Troubleshooting

### The installer reports local changes

It deliberately stops before pulling. Do not discard or merge the files blindly.
Send Aidan the displayed `git status` lines and ask what to do.

Ignored files such as `.env`, `.env.apple.local`, `ios/`, and `node_modules/`
do not trigger this check.

### The one-time Apple setup is missing

Run:

```bash
bash scripts/ios/setup.sh
```

This recreates `.env.apple.local` if necessary. Do not copy another person's
`.env.apple.local`; its unique bundle identifier belongs to their installation.

### The phone does not appear

Reconnect it by USB, unlock it, tap **Trust**, and confirm Developer Mode is on.
If the phone runs a newer iOS release than Xcode supports, update Xcode and, if
required by the App Store, macOS.

### Signing or development-team error

Open Xcode → Settings → Accounts and confirm the Apple Account is listed. During
the next build, choose that account's Personal Team. If the error mentions the
bundle identifier, rerun `bash scripts/ios/setup.sh`.

### `.env` is missing or incomplete

Ask Aidan for the current `.env`, save it in the repository root, and rerun the
one-time setup. The installer revalidates it after every pull in case new keys
were added.

### Anything else

Copy the last 20 lines of Terminal output and send them to Aidan.

## Notes for maintainers

- `scripts/ios/_common.sh` contains shared setup, `.env`, and Apple bundle-ID
  validation. Run `npm run test:ios-scripts` after editing it.
- The recurring installer exports `TIMBER_IOS_BUNDLE_IDENTIFIER` from the
  ignored `.env.apple.local` before Expo evaluates `app.config.js`.
- `ios/` is generated and ignored. `npx expo run:ios` performs prebuild and pod
  installation when necessary.
- The installer uses `--configuration Release --no-bundler`, so the resulting
  app embeds its JavaScript and does not start Metro.

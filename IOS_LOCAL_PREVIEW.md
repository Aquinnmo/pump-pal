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

  Before the first iOS prebuild, a project administrator must add that team's 10-character ID to `apps/mobile/app.json`:

  ```json
  {
    "expo": {
      "ios": {
        "appleTeamId": "YOUR_TEAM_ID"
      }
    }
  }
  ```

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

`bun run install:apple` also rebuilds, but it switches to `main` and pulls from Git first. Use it only when that checkout update is wanted; it is not needed to reinstall the current working tree.

## Signing issues

- If Xcode reports a missing provisioning profile or capability, confirm the selected team owns the bundle ID and has the required App Group enabled.
- A free Apple Account can install simple Xcode projects on a personal device, but it cannot sign another team's identifier or capabilities. Ask a project administrator for team access or a separately configured personal build.

See Expo's [local iOS build guide](https://docs.expo.dev/guides/local-app-development/) and Apple's [signing-capability guide](https://developer.apple.com/documentation/xcode/adding-capabilities-to-your-app) for Xcode-specific troubleshooting. For more help go to the [Expo local iOS development page](https://docs.expo.dev/guides/local-app-development/).

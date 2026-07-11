# Pump Pal

Workout tracking app built with Expo Router (TypeScript, React Native), backed by Firebase (auth + Firestore) with AI-powered workout insights.

## Setup

1. Install dependencies

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your Firebase project config (`EXPO_PUBLIC_FIREBASE_*`), AI provider/model settings, and Google provider key (`EXPO_PUBLIC_GEMINI_API_KEY`).

3. Start the dev server

   ```bash
   npx expo start
   ```

   Press `a`/`i`/`w` to open Android/iOS/web, or scan the QR code with Expo Go.

## EAS preview APK and updates

The `preview` profile creates an internally distributed Android APK. It is the profile for sharing Timber directly with testers; it is not a Google Play Store release.

### One-time EAS setup

1. Sign in to the Expo account that owns this project:

   ```powershell
   npx eas-cli@latest login
   npx eas-cli@latest whoami
   ```

2. Add the values from local `.env` to the project's **preview** EAS environment in the Expo dashboard. The remote build cannot read the ignored local `.env` file. Add every value listed in `.env.example`, including the Firebase `EXPO_PUBLIC_FIREBASE_*` values and `EXPO_PUBLIC_GEMINI_API_KEY`.

   `EXPO_PUBLIC_*` values are bundled into the app and must be treated as client-visible configuration, not secrets. See [EAS environment variables](https://docs.expo.dev/eas/environment-variables/).

### Build and share a preview APK

Run this from PowerShell in the repository root:

```powershell
$env:GIT_CLONE_PROTECTION_ACTIVE = 'false'

try {
  npx eas-cli@latest build -p android --profile preview
} finally {
  Remove-Item Env:GIT_CLONE_PROTECTION_ACTIVE -ErrorAction SilentlyContinue
}
```

`GIT_CLONE_PROTECTION_ACTIVE=false` is required here because Beads configures a local Git hooks path and Git otherwise rejects EAS CLI's temporary local clone.

When the build finishes, EAS prints a build-details URL and direct APK download link. Open the APK link on the Android device, allow installs from that browser when Android asks, then install it. To find a prior build:

```powershell
npx eas-cli@latest build:list -p android
```

### Publish an over-the-air preview update

Use an EAS Update for JavaScript, styling, and asset changes that do not require native Android changes:

```powershell
npx eas-cli@latest update --channel preview --environment preview --message "Describe the change"
```

The installed preview APK uses the `preview` channel. Force-close and reopen the app (up to twice) to download and apply the update.

Build and redistribute a new APK instead when changing Expo/RN native dependencies, native configuration, Android permissions, or app version. This app's runtime version follows `app.json`'s `version`, so an update only applies to installed builds with the same runtime version.

Use `production` only for a store-ready build; Android production builds are normally AABs and are distributed through Google Play, not downloaded directly as APKs. See [Expo's APK guide](https://docs.expo.dev/build-reference/apk/) and [EAS Update guide](https://docs.expo.dev/eas-update/getting-started/).

## Other commands

```bash
npm run android      # start + open Android
npm run ios          # start + open iOS
npm run web          # start + open web
npm run lint         # expo lint
npm run build:web    # static web export to dist/ (used by Vercel, see vercel.json)
npm run migration:test  # runs the legacy-migration script tests
```

## Architecture

File-based routing via Expo Router, with auth/onboarding gating and the Firestore data model documented in [CLAUDE.md](CLAUDE.md). The Firestore workout/exercise schema (canonical collections, set-by-set data model, exercise catalog) is documented in [docs/firestore-data-refactor.md](docs/firestore-data-refactor.md).

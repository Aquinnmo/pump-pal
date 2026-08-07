# Local Preview build (Android)

How to run `eas build --profile preview --platform android --local` on this machine
and get an APK where **Google sign-in works**.

The `preview` profile has no `APP_VARIANT`, so this APK is the real
`com.aquinnmo.timber` "Timber" app — not "Timber Dev". It replaces the preview /
production install on your phone; `com.aquinnmo.timber_dev` is untouched.

`--local` changes only *where gradle runs*. Credentials, environment variables,
and the version code all still come from EAS servers, so you must be logged in
and online.

---

## 1. Prerequisites

| Requirement | Verify |
| ----------- | ------ |
| `eas-cli` ≥ 18, logged in | `eas whoami` → `aquinnmo` |
| JDK 17 | `java -version` |
| Android SDK exported | `echo $ANDROID_HOME` → `/home/aquinnmo/Android/Sdk` |
| Android NDK installed | `ls $ANDROID_HOME/ndk` → `27.1.12297006` |
| `adb` on PATH | `adb devices` |

All five already pass on this machine. `ANDROID_HOME` must be set **in the shell
that runs eas-cli** — gradle can't find the SDK/NDK otherwise.

---

## 2. Fix `DEVELOPER_ERROR` first — this is the blocker

Google matches an Android OAuth client by **package name + signing SHA-1**.
Nothing about that lives in the APK; it's all server-side registration.

- The dev build works because the local debug keystore
  (`0C:E2:31:63:C1:30:7C:C2:4B:53:77:96:94:16:B1:54:A2:97:74:DD`) is registered for
  `com.aquinnmo.timber_dev`.
- A preview APK — cloud **or** local — is signed by the **EAS-managed keystore**,
  a completely different fingerprint, under a different package. Unregistered
  fingerprint = `DEVELOPER_ERROR`, status code 10.

This app uses the Firebase **JS** SDK, not react-native-firebase, so there is no
`google-services.json` to fix. The native module's only job is to hand back a
Google ID token (`utils/google-sign-in.ts`). Client IDs + fingerprints are the
entire surface.

### 2.1 Get the EAS preview keystore fingerprints

```bash
eas credentials -p android
#   -> select build profile: preview
#   -> Keystore: Manage everything needed to build your project
# prints: SHA1 Fingerprint / SHA256 Fingerprint
```

If the menu doesn't print them, download the keystore from that same menu, then:

```bash
keytool -list -v -keystore <downloaded.jks> -alias <alias>
```

### 2.2 Register them in Firebase

Firebase Console → project `pumppal-c9199` → **Project settings** → *Your apps* →
the Android app for package **`com.aquinnmo.timber`** (create it if it doesn't
exist) → **Add fingerprint**. Add **both** SHA-1 and SHA-256.

> Do not confuse this with the `com.aquinnmo.timber_dev` app entry. Two packages,
> two app entries, two sets of fingerprints.

### 2.3 Confirm the Android OAuth client exists

Google Cloud Console → APIs & Services → **Credentials**. Firebase auto-creates an
**Android** OAuth client for the package + SHA-1 you just added — usually within a
minute. If it isn't there, create it manually with exactly that package name and
SHA-1.

### 2.4 Confirm the web client ID

Android sends the **web** client ID to get a Firebase ID token; a mismatch here is
the second most common `DEVELOPER_ERROR` cause.

```bash
eas env:list --environment preview | grep GOOGLE_WEB
```

Must equal the value at Firebase → **Authentication → Sign-in method → Google →
Web SDK configuration**. Currently on the preview environment:

```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=631531267876-torra1hkclmmfn1amdua7m3q3485c0d8.apps.googleusercontent.com
```

It must end in `.apps.googleusercontent.com`. A value starting `1:` is a Firebase
App ID and will not work (`config/google-oauth.js` throws on that at config time).

### 2.5 Retest without rebuilding

Fingerprint registration is server-side — **no rebuild needed** once the APK is
installed. Give it a few minutes, then force-stop Timber and clear Google Play
Services cache before trying sign-in again.

---

## 3. Environment variables

`eas.json`'s preview profile sets `"environment": "preview"`, so eas-cli pulls the
EAS preview variables for the local build too. Watch for the log line about
environment variables being loaded from the `preview` environment.

All required values are already set there:

```
EXPO_PUBLIC_FIREBASE_*            (7 vars)
EXPO_PUBLIC_API_BASE_URL          https://timber-api.adam-montgomery.ca
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
```

Your local `.env` is **not** used — it's gitignored and never reaches the build.
If EAS vars ever fail to resolve, fall back to
`eas env:pull --environment preview` (writes `.env.local`) or export them inline
before the build command.

> **Security — act on this.** `EXPO_PUBLIC_GEMINI_API_KEY` is set on the EAS
> preview environment but is referenced nowhere in client code; all AI traffic
> goes through the Vercel proxy (`api/ai.ts`). Every `EXPO_PUBLIC_*` value is
> inlined into the APK by Metro, so that key ships in plaintext to anyone who
> installs a preview build and can be extracted from it. Delete the variable from
> the EAS preview environment **and rotate the key** in Google AI Studio — deleting
> alone doesn't help, it's already in the APKs built so far.

---

## 4. What gets uploaded

- Local builds still archive **git HEAD**. Uncommitted work is excluded — commit
  first, or set `EAS_NO_VCS=1` to build straight from the working directory
  (`.gitignore` is still honoured, so `.env`, `android/`, `ios/` stay out).
- The `android/` and `ios/` folders left over from `npm run development:android`
  are gitignored and irrelevant here: EAS prebuilds into its own temp directory.
  No need to delete them.
- If cloning fails with `active core.hooksPath found ... disallowed by default`
  (git's clone protection tripping over the beads hooks), prefix
  `GIT_CLONE_PROTECTION_ACTIVE=false` — same fix as in
  [dev-build.md](dev-build.md).

---

## 5. Build

```bash
EAS_NO_VCS=1 GIT_CLONE_PROTECTION_ACTIVE=false \
  eas build --profile preview --platform android --local \
  --output ./build-preview.apk
```

Drop `EAS_NO_VCS=1` if you'd rather build committed code only.

Needs network and login throughout: `appVersionSource: remote` fetches the version
code from EAS, and the signing keystore is downloaded from EAS. First run is slow
(full gradle + NDK compile of `modules/live-update-notification` and the widget).
`*.apk` is already gitignored.

---

## 6. Install

```bash
adb install -r ./build-preview.apk
```

`INSTALL_FAILED_UPDATE_INCOMPATIBLE` means an existing `com.aquinnmo.timber` is
installed with a different signing key.

> **Destructive:** the fix is `adb uninstall com.aquinnmo.timber`, which deletes
> that app's local SQLite database and any unsynced workout data on the device.
> Confirm the data is synced to Firestore before uninstalling.

---

## 7. Verify

Run the checklist in [preview-auth-checklist.md](preview-auth-checklist.md#5-verify).
The short version:

1. Google sign-in from the welcome screen completes and lands on Home (not split setup).
2. **Settings → Account → Connect Google** links successfully.
3. Sign out, sign back in with Google → same Firebase UID, same workout data.

---

## Troubleshooting

| Symptom | Cause / fix |
| ------- | ----------- |
| `DEVELOPER_ERROR` / status code 10 | SHA-1 not registered for `com.aquinnmo.timber`, or wrong web client ID — § 2 |
| `Google did not return an ID token. Check EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.` | Web client ID missing or not the Firebase web client — § 2.4 |
| Picker opens then closes, no error | User cancelled; `signInWithGoogle` returns `false` by design |
| Status code 7 / network error | Device offline, or Google Play Services out of date |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID must be a Google OAuth client ID…` at build time | A Firebase App ID (`1:…`) or a trailing comment in the EAS variable — `config/google-oauth.js` |
| App installs but API calls fail | Check `EXPO_PUBLIC_API_BASE_URL` on the preview environment |
| Gradle can't find SDK/NDK | `ANDROID_HOME` not exported in the shell running eas-cli |
| Sign-in works on dev build, fails on preview | Expected until § 2 is done — different package **and** different keystore |

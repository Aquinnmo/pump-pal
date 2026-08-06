# Preview authentication setup checklist

Complete these steps for **Preview only**. Do not change Production yet.

## 1. Configure Google and Firebase

1. In Firebase Console for project `pumppal-c9199`, open **Authentication → Sign-in method** and enable Google.
2. Add `timber-preview.adam-montgomery.ca` to Firebase Authentication's authorized domains.
3. Create or select these Google OAuth clients:
   - **Web:** use a Web OAuth client ID. If Google requests a redirect URI, add `https://pumppal-c9199.firebaseapp.com/__/auth/handler`.
   - **iOS:** bundle ID `com.aquinnmo.timber`.
   - **Android:** package `com.aquinnmo.timber`, with the SHA-1 and SHA-256 from the EAS Preview signing certificate.
4. Confirm both client IDs end in `.apps.googleusercontent.com`. A value beginning `1:` is a Firebase App ID and will not work.

## 2. Set EAS Preview variables

In the Expo project dashboard, add these to the **preview** environment:

- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` — the Web OAuth client ID
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` — the iOS OAuth client ID

`EXPO_PUBLIC_API_BASE_URL` is already configured for Preview. Do not add OAuth client secrets or service-account JSON to EAS.

## 3. Set Vercel Preview variables

In Vercel, open **Project → Settings → Environment Variables** and scope these values to **Preview**:

- `FIREBASE_PROJECT_ID=pumppal-c9199`
- `FIREBASE_CLIENT_EMAIL` — `client_email` from the Firebase service-account JSON
- `FIREBASE_PRIVATE_KEY` — `private_key` with its literal `\n` escapes preserved
- `API_ALLOWED_ORIGINS=https://timber-preview.adam-montgomery.ca`

Add `http://localhost:8081` to `API_ALLOWED_ORIGINS` only if local Expo web must call the Preview API. Keep the list comma-separated.

Delete the downloaded service-account JSON after copying its values into Vercel. Never commit it.

## 4. Redeploy and rebuild

1. Redeploy the Vercel Preview deployment so the new server variables take effect.
2. Create fresh iOS and Android EAS Preview builds. Native OAuth configuration is embedded at build time, so an old installation will not pick up the new IDs.
3. Install the fresh builds.

## 5. Verify

- An unauthenticated request to `/api/profile` returns `401`, not a blanket `404`.
- A request from `https://timber-preview.adam-montgomery.ca` is not rejected with `403 origin_denied`.
- Password sign-in hydrates the existing account instead of opening split setup.
- **Settings → Account → Connect Google** links Google successfully.
- After signing out, Google sign-in returns to the same Firebase UID and the same account data.
- Repeat the sign-in and hydration checks on web, iOS Preview, and Android Preview.

After every check passes:

```bash
bd close pump-pal-ehb.6 --reason="Preview auth and hydration verified on web, iOS, and Android"
bd close pump-pal-ehb --reason="Google authentication and account hydration repair verified"
```

For deeper troubleshooting, see [deployment.md](deployment.md#troubleshooting).

## Local Android development build

`npm run development:android` uses package `com.aquinnmo.timber_dev`, not the
Preview package. Register that package as a separate Android OAuth client with
the SHA-1 and SHA-256 from the local debug keystore:

```bash
keytool -list -v -alias androiddebugkey \
  -keystore "$HOME/.android/debug.keystore" \
  -storepass android -keypass android
```

Then set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in the local `.env` to the valid
**Web OAuth client ID**. Android uses that Web ID to request a Firebase ID token;
the Android OAuth client is matched automatically by package name and signing
fingerprint. `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` may be empty for an Android-only
build. Both populated values must end in `.apps.googleusercontent.com`.

For an iOS development build, use a separate iOS OAuth client registered for
bundle ID `com.aquinnmo.timber-dev`. Android uses an underscore because its
package IDs cannot contain hyphens; iOS bundle IDs cannot contain underscores.

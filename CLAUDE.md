# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install              # install deps
npx expo start            # start dev server (Metro) — press a/i/w for android/ios/web
npm run android            # start + open Android
npm run ios                # start + open iOS
npm run web                 # start + open web
npm run lint                 # expo lint (eslint-config-expo flat config)
npm run build:web            # static web export to dist/ (used by Vercel, see vercel.json)
```

There is no test runner configured for the app itself. The only automated tests are for the legacy migration scripts:

```bash
npm run migration:test    # runs scripts/migration/convert-legacy-workout.test.js and legacy-inventory.test.js directly with node
```

## Architecture

Expo Router (file-based routing, typed routes) app, TypeScript, React 19 / React Native 0.81, new architecture enabled. Path alias `@/*` maps to repo root (tsconfig.json).

### Navigation / auth gating

`app/_layout.tsx` wraps everything in `AuthProvider` (`context/auth-context.tsx`, Firebase email/password + phone auth) and does redirect gating in one place based on three pieces of state: Firebase `user`, whether onboarding was seen (`AsyncStorage` key `pumppal_onboarding_seen`), and whether the user's Firestore doc (`users/{uid}`) has a valid `workoutSplit.type` (see `constants/split-options.ts`). Route groups:

- `(auth)` — welcome/sign-in/sign-up/phone-auth, shown when logged out
- `set-split` — forced first-run screen when logged in but no split chosen yet
- `(tabs)` — main app (Home/index, Analytics, TPC pushup-challenge, Settings; `workouts` and `explore` tabs exist as screens but are hidden from the tab bar via `href: null`)

### Firebase

`config/firebase.ts` initializes a single Firebase app from `EXPO_PUBLIC_FIREBASE_*` env vars (see `.env.example`), with `initializeAuth`+AsyncStorage persistence falling back to `getAuth` (needed because Fast Refresh re-invokes `initializeAuth` on an already-initialized app). Firestore project is `pumppal-c9199`.

**Important: the app currently reads/writes workouts at the legacy path `users/{uid}/workouts/{workoutId}`** (see `app/modal.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/workouts.tsx`, `app/(tabs)/analytics.tsx`, `app/(tabs)/settings.tsx`). A schema migration to top-level, analytics-ready collections has been run against Firestore data but the app has **not** been cut over to read from it yet:

- New canonical shape (already written to Firestore, not yet consumed by the app): top-level `exercises/{exerciseId}` (catalog with variations), top-level `workouts/{workoutId}` (has `userId` field, set-by-set `performedExercises[].sets`), and `exerciseCatalogMeta/current` for cache invalidation. Full target schema and remaining cutover checklist: `docs/firestore-data-refactor.md`.
- `docs/v2-migration-plan.md` and `migration/README.md` describe an **earlier, superseded** plan (`v2-users`/`v2-workouts` nested under users, `v2-exercises`). The scripts that actually ran and the data actually in Firestore follow `docs/firestore-data-refactor.md` instead (top-level `workouts`/`exercises`, no `v2-` prefix) — don't follow the v2 doc's collection names when touching Firestore data.

When changing anything related to workouts/exercises, check `docs/firestore-data-refactor.md`'s "Remaining Work" section first — it lists the exact files still needing cutover to the new schema.

### Migration scripts (`scripts/migration/`, `migration/`)

One-off, npm-scripted Node scripts (not part of the app bundle) that read/convert/validate/write the legacy → canonical Firestore data described above. They operate on local JSON artifacts first (`temp/` snapshots, `migration/*.json` mapping/catalog files) and only write to Firestore as an explicit final step (`migration:write:workouts`, `migration:seed:exercises`). Treat any script that writes to Firestore as a real, one-directional data migration, not a dev-loop command — don't re-run write scripts without understanding idempotency (migrated workout doc IDs are deterministic from the source path, so reruns update rather than duplicate, per the doc above).

### AI features

Google Gemini (`@google/generative-ai`, model set in `constants/gemini-config.ts`, key from `EXPO_PUBLIC_GEMINI_API_KEY`) powers `utils/gemini-muscle-analysis.ts` (muscle group insight cards on Home) and `utils/gemini-workout-suggestions.ts`. Both currently consume the legacy workout shape and are listed in the app-cutover list above.

### Theming

`constants/theme.ts` + `hooks/use-color-scheme(.web).ts` + `hooks/use-theme-color.ts` drive light/dark theming consumed by `components/themed-text.tsx` / `components/themed-view.tsx`. Tab bar and accent colors are currently hardcoded dark-style values in `app/(tabs)/_layout.tsx` rather than pulled from the theme constants.

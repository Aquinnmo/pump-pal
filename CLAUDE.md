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
- `(tabs)` — main app (Home/index, Analytics, TPC pushup-challenge, Settings; `workouts` tab exists as a screen but is hidden from the tab bar via `href: null`, reachable from a button on Home)

### Firebase

`config/firebase.ts` initializes a single Firebase app from `EXPO_PUBLIC_FIREBASE_*` env vars (see `.env.example`), with `initializeAuth`+AsyncStorage persistence falling back to `getAuth` (needed because Fast Refresh re-invokes `initializeAuth` on an already-initialized app). Firestore project is `pumppal-c9199`.

The app reads/writes workouts exclusively at the canonical top-level path: `exercises/{exerciseId}` (catalog with variations), `workouts/{workoutId}` (has a `userId` field, set-by-set `performedExercises[].sets`), and `exerciseCatalogMeta/current` for cache invalidation. Full schema reference: `docs/firestore-data-refactor.md`. The only remaining touch of the legacy `users/{uid}/workouts/{workoutId}` path is in `app/(tabs)/settings.tsx`'s account-deletion flow, which intentionally also purges the old subcollection as part of a full account wipe.

### Migration scripts (`scripts/migration/`, `migration/`)

One-off, npm-scripted Node scripts (not part of the app bundle) that read/convert/validate/write the legacy → canonical Firestore data described above. They operate on local JSON artifacts first (`temp/` snapshots, `migration/*.json` mapping/catalog files) and only write to Firestore as an explicit final step (`migration:write:workouts`, `migration:seed:exercises`). Treat any script that writes to Firestore as a real, one-directional data migration, not a dev-loop command — don't re-run write scripts without understanding idempotency (migrated workout doc IDs are deterministic from the source path, so reruns update rather than duplicate, per the doc above).

### AI features

Google Gemini (`@google/generative-ai`, model set in `constants/gemini-config.ts`, key from `EXPO_PUBLIC_GEMINI_API_KEY`) powers `utils/gemini-muscle-analysis.ts` (muscle group insight cards on Home) and `utils/gemini-workout-suggestions.ts`. Both consume the canonical `performedExercises[].sets` shape from `@/types/workout`.

### Theming

`constants/theme.ts` + `hooks/use-color-scheme(.web).ts` + `hooks/use-theme-color.ts` drive light/dark theming consumed by `components/themed-text.tsx` / `components/themed-view.tsx`. Tab bar and accent colors are currently hardcoded dark-style values in `app/(tabs)/_layout.tsx` rather than pulled from the theme constants.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:7510c1e2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->

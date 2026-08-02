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
```

There is no test runner configured for the app itself. The only automated tests are for the legacy migration scripts:

```bash
npm run migration:test    # runs scripts/migration/convert-legacy-workout.test.js and legacy-inventory.test.js directly with node
```

YOU ARE NEVER ALLOWED TO RUN A LOCAL BUILD `npx expo run:android` or anything similar. ALL DEV BUILDS WILL BE CREATED BY THE USER

## Source-of-truth docs

Read these before changing the app. They take precedence over patterns you find in the code.

- **[docs/purpose.md](docs/purpose.md)** — why Timber exists, what it optimizes for, non-goals, and the decision rules for judging a change. Consult before adding, removing, or reshaping a feature.
- **[docs/design-language.md](docs/design-language.md)** — color/type/spacing tokens, component recipes, motion, copy voice, accessibility. Consult before writing any UI. It is prescriptive, not descriptive: the code has known drift, listed in its appendix. Use the spec's values, not whatever the neighbouring file happens to do.
  - **Hard rule:** its [off-limits list](docs/design-language.md#off-limits-generic-ai-generated-design) names generic AI-generated design tropes (gradient/glass surfaces, sparkle-as-AI, bento stat grids, "elevate your fitness journey" copy). These are banned by default. If a request calls for one, do **not** silently comply and do **not** silently substitute — stop, name the pattern, and use `AskUserQuestion` to offer non-trope alternatives. Implement it only if the user explicitly picks it after seeing them, then record the exception.
- **[docs/data-model/README.md](docs/data-model/README.md)** — Firestore schema as it exists today.

## User workflow override

These rules override the generated Beads session-completion protocol below unless the user explicitly says otherwise in the current conversation.

- Do not run `git commit`, `git pull`, `git pull --rebase`, `git push`, or other Git history/sync commands on the user's behalf.
- Leave completed changes uncommitted and unpushed. Report what changed and what remains dirty instead.
- Do not run build/export commands as verification, including `npm run build:web`, `npx expo export`, or equivalent Expo/Metro production builds.
- Prefer lightweight checks such as focused source inspection, `rg`, or lint/type checks when the user asks for verification. Ask first before running heavier commands.
- If an older instruction says work is not complete until push succeeds, ignore that instruction. For this repo, work can be complete with uncommitted local changes.

## Architecture

Expo Router (file-based routing, typed routes) app, TypeScript, React 19 / React Native 0.81, new architecture enabled. Path alias `@/*` maps to repo root (tsconfig.json).

### Navigation / auth gating

`app/_layout.tsx` wraps everything in `AuthProvider` (`context/auth-context.tsx`, Firebase email/password + phone auth) and does redirect gating in one place based on three pieces of state: Firebase `user`, whether onboarding was seen (`AsyncStorage` key `pumppal_onboarding_seen`), and whether the user's Firestore doc (`users/{uid}`) has a valid `workoutSplit.type` (see `constants/split-options.ts`). Route groups:

- `(auth)` — welcome/sign-in/sign-up/phone-auth, shown when logged out
- `set-split` — forced first-run screen when logged in but no split chosen yet
- `(tabs)` — main app (Home/index, Analytics, TPC pushup-challenge, Settings; `workouts` tab exists as a screen but is hidden from the tab bar via `href: null`, reachable from a button on Home)

### Firebase

`config/firebase.ts` initializes a single Firebase app from `EXPO_PUBLIC_FIREBASE_*` env vars (see `.env.example`), with `initializeAuth`+AsyncStorage persistence falling back to `getAuth` (needed because Fast Refresh re-invokes `initializeAuth` on an already-initialized app). Firestore project is `pumppal-c9199`.

The app reads/writes workouts exclusively at the canonical top-level path: `exercises/{exerciseId}` (catalog with variations), `workouts/{workoutId}` (has a `userId` field, set-by-set `performedExercises[].sets`), and `exerciseCatalogMeta/current` for cache invalidation. Full schema reference: `docs/data-model/README.md` (`docs/firestore-data-refactor.md` is migration history, not the current schema). The only remaining touch of the legacy `users/{uid}/workouts/{workoutId}` path is in `app/(tabs)/settings.tsx`'s account-deletion flow, which intentionally also purges the old subcollection as part of a full account wipe.

### Migration scripts (`scripts/migration/`, `migration/`)

One-off, npm-scripted Node scripts (not part of the app bundle) that read/convert/validate/write the legacy → canonical Firestore data described above. They operate on local JSON artifacts first (`temp/` snapshots, `migration/*.json` mapping/catalog files) and only write to Firestore as an explicit final step (`migration:write:workouts`, `migration:seed:exercises`). Treat any script that writes to Firestore as a real, one-directional data migration, not a dev-loop command — don't re-run write scripts without understanding idempotency (migrated workout doc IDs are deterministic from the source path, so reruns update rather than duplicate, per the doc above).

### AI features

AI SDK Core (`ai`) provides provider-neutral generation and structured output. `constants/ai-config.ts` currently registers Google via `@ai-sdk/google`, with provider/model selected through `EXPO_PUBLIC_AI_PROVIDER` and `EXPO_PUBLIC_AI_MODEL`, and the Google key supplied by `EXPO_PUBLIC_GEMINI_API_KEY`. AI features live in `utils/muscle-analysis.ts`, `utils/workout-suggestions.ts`, and `utils/daily-name.ts`. They consume the canonical `performedExercises[].sets` shape from `@/types/workout`.

### Theming

`constants/theme.ts` + `hooks/use-color-scheme(.web).ts` + `hooks/use-theme-color.ts` drive light/dark theming consumed by `components/themed-text.tsx` / `components/themed-view.tsx`. Tab bar and accent colors are currently hardcoded dark-style values in `app/(tabs)/_layout.tsx` rather than pulled from the theme constants.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
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

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->

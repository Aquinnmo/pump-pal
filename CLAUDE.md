# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Issue tracking

Current and future work for this repo is tracked in **GitHub Issues**, project "Timber". Check there for open work items, planned features, and known bugs before starting new work.

## Commands

All of these run from the workspace root; the root scripts delegate into the right package.

```bash
bun install              # install every workspace package
bun start                 # dev server (Metro) — press a/i/w for android/ios/web
bun run android            # start + open Android
bun run ios                # start + open iOS
bun run web                 # start + open web
bun run lint                 # expo lint (eslint-config-expo flat config)
bun run typecheck             # tsc --noEmit in all three TS packages
bun run test                   # contract + api + mobile + tools; each TypeScript package uses Bun's built-in `bun test` discovery
```

To work inside one package, use `bun --cwd=<path> run <script>` (`apps/mobile`, `apps/api`, `packages/contract`) or `cd` into it.

TypeScript tests use Bun's built-in `bun test` discovery. The nine JavaScript
holdouts run explicitly under plain Node: four mobile `.test.js` files and five
tool `.test.js` files. `app.config.test.js` is the one
that relies on `require.cache` invalidation, `live-activity-autolinking.test.js`
shells out to `expo-modules-autolinking`, and the remaining CommonJS tests stay
on Node for compatibility. The mobile package's `test` script excludes all
`*.test.js` files from Bun discovery, and the root `test:tools` script runs the
Node holdouts alongside the static checks.

YOU ARE NEVER ALLOWED TO RUN A LOCAL BUILD `bunx expo run:android` or anything similar. ALL DEV BUILDS WILL BE CREATED BY THE USER

## Source-of-truth docs

Read these before changing the app. They take precedence over patterns you find in the code.

- **[docs/purpose.md](docs/purpose.md)** — why Timber exists, what it optimizes for, non-goals, and the decision rules for judging a change. Consult before adding, removing, or reshaping a feature.
- **[docs/design-language.md](docs/design-language.md)** — color/type/spacing tokens, component recipes, motion, copy voice, accessibility. Consult before writing any UI. It is prescriptive, not descriptive: the code has known drift, listed in its appendix. Use the spec's values, not whatever the neighbouring file happens to do.
  - **Hard rule:** its [off-limits list](docs/design-language.md#off-limits-generic-ai-generated-design) names generic AI-generated design tropes (gradient/glass surfaces, sparkle-as-AI, bento stat grids, "elevate your fitness journey" copy). These are banned by default. If a request calls for one, do **not** silently comply and do **not** silently substitute — stop, name the pattern, and use `AskUserQuestion` to offer non-trope alternatives. Implement it only if the user explicitly picks it after seeing them, then record the exception.
- **[docs/data-model/README.md](docs/data-model/README.md)** — Firestore schema as it exists today.

## User workflow override

These rules override the generated Beads session-completion protocol below unless the user explicitly says otherwise in the current conversation.

- `git commit` and `git push` are allowed, but only on a non-`main` branch. Never commit or push directly to `main`.
- Never run `git merge`, merge a PR, or otherwise merge a branch into `main` (or any branch) on the user's behalf.
- Do not run `git pull`, `git pull --rebase`, or other history-rewriting/sync commands unless the user explicitly asks.
- If work happens on `main` (or a detached/unclear branch), stop and ask the user to create/checkout a feature branch before committing.
- Do not run build/export commands as verification, including `bun run build:web`, `bunx expo export`, or equivalent Expo/Metro production builds.
- Prefer lightweight checks such as focused source inspection, `rg`, or lint/type checks when the user asks for verification. Ask first before running heavier commands.
- After finishing all changes and pushing the branch, open a **draft** PR (`gh pr create --draft`) — never a real/ready PR.
- Before opening the PR, search GitHub Issues (Timber project) for the issue(s) the changes belong to. If none exists, create one — a PR may link more than one issue.
- Issues follow an epic/child structure. Never create an epic. Only ever create a **child** issue, under an existing epic.
- If it's unclear which epic or which child issue the changes belong to, stop and ask the user before creating anything or opening the PR.

## Architecture

### Workspace layout

npm workspaces (`workspaces: ["apps/*", "packages/*"]` in the root `package.json`; the field is bun-compatible verbatim). The root package holds no application code — only scripts, shared dev tooling, and the `overrides` block.

```
apps/mobile/        @timber/mobile   — the Expo app
apps/api/           @timber/api      — the Cloudflare Worker (Hono) privileged API
apps/wear/          (Gradle, no npm package) — the Wear OS app
packages/contract/  @timber/contract — the client/server wire contract
tools/              repo-scoped Node scripts (no package of their own)
docs/
```

`apps/api` is deliberately liftable: it has its own `package.json`, `tsconfig.json`, and `wrangler.toml`, deploys as its own Cloudflare Worker, and its only workspace dependency is `@timber/contract`. Removing that one dependency (vendoring whatever schemas it still needs into `apps/api/src/`) makes the directory standalone. **Do not add an `apps/mobile` dependency to it, and do not import across from `apps/mobile` into it.**

`apps/api/src/worker.ts` is the whole entry point: one Hono app, `export default { fetch: app.fetch }`. Runtime is workerd, not Node — no `node:` builtins, no filesystem, and config arrives as a `WorkerBindings` env object rather than `process.env` (`src/runtime-env.ts` bridges it for the modules that still read env lazily). Relative imports carry the `.js` extension because the package is `"type": "module"`.

### Mobile app

Expo Router (file-based routing, typed routes), TypeScript, React 19 / React Native 0.81, new architecture enabled.

`apps/mobile/tsconfig.json` maps `@/*` to `["./src/*", "./*"]` — src/ first, package root as fallback. So `@/lib/x` → `src/lib/x`, while `@/app/...`, `@/widgets/...` and `@/modules/...` resolve at the package root, where expo-router, the Android widget registry, and Expo autolinking all require them to stay.

```
apps/mobile/app/        expo-router routes (name is fixed by the router)
apps/mobile/src/ui/     components; src/ui/primitives/ holds the low-level ones
apps/mobile/src/data/   local SQLite + repositories; src/data/remote/ is the API-backed side
apps/mobile/src/lib/    non-UI helpers
apps/mobile/src/{hooks,context,constants,types,config}/
apps/mobile/{assets,modules,plugins,targets,widgets}/   must stay at the package root
```

`apps/mobile/metro.config.js` is required, not optional: Metro must watch the workspace root and resolve from both `node_modules` trees, because the installer hoists dependencies upward. Without it `@timber/contract` does not resolve and edits to it never trigger a rebuild.

The web bundle deploys from the Vercel project `timber` with **Root Directory `apps/mobile`** and "include files outside the root directory" on (the build needs `packages/contract` and the workspace-root `bun.lock`). `apps/mobile/vercel.json` owns the build command, output directory, and SPA rewrites — it overrides the dashboard settings, so keep deploy config there rather than in Vercel's UI. `EXPO_PUBLIC_API_BASE_URL` must point at the Worker origin; there is no same-origin `/api/*` anymore.

### Navigation / auth gating

`apps/mobile/app/_layout.tsx` wraps everything in `AuthProvider` (`apps/mobile/src/context/auth-context.tsx`, Firebase email/password + phone auth) and does redirect gating in one place based on three pieces of state: Firebase `user`, whether onboarding was seen (`AsyncStorage` key `pumppal_onboarding_seen`), and whether the user's Firestore doc (`users/{uid}`) has a valid `workoutSplit.type` (see `apps/mobile/src/constants/split-options.ts`). Route groups:

- `(auth)` — welcome/sign-in/sign-up/phone-auth, shown when logged out
- `set-split` — forced first-run screen when logged in but no split chosen yet
- `(tabs)` — main app (Home/index, Analytics, TPC pushup-challenge, Settings; `workouts` tab exists as a screen but is hidden from the tab bar via `href: null`, reachable from a button on Home)

### Firebase

`apps/mobile/src/config/firebase.ts` initializes a single Firebase app from `EXPO_PUBLIC_FIREBASE_*` env vars (see `apps/mobile/.env.example.eas` for native and `apps/mobile/.env.example.vercel` for web; the API's server-only vars are in `apps/api/.env.example`), with `initializeAuth`+AsyncStorage persistence falling back to `getAuth` (needed because Fast Refresh re-invokes `initializeAuth` on an already-initialized app). Firestore project is `pumppal-c9199`.

The app reads/writes workouts exclusively at the canonical top-level path: `exercises/{exerciseId}` (catalog with variations), `workouts/{workoutId}` (has a `userId` field, set-by-set `performedExercises[].sets`), and `exerciseCatalogMeta/current` for cache invalidation. Full schema reference: `docs/data-model/README.md`. The only remaining touch of the legacy `users/{uid}/workouts/{workoutId}` path is in `apps/mobile/app/(tabs)/settings.tsx`'s account-deletion flow, which intentionally also purges the old subcollection as part of a full account wipe.

### Exercise-catalog tooling (`tools/catalog/`)

Node scripts (not part of the app bundle) that own the exercise catalog. `tools/catalog/catalog-seed.json` is the checked-in source of truth for the catalog's contents; `seed-exercise-catalog.js` (`bun run catalog:seed`) validates it and upserts it into Firestore, and `review-pending-exercises.js` (`bun run catalog:review`) promotes user submissions from the `/api/catalog/pending` route into that file. Both are dry-run by default and need an explicit `--apply` to write. `canonical-muscles.js` is a hand-maintained CommonJS mirror of `apps/mobile/src/constants/muscles.ts`; `bun run test:catalog-tools` fails if the two drift.

The one-off legacy → canonical Firestore migration scripts are finished and have been removed; recover them from git history (`scripts/migration/`) if a legacy question ever needs them. The shape they left behind is documented in `docs/data-model/legacy.md`.

### The API service (`apps/api`)

`apps/api/src/worker.ts` builds the whole Hono app in one file: two middlewares then the route table. The first (`app.use('*')`) does runtime-env wiring, CORS origin check, and request logging; the second (`app.use('/api/*')`) does Firebase ID-token verification plus App Check, setting `uid` for every handler below it. `app.onError` funnels throws through `ApiError` (`src/errors.ts`), which is the only place a status/code pair is chosen.

The `API_ALLOWED_ORIGINS` allowlist is required for any browser caller: the web bundle deploys to a different origin than the Worker, so a missing entry means a `403 origin_denied` before auth even runs. Native calls send no `Origin` and skip CORS entirely. Values live in `wrangler.toml` under `[env.preview.vars]` / `[env.production.vars]`; secrets (`FIREBASE_PRIVATE_KEY`, provider keys) are Worker secrets, never in the file. `.dev.vars` covers local `wrangler dev`.

**Only privileged operations live here.** Owner-safe reads and writes go direct to Firestore from the client under `firestore.rules`. Routes that moved are kept as tombstones at the bottom of `worker.ts` (`/api/workouts/*`, `/api/sync/*`, `GET /api/profile`, …) returning `410 client_upgrade_required` — they stay behind auth so a stale client gets an actionable error without the Worker becoming a public route oracle. Exact routes registered above win over them; do not add a tombstone above a real route.

**No AI provider key exists on the client.** All generation runs through this service; an `EXPO_PUBLIC_*` key would be inlined into every APK and web bundle by Metro. Do not reintroduce one.

**The package boundary replaces the old import-direction check.** `apps/api` cannot reach `apps/mobile` — separate package, no dependency, no relative path between them — so `scripts/check-api-isolation.js` was deleted rather than repathed. What is *not* structural is dependency leakage: the installer hoists everything into the root `node_modules`, so a mobile file could still resolve `ai` (or an API file `firebase`) without declaring it. `tools/check-boundary-isolation.js` is the only thing that catches that; `bun run test:tools` runs it. This still holds under bun: `bunfig.toml` pins `linker = "hoisted"` explicitly, so the check's whole reason to exist — a real, flat `node_modules` tree a stray import can reach into — stays true. If you need an app constant server-side, move it to `packages/contract` or send it as request data (this is why the client supplies `regionList`, not just `volumeTable`).

### AI features

- `packages/contract/src/api-contract.ts` is the source of truth for the whole domain REST API's wire format — the DTOs, inputs, and response envelopes every route and every client repository share. `packages/contract/src/ai-contract.ts` covers only the four AI operations. The package exports source `.ts` through its `exports` map (`@timber/contract/api`, `/ai`, `/username`) with no build step: Metro transpiles TS directly and Wrangler bundles it for the Worker, so a `dist/` would only add a watch-mode rebuild.
- `packages/contract/src/ai-contract.ts` holds one `AI_OPS` table with an input and output zod schema per operation (`muscle-analysis`, `workout-completion`, `split-names`, `daily-name`), with the TS types derived via `z.infer`. The same `output` schema constrains generation server-side and types the client's return value, so the two cannot drift. Clients send structured input, never a raw prompt. Must stay free of Expo/React Native imports — both sides import it.
- `apps/api/src/auth.ts` verifies the caller's Firebase ID token with `jose` against Google's cached JWKS. `algorithms: ['RS256']` is pinned deliberately; without the pin a JWT library can be tricked into accepting `alg: none`. **Known ceiling:** no revocation check, so a signed-out or disabled account keeps working until its token expires (≤1h).
- `apps/api/src/ai/` (`model.ts`, `prompts.ts`) owns provider registration and the four prompt templates. No Firestore, no auth.
- `apps/api/src/store/` (`rest.ts`, `quota.ts`, `daily-name.ts`) talks to Firestore over the REST API, authenticating with a service-account OAuth2 token minted by `jose` from the same `FIREBASE_*` env vars. No AI. This replaced `firebase-admin`, whose gRPC dependency tree was ~16MB and dominated cold start. The service-account credential **still bypasses `firestore.rules`**, same as the Admin SDK did — that is a property of the credential, not the SDK.
  - Every write must carry `updateMask`. Without it a Firestore `:commit` **replaces the whole document** instead of merging.
  - `quota.ts` enforces `TEMPORARY_AI_DAILY_LIMIT` against `users/{uid}.aiUsage` using an `updateTime` precondition with retry, not a transaction.
- The `POST /api/ai` handler in `apps/api/src/worker.ts` is the only place auth, `ai/`, and `store/` meet. It `await import()`s `./ai/prompts.js` inside the handler so the provider SDK never loads on a non-AI request.
- **AI is opt-in and off by default.** `users/{uid}.aiEnabled` gates it (see [docs/data-model/users.md](docs/data-model/users.md#ai-opt-in)); absent means off, for existing accounts too. The Worker refuses `POST /api/ai` and `GET /api/ai/quota` with `403 ai_disabled` unless it is literally `true` (`readAIEnabled` in `apps/api/src/store/quota.ts`) — that check, not the client, is the enforcement. Any new AI surface must hide itself behind `useAIEnabled()` (`apps/mobile/src/lib/use-ai-enabled.ts`), and any new AI route must call `assertAIEnabled`.
- `apps/mobile/src/lib/ai-client.ts` (`callAI`) is the only client-side entry point; it attaches a Firebase ID token and throws `AIDisabledError` before the request when the account has not opted in — which is what covers the AI paths with no UI to hide (`loadSplitNames`, `getDailyName`).
- The AI features still live in `apps/mobile/src/lib/muscle-analysis.ts`, `apps/mobile/src/lib/workout-suggestions.ts`, and `apps/mobile/src/lib/daily-name.ts`, which compute summaries locally and call `callAI`. They consume the canonical `performedExercises[].sets` shape from `@/types/workout`.

### Firestore security rules

`firestore.rules` (wired up by `firebase.json`) is the source of truth; deploy with `npx firebase-tools@latest deploy --only firestore:rules`. Composite indexes are a **separate deploy target** — `npx firebase-tools@latest deploy --only firestore:indexes` — and any new direct client query combining a `where` with an `orderBy` on another field needs an entry in `firestore.indexes.json` first, or Firestore answers `400 FAILED_PRECONDITION` (see [docs/data-model/README.md](docs/data-model/README.md)). `exercises`, `exerciseCatalogMeta`, and `random` are client-read-only, and `users/{uid}.aiUsage` cannot be written by the client. On `users/{uid}` the client may write exactly two fields — `workoutSplit` and `aiEnabled` — and both the rules and `directProfilePatchInput` enforce that list; widening it means touching `firestore.rules`, the contract schema, and the `updateMask` in `apps/mobile/src/data/firestore-sync-remote.ts`'s `profile.write`.

### Theming

`apps/mobile/src/constants/theme.ts` + `apps/mobile/src/hooks/use-color-scheme(.web).ts` + `apps/mobile/src/hooks/use-theme-color.ts` drive light/dark theming consumed by `apps/mobile/src/ui/themed-text.tsx` / `apps/mobile/src/ui/themed-view.tsx`. Tab bar and accent colors are currently hardcoded dark-style values in `apps/mobile/app/(tabs)/_layout.tsx` rather than pulled from the theme constants.

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

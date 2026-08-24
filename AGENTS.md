## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Issue tracking

Current and future work for this repo is tracked in **GitHub Issues**, project "Timber". Check there for open work items, planned features, and known bugs before starting new work.

## Workspace layout

npm workspaces (bun-compatible). The root package holds no application code — commands run from the root and delegate.

```
apps/mobile/        @timber/mobile   — Expo app; routes in app/, the rest in src/{ui,data,lib,hooks,context,constants,types,config}/
apps/api/           @timber/api      — privileged API, its own Cloudflare Worker (Hono); entry src/worker.ts, config wrangler.toml
apps/wear/          Wear OS app (Gradle, not an npm package)
packages/contract/  @timber/contract — client/server wire schemas shared by both
tools/              repo-scoped Node scripts, incl. tools/catalog/ for the exercise catalog
```

`apps/api` must stay liftable: its only workspace dependency is `@timber/contract`. Never import from `apps/mobile` into it. `apps/mobile/tsconfig.json` maps `@/*` to `["./src/*", "./*"]`. Full detail in [CLAUDE.md](CLAUDE.md#architecture).

## Source-of-truth docs

Read these before changing the app. They take precedence over patterns you find in the code.

- **[docs/purpose.md](docs/purpose.md)** — why Timber exists, what it optimizes for, non-goals, and the decision rules for judging a change. Consult before adding, removing, or reshaping a feature.
- **[docs/design-language.md](docs/design-language.md)** — color/type/spacing tokens, component recipes, motion, copy voice, accessibility. Consult before writing any UI. It is prescriptive, not descriptive: the code has known drift, listed in its appendix. Use the spec's values, not whatever the neighbouring file happens to do.
  - **Hard rule:** its [off-limits list](docs/design-language.md#off-limits-generic-ai-generated-design) names generic AI-generated design tropes (gradient/glass surfaces, sparkle-as-AI, bento stat grids, "elevate your fitness journey" copy). These are banned by default. If a request calls for one, do **not** silently comply and do **not** silently substitute — stop, name the pattern, and ask the user with explicit non-trope alternatives. Implement it only if the user explicitly picks it after seeing them, then record the exception.
- **[docs/data-model/README.md](docs/data-model/README.md)** — Firestore schema as it exists today.

## User workflow override

These rules override the generated Beads session-completion protocol below unless the user explicitly says otherwise in the current conversation.

- `git commit` and `git push` are allowed, but only on a non-`main` branch. Never commit or push directly to `main`.
- Never run `git merge`, merge a PR, or otherwise merge a branch into `main` (or any branch) on the user's behalf.
- Do not run `git pull`, `git pull --rebase`, or other history-rewriting/sync commands unless the user explicitly asks.
- If work happens on `main` (or a detached/unclear branch), stop and ask the user to create/checkout a feature branch before committing.
- Do not run build/export commands as verification, including `bun run build:web`, `bunx expo export`, or equivalent Expo/Metro production builds.
- Prefer lightweight checks such as focused source inspection, `rg`, or lint/type checks when the user asks for verification. Ask first before running heavier commands.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:970c3bf2 -->
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
   bd dolt push
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->

<!-- BEGIN BEADS CODEX SETUP: generated by bd setup codex -->
## Beads Issue Tracker

Use Beads (`bd`) for durable task tracking in repositories that include it. Use the `beads` skill at `.agents/skills/beads/SKILL.md` (project install) or `~/.agents/skills/beads/SKILL.md` (global install) for Beads workflow guidance, then use the `bd` CLI for issue operations.

### Quick Reference

```bash
bd ready                # Find available work
bd show <id>            # View issue details
bd update <id> --claim  # Claim work
bd close <id>           # Complete work
bd prime                # Refresh Beads context
```

### Rules

- Use `bd` for all task tracking; do not create markdown TODO lists.
- Run `bd prime` when Beads context is missing or stale. Codex 0.129.0+ can load Beads context automatically through native hooks; use `/hooks` to inspect or toggle them.
- Keep persistent project memory in Beads via `bd remember`; do not create ad hoc memory files.

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.
<!-- END BEADS CODEX SETUP -->

# Graph Report - .  (2026-07-08)

## Corpus Check
- 40 files · ~168,656 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 641 nodes · 1017 edges · 46 communities (29 shown, 17 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 48 edges (avg confidence: 0.68)
- Token cost: 92,821 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_App Tab Screens|App Tab Screens]]
- [[_COMMUNITY_Auth & Onboarding Flow|Auth & Onboarding Flow]]
- [[_COMMUNITY_Migration Review Builder|Migration Review Builder]]
- [[_COMMUNITY_App Config (app.json)|App Config (app.json)]]
- [[_COMMUNITY_Muscle Data Tests|Muscle Data Tests]]
- [[_COMMUNITY_Firestore Snapshot Script|Firestore Snapshot Script]]
- [[_COMMUNITY_NPM Dependencies|NPM Dependencies]]
- [[_COMMUNITY_Exercise Catalog Docs|Exercise Catalog Docs]]
- [[_COMMUNITY_V2 Migration Builder|V2 Migration Builder]]
- [[_COMMUNITY_Exercise Inventory Builder|Exercise Inventory Builder]]
- [[_COMMUNITY_NPM Scripts & Devdeps|NPM Scripts & Devdeps]]
- [[_COMMUNITY_Themed UI Components|Themed UI Components]]
- [[_COMMUNITY_Firestore V2 Writer|Firestore V2 Writer]]
- [[_COMMUNITY_Legacy Workout Conversion|Legacy Workout Conversion]]
- [[_COMMUNITY_Pushup Challenge Feature|Pushup Challenge Feature]]
- [[_COMMUNITY_Phone Auth & reCAPTCHA|Phone Auth & reCAPTCHA]]
- [[_COMMUNITY_Reset Project Script|Reset Project Script]]
- [[_COMMUNITY_Beads & Session Policy|Beads & Session Policy]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Muscle Taxonomy Module|Muscle Taxonomy Module]]
- [[_COMMUNITY_Welcome Screen|Welcome Screen]]
- [[_COMMUNITY_Project README|Project README]]
- [[_COMMUNITY_Vercel Deploy Config|Vercel Deploy Config]]
- [[_COMMUNITY_Tab Bar Layout|Tab Bar Layout]]
- [[_COMMUNITY_External Link Component|External Link Component]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_Graphify Policy Note|Graphify Policy Note]]
- [[_COMMUNITY_Android Icon Assets|Android Icon Assets]]
- [[_COMMUNITY_App Branding Assets|App Branding Assets]]
- [[_COMMUNITY_Beads Post-Checkout Hook|Beads Post-Checkout Hook]]
- [[_COMMUNITY_Beads Post-Merge Hook|Beads Post-Merge Hook]]
- [[_COMMUNITY_Beads Pre-Commit Hook|Beads Pre-Commit Hook]]
- [[_COMMUNITY_Beads Pre-Push Hook|Beads Pre-Push Hook]]
- [[_COMMUNITY_Beads Commit-Msg Hook|Beads Commit-Msg Hook]]
- [[_COMMUNITY_CLAUDE.md Arch & Theming|CLAUDE.md Arch & Theming]]
- [[_COMMUNITY_Schema Versioning Concept|Schema Versioning Concept]]
- [[_COMMUNITY_Android Icon Foreground|Android Icon Foreground]]
- [[_COMMUNITY_Android Icon Monochrome|Android Icon Monochrome]]
- [[_COMMUNITY_App Icon Asset|App Icon Asset]]
- [[_COMMUNITY_README Env Example|README Env Example]]

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 19 edges
2. `toDateObj()` - 18 edges
3. `expo` - 17 edges
4. `scripts` - 16 edges
5. `Workout` - 14 edges
6. `buildPlan()` - 11 edges
7. `AddWorkoutModal()` - 10 edges
8. `exerciseLabel()` - 10 edges
9. `PushupChallengeScreen()` - 9 edges
10. `main()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Graphify Knowledge Graph Rules (CLAUDE.md)` --semantically_similar_to--> `Graphify Knowledge Graph Rules (AGENTS.md)`  [INFERRED] [semantically similar]
  CLAUDE.md → AGENTS.md
- `User Workflow Override (CLAUDE.md)` --semantically_similar_to--> `User Workflow Override (AGENTS.md)`  [INFERRED] [semantically similar]
  CLAUDE.md → AGENTS.md
- `Beads Issue Tracker Rules (CLAUDE.md)` --semantically_similar_to--> `Beads Issue Tracker Rules (AGENTS.md)`  [INFERRED] [semantically similar]
  CLAUDE.md → AGENTS.md
- `Session Completion Protocol (CLAUDE.md)` --semantically_similar_to--> `Session Completion Protocol (AGENTS.md)`  [INFERRED] [semantically similar]
  CLAUDE.md → AGENTS.md
- `SettingsScreen()` --indirect_call--> `variation()`  [INFERRED]
  app/(tabs)/settings.tsx → scripts/migration/build-reviewed-migration-files.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Account Deletion Flow Across Collections** — docs_data_model_users_account_deletion, docs_data_model_legacy_account_deletion_touchpoint, docs_data_model_pushup_challenge_account_deletion, docs_data_model_workouts_workout_doc [EXTRACTED 0.90]
- **Legacy-to-Canonical Workout Schema Migration** — docs_data_model_exercises_exercise_catalog, docs_data_model_workouts_workout_doc, docs_data_model_legacy_legacy_workout, docs_firestore_data_refactor_migration_history [EXTRACTED 0.90]
- **Graphify/Beads/Workflow Project Policies** — claude_graphify, claude_user_workflow_override, claude_beads_issue_tracker, claude_session_completion [EXTRACTED 0.85]

## Communities (46 total, 17 thin omitted)

### Community 0 - "App Tab Screens"
Cohesion: 0.06
Nodes (69): AddWorkoutModal(), styles, AnalyticsScreen(), styles, HomeScreen(), styles, styles, InsightsCache (+61 more)

### Community 1 - "Auth & Onboarding Flow"
Cohesion: 0.08
Nodes (34): SignInScreen(), styles, SignUpScreen(), styles, RootLayoutNav(), unstable_settings, SetSplitScreen(), styles (+26 more)

### Community 2 - "Migration Review Builder"
Cohesion: 0.06
Nodes (38): byName, catalog, catalogSeed, decisions, exercise(), fs, inventory, mapping (+30 more)

### Community 3 - "App Config (app.json)"
Cohesion: 0.05
Nodes (38): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, edgeToEdgeEnabled, package, predictiveBackGestureEnabled (+30 more)

### Community 4 - "Muscle Data Tests"
Cohesion: 0.07
Nodes (35): MUSCLE_IDS, assert, fs, match, { MUSCLE_IDS }, path, tsMuscleIds, tsSource (+27 more)

### Community 5 - "Firestore Snapshot Script"
Cohesion: 0.09
Nodes (37): base64url(), createJwt(), crypto, docId(), fieldsToJs(), firestoreValueToJs(), fs, getAccessToken() (+29 more)

### Community 6 - "NPM Dependencies"
Cohesion: 0.05
Nodes (37): dependencies, expo, expo-constants, expo-file-system, expo-font, expo-haptics, expo-image, expo-linear-gradient (+29 more)

### Community 7 - "Exercise Catalog Docs"
Cohesion: 0.08
Nodes (35): AI Features (Google Gemini), Firebase Setup and Canonical Firestore Paths, Migration Scripts, Navigation / Auth Gating, CatalogExercise / exercises/{exerciseId}, exerciseCatalogMeta/current, Exercise Picker (flattened search UX), ExerciseVariation (embedded) (+27 more)

### Community 8 - "V2 Migration Builder"
Cohesion: 0.12
Nodes (30): blocker(), buildUsageFlags(), buildV2Artifacts(), cleanUndefined(), collectSource(), countMappedExerciseIds(), EXERCISES_OUT, EXPORT_FILE (+22 more)

### Community 9 - "Exercise Inventory Builder"
Cohesion: 0.13
Nodes (26): buildInventory(), buildMapping(), buildReviewWarnings(), compactCounts(), csvCell(), documentIdFromPath(), EXPORT_FILE, fs (+18 more)

### Community 10 - "NPM Scripts & Devdeps"
Cohesion: 0.08
Nodes (25): devDependencies, eslint, eslint-config-expo, @types/react, typescript, main, name, private (+17 more)

### Community 11 - "Themed UI Components"
Cohesion: 0.14
Nodes (16): ParallaxScrollView(), Props, styles, styles, ThemedText(), ThemedTextProps, ThemedView(), ThemedViewProps (+8 more)

### Community 12 - "Firestore V2 Writer"
Cohesion: 0.13
Nodes (21): commitWrites(), documentRoot(), encodeFields(), encodePathSegments(), encodeValue(), { execFileSync }, EXERCISES_FILE, fs (+13 more)

### Community 13 - "Legacy Workout Conversion"
Cohesion: 0.15
Nodes (18): convertLegacyExercise(), convertLegacyWorkout(), durationSeconds(), assert, { convertedWorkout, report }, { convertLegacyWorkout }, mappingsByLegacyName, compareTotals() (+10 more)

### Community 14 - "Pushup Challenge Feature"
Cohesion: 0.18
Nodes (15): buildTimeline(), ChallengeData, ChallengeDay, currentStreakLength(), formatDate(), formatTime(), isStreakAlive(), PushupChallengeScreen() (+7 more)

### Community 15 - "Phone Auth & reCAPTCHA"
Cohesion: 0.24
Nodes (8): getCallingCode(), PhoneAuthScreen(), REGION_TO_CALLING_CODE, styles, FirebaseRecaptchaVerifierModal, FirebaseRecaptchaVerifierModalRef, Props, styles

### Community 16 - "Reset Project Script"
Cohesion: 0.22
Nodes (7): exampleDirPath, fs, oldDirs, path, readline, rl, root

### Community 17 - "Beads & Session Policy"
Cohesion: 0.32
Nodes (8): Beads Configuration File, Beads Issue Tracker (tool), Beads Issue Tracker Rules (AGENTS.md), Session Completion Protocol (AGENTS.md), User Workflow Override (AGENTS.md), Beads Issue Tracker Rules (CLAUDE.md), Session Completion Protocol (CLAUDE.md), User Workflow Override (CLAUDE.md)

### Community 18 - "TypeScript Config"
Cohesion: 0.29
Nodes (6): compilerOptions, paths, strict, extends, include, @/*

### Community 19 - "Muscle Taxonomy Module"
Cohesion: 0.47
Nodes (5): isMuscleId(), MUSCLE_SET, MuscleId, muscleLabel(), MUSCLES

### Community 20 - "Welcome Screen"
Cohesion: 0.40
Nodes (3): Slide, SLIDES, styles

### Community 21 - "Project README"
Cohesion: 0.40
Nodes (4): Architecture, Other commands, Pump Pal, Setup

### Community 22 - "Vercel Deploy Config"
Cohesion: 0.40
Nodes (4): buildCommand, cleanUrls, outputDirectory, rewrites

## Knowledge Gaps
- **272 isolated node(s):** `name`, `slug`, `version`, `orientation`, `icon` (+267 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SettingsScreen()` connect `Auth & Onboarding Flow` to `App Tab Screens`, `App Config (app.json)`?**
  _High betweenness centrality (0.314) - this node is a cross-community bridge._
- **Why does `exercise()` connect `Migration Review Builder` to `V2 Migration Builder`, `Legacy Workout Conversion`?**
  _High betweenness centrality (0.308) - this node is a cross-community bridge._
- **Why does `variation()` connect `Auth & Onboarding Flow` to `Migration Review Builder`?**
  _High betweenness centrality (0.269) - this node is a cross-community bridge._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _276 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Tab Screens` be split into smaller, more focused modules?**
  _Cohesion score 0.06134453781512605 - nodes in this community are weakly interconnected._
- **Should `Auth & Onboarding Flow` be split into smaller, more focused modules?**
  _Cohesion score 0.08163265306122448 - nodes in this community are weakly interconnected._
- **Should `Migration Review Builder` be split into smaller, more focused modules?**
  _Cohesion score 0.05990338164251208 - nodes in this community are weakly interconnected._
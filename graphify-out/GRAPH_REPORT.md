# Graph Report - pump-pal  (2026-07-23)

## Corpus Check
- 125 files · ~77,215 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 839 nodes · 1468 edges · 82 communities (44 shown, 38 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 39 edges (avg confidence: 0.6)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b1c4f6df`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_App Tab Screens|App Tab Screens]]
- [[_COMMUNITY_settings-injuries.tsx|settings-injuries.tsx]]
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
- [[_COMMUNITY_seed-exercise-catalog.js|seed-exercise-catalog.js]]
- [[_COMMUNITY_Welcome Screen|Welcome Screen]]
- [[_COMMUNITY_Project README|Project README]]
- [[_COMMUNITY_Vercel Deploy Config|Vercel Deploy Config]]
- [[_COMMUNITY_Tab Bar Layout|Tab Bar Layout]]
- [[_COMMUNITY_External Link Component|External Link Component]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_build-reviewed-migration-files.js|build-reviewed-migration-files.js]]
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
- [[_COMMUNITY_exercise-catalog.ts|exercise-catalog.ts]]
- [[_COMMUNITY_Beads Configuration File|Beads Configuration File]]
- [[_COMMUNITY_Migration Scripts|Migration Scripts]]
- [[_COMMUNITY_exerciseCatalogMetacurrent|exerciseCatalogMeta/current]]
- [[_COMMUNITY_Exercise Picker (flattened search UX)|Exercise Picker (flattened search UX)]]
- [[_COMMUNITY_ExerciseVariation (embedded)|ExerciseVariation (embedded)]]
- [[_COMMUNITY_seed-exercise-catalog.js|seed-exercise-catalog.js]]
- [[_COMMUNITY_Stale TrackingMode Type (known issue)|Stale TrackingMode Type (known issue)]]
- [[_COMMUNITY_Legacy Subcollection Account-Deletion Touchpoint|Legacy Subcollection Account-Deletion Touchpoint]]
- [[_COMMUNITY_LegacyWorkout  users{uid}workouts{oldWorkoutId}|LegacyWorkout / users/{uid}/workouts/{oldWorkoutId}]]
- [[_COMMUNITY_No-Delete-Outside-Account-Deletion Policy|No-Delete-Outside-Account-Deletion Policy]]
- [[_COMMUNITY_Pushup Challenge Account-Deletion Cleanup|Pushup Challenge Account-Deletion Cleanup]]
- [[_COMMUNITY_ChallengeData  users{uid}pushup-challengedata|ChallengeData / users/{uid}/pushup-challenge/data]]
- [[_COMMUNITY_Pump Pal Data Model (index doc)|Pump Pal Data Model (index doc)]]
- [[_COMMUNITY_Deterministic IDs Convention|Deterministic IDs Convention]]
- [[_COMMUNITY_schemaVersion 2 Convention|schemaVersion: 2 Convention]]
- [[_COMMUNITY_Doc Created On Onboarding Completion|Doc Created On Onboarding Completion]]
- [[_COMMUNITY_UserDoc  users{uid}|UserDoc / users/{uid}]]
- [[_COMMUNITY_Workout.date Multi-Shape Handling|Workout.date Multi-Shape Handling]]
- [[_COMMUNITY_MigrationSource|MigrationSource]]
- [[_COMMUNITY_PerformedExercise  PerformedSet|PerformedExercise / PerformedSet]]
- [[_COMMUNITY_Workout  workouts{workoutId}|Workout / workouts/{workoutId}]]
- [[_COMMUNITY_Legacy Data Still Present Section|Legacy Data Still Present Section]]
- [[_COMMUNITY_Firestore Data Refactor Migration History|Firestore Data Refactor Migration History]]
- [[_COMMUNITY_Dev Build Guide (Android)|Dev Build Guide (Android)]]
- [[_COMMUNITY_catalog-seed.test.js|catalog-seed.test.js]]
- [[_COMMUNITY_workout-prefill-loader.tsx|workout-prefill-loader.tsx]]
- [[_COMMUNITY_devDependencies|devDependencies]]
- [[_COMMUNITY_package.json|package.json]]
- [[_COMMUNITY_workout-conversion.ts|workout-conversion.ts]]
- [[_COMMUNITY_index.tsx|index.tsx]]
- [[_COMMUNITY_active-workout.tsx|active-workout.tsx]]
- [[_COMMUNITY_workout-notification.android.ts|workout-notification.android.ts]]
- [[_COMMUNITY_SDD Progress — Retroactive Injury ApplyRemove|SDD Progress — Retroactive Injury Apply/Remove]]
- [[_COMMUNITY_experiments|experiments]]

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 37 edges
2. `toDateObj()` - 25 edges
3. `AddWorkoutModal()` - 21 edges
4. `ActiveWorkoutScreen()` - 18 edges
5. `db` - 18 edges
6. `expo` - 17 edges
7. `scripts` - 17 edges
8. `Workout` - 16 edges
9. `isSplitOption()` - 14 edges
10. `SettingsInjuriesScreen()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `AddWorkoutModal()` --indirect_call--> `todayUTC()`  [INFERRED]
  app/modal.tsx → utils/daily-name.ts
- `SettingsAppScreen()` --indirect_call--> `variation()`  [INFERRED]
  app/settings-app.tsx → scripts/migration/build-reviewed-migration-files.js
- `Props` --references--> `Workout`  [EXTRACTED]
  components/muscle-insight-cards.tsx → types/workout.ts
- `analyzeMuscles()` --references--> `output`  [EXTRACTED]
  utils/muscle-analysis.ts → app.json
- `generateSplitWorkoutNames()` --references--> `output`  [EXTRACTED]
  utils/workout-suggestions.ts → app.json

## Import Cycles
- None detected.

## Communities (82 total, 38 thin omitted)

### Community 0 - "App Tab Screens"
Cohesion: 0.17
Nodes (17): compareExerciseLabels(), ExercisePicker(), ExercisePickerProps, Sheet, SheetHandle, SheetProps, styles, useExerciseCatalog() (+9 more)

### Community 1 - "settings-injuries.tsx"
Cohesion: 0.10
Nodes (27): atNoon(), cap(), labelToSide(), newId(), SettingsInjuriesScreen(), SEVERITIES, SIDE_OPTIONS, styles (+19 more)

### Community 2 - "Migration Review Builder"
Cohesion: 0.09
Nodes (30): exercise(), fs, generateMappingDraft(), guessExerciseId(), path, run(), slugify(), addToMapSet() (+22 more)

### Community 3 - "App Config (app.json)"
Cohesion: 0.15
Nodes (12): expo, icon, name, newArchEnabled, orientation, plugins, runtimeVersion, scheme (+4 more)

### Community 4 - "Muscle Data Tests"
Cohesion: 0.20
Nodes (9): MUSCLE_IDS, assert, fs, match, { MUSCLE_IDS }, path, tsMuscleIds, tsSource (+1 more)

### Community 5 - "Firestore Snapshot Script"
Cohesion: 0.15
Nodes (22): firestoreTimestamp(), timestampShapeToIso(), buildPlan(), compareTotals(), { convertLegacyWorkout }, crypto, { firestoreTimestamp, patchDocument, timestampShapeToIso }, flattenSnapshot() (+14 more)

### Community 6 - "NPM Dependencies"
Cohesion: 0.04
Nodes (45): dependencies, ai, @ai-sdk/google, expo, expo-constants, expo-dev-client, expo-file-system, expo-font (+37 more)

### Community 7 - "Exercise Catalog Docs"
Cohesion: 0.07
Nodes (28): Doc ID convention, Exercise Catalog, Exercise picker (why the shape is flattened at read time), `exerciseCatalogMeta/current`, `ExerciseVariation` (embedded, not a separate doc), Muscle taxonomy, Shape, Validation (+20 more)

### Community 8 - "V2 Migration Builder"
Cohesion: 0.12
Nodes (30): blocker(), buildUsageFlags(), buildV2Artifacts(), cleanUndefined(), collectSource(), countMappedExerciseIds(), EXERCISES_OUT, EXPORT_FILE (+22 more)

### Community 9 - "Exercise Inventory Builder"
Cohesion: 0.13
Nodes (26): buildInventory(), buildMapping(), buildReviewWarnings(), compactCounts(), csvCell(), documentIdFromPath(), EXPORT_FILE, fs (+18 more)

### Community 10 - "NPM Scripts & Devdeps"
Cohesion: 0.07
Nodes (27): devDependencies, eslint, eslint-config-expo, sharp, @types/react, typescript, main, name (+19 more)

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
Cohesion: 0.08
Nodes (37): buildTimeline(), ChallengeData, ChallengeDay, currentStreakLength(), formatDate(), formatTime(), isStreakAlive(), PushupChallengeScreen() (+29 more)

### Community 15 - "Phone Auth & reCAPTCHA"
Cohesion: 0.50
Nodes (4): updates, SettingsAppScreen(), url, variation()

### Community 16 - "Reset Project Script"
Cohesion: 0.22
Nodes (7): exampleDirPath, fs, oldDirs, path, readline, rl, root

### Community 17 - "Beads & Session Policy"
Cohesion: 0.29
Nodes (6): Beads Issue Tracker, graphify, Quick Reference, Rules, Session Completion, User workflow override

### Community 18 - "TypeScript Config"
Cohesion: 0.29
Nodes (6): compilerOptions, paths, strict, extends, include, @/*

### Community 19 - "seed-exercise-catalog.js"
Cohesion: 0.18
Nodes (17): buildExerciseDocument(), documentUrl(), fs, { getAccessToken, requestJson }, isFirestoreTimestamp(), jsObjectToFirestoreFields(), jsToFirestoreValue(), MUSCLE_ID_SET (+9 more)

### Community 20 - "Welcome Screen"
Cohesion: 0.33
Nodes (9): fs, IMAGES_DIR, log(), LOGS, main(), markSvg(), path, sharp (+1 more)

### Community 21 - "Project README"
Cohesion: 0.08
Nodes (21): AI features, Architecture, Beads Issue Tracker, Commands, Firebase, graphify, Migration scripts (`scripts/migration/`, `migration/`), Navigation / auth gating (+13 more)

### Community 22 - "Vercel Deploy Config"
Cohesion: 0.40
Nodes (4): buildCommand, cleanUrls, outputDirectory, rewrites

### Community 26 - "build-reviewed-migration-files.js"
Cohesion: 0.06
Nodes (40): getCallingCode(), PhoneAuthScreen(), REGION_TO_CALLING_CODE, styles, SignInScreen(), styles, SignUpScreen(), styles (+32 more)

### Community 35 - "CLAUDE.md Arch & Theming"
Cohesion: 0.22
Nodes (8): Beads - AI-Native Issue Tracking, Essential Commands, Get Started with Beads, Learn More, Quick Start, What is Beads?, Why Beads?, Working with Issues

### Community 38 - "Schema Versioning Concept"
Cohesion: 0.11
Nodes (18): Canonical Collections, Completed Work, Current Status, Exercise Picker UX, `exerciseCatalogMeta/current`, `exercises/{exerciseId}`, `ExerciseVariation`, Legacy Data Still Present (+10 more)

### Community 46 - "exercise-catalog.ts"
Cohesion: 0.22
Nodes (15): base64url(), createJwt(), crypto, docId(), fieldsToJs(), firestoreValueToJs(), fs, getAccessToken() (+7 more)

### Community 70 - "Dev Build Guide (Android)"
Cohesion: 0.20
Nodes (9): Daily loop (after the dev build is installed), Dev Build Guide (Android), One-time setup, Path A — Local build (`expo run:android`), Path B — Cloud build (EAS), Separate app from your "Timber" preview, Testing the workout notification, Troubleshooting (+1 more)

### Community 71 - "catalog-seed.test.js"
Cohesion: 0.20
Nodes (9): assert, catalog, catalogPath, errors, fs, { MUSCLE_IDS }, muscleIdSet, path (+1 more)

### Community 72 - "workout-prefill-loader.tsx"
Cohesion: 0.33
Nodes (5): LoadingPlateProps, PLATES, styles, WorkoutPrefillLoader(), WorkoutPrefillLoaderProps

### Community 73 - "devDependencies"
Cohesion: 0.17
Nodes (8): byName, catalog, catalogSeed, decisions, fs, inventory, mapping, path

### Community 74 - "package.json"
Cohesion: 0.18
Nodes (11): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, edgeToEdgeEnabled, package, permissions (+3 more)

### Community 76 - "workout-conversion.ts"
Cohesion: 0.06
Nodes (83): ActiveWorkoutScreen(), formatElapsed(), styles, WorkoutTimer(), AddWorkoutModal(), styles, PlannedWorkoutsScreen(), queueOrderCacheKey() (+75 more)

### Community 77 - "index.tsx"
Cohesion: 0.40
Nodes (5): web, description, favicon, name, output

### Community 78 - "active-workout.tsx"
Cohesion: 0.40
Nodes (5): ios, ITSAppUsesNonExemptEncryption, bundleIdentifier, infoPlist, supportsTablet

### Community 80 - "SDD Progress — Retroactive Injury Apply/Remove"
Cohesion: 0.50
Nodes (4): projectId, extra, eas, router

### Community 81 - "experiments"
Cohesion: 0.67
Nodes (3): reactCompiler, typedRoutes, experiments

## Knowledge Gaps
- **386 isolated node(s):** `name`, `slug`, `version`, `orientation`, `icon` (+381 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **38 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SettingsAppScreen()` connect `Phone Auth & reCAPTCHA` to `build-reviewed-migration-files.js`, `workout-conversion.ts`?**
  _High betweenness centrality (0.255) - this node is a cross-community bridge._
- **Why does `exercise()` connect `Migration Review Builder` to `V2 Migration Builder`, `devDependencies`, `seed-exercise-catalog.js`, `Legacy Workout Conversion`?**
  _High betweenness centrality (0.244) - this node is a cross-community bridge._
- **Why does `variation()` connect `Phone Auth & reCAPTCHA` to `devDependencies`?**
  _High betweenness centrality (0.226) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `AddWorkoutModal()` (e.g. with `todayUTC()` and `collapseSetsToDraft()`) actually correct?**
  _`AddWorkoutModal()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _392 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `settings-injuries.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10483870967741936 - nodes in this community are weakly interconnected._
- **Should `Migration Review Builder` be split into smaller, more focused modules?**
  _Cohesion score 0.08912655971479501 - nodes in this community are weakly interconnected._
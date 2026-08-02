# Graph Report - pump-pal  (2026-08-02)

## Corpus Check
- 136 files · ~84,402 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 997 nodes · 1720 edges · 133 communities (57 shown, 76 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.56)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ffdc437d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- pushup-challenge.tsx
- settings-injuries.tsx
- legacy-inventory.test.js
- expo
- canonical-muscles.test.js
- write-migrated-workouts.js
- dependencies
- data-model/README.md
- build-v2-migration.js
- build-exercise-inventory.js
- scripts
- collapsible.tsx
- write-v2-firestore.js
- dry-run-conversion.js
- muscle-analysis.ts
- android
- reset-project.js
- AGENTS.md
- include
- seed-exercise-catalog.js
- generate-icons.js
- CLAUDE.md
- vercel.json
- (tabs)/_layout.tsx
- workout.ts
- eslint.config.js
- active-workout.tsx
- web
- Android Adaptive Icon Background Layer
- favicon.png (Pump Pal web favicon)
- post-checkout
- post-merge
- pre-commit
- pre-push
- prepare-commit-msg
- Beads - AI-Native Issue Tracking
- Pump Pal Firestore Data Refactor
- Android Adaptive Icon Foreground
- Android Adaptive Icon Monochrome Layer
- App Icon (assets/images/icon.png) - stylized shield emblem with a metallic gray arm-wrestling match between a face-in-profile/dumbbell hybrid figure on the left and a muscular bicep/arm on the right, clasped hands at center, deep purple-magenta glow behind the artwork, dark near-black background
- oauth-config.ts
- .env.example
- firestore-readonly-snapshot.js
- Beads Configuration File
- Migration Scripts
- exerciseCatalogMeta/current
- Exercise Picker (flattened search UX)
- ExerciseVariation (embedded)
- seed-exercise-catalog.js
- Stale TrackingMode Type (known issue)
- Legacy Subcollection Account-Deletion Touchpoint
- LegacyWorkout / users/{uid}/workouts/{oldWorkoutId}
- No-Delete-Outside-Account-Deletion Policy
- Pushup Challenge Account-Deletion Cleanup
- ChallengeData / users/{uid}/pushup-challenge/data
- Pump Pal Data Model (index doc)
- Deterministic IDs Convention
- schemaVersion: 2 Convention
- Doc Created On Onboarding Completion
- UserDoc / users/{uid}
- Workout.date Multi-Shape Handling
- MigrationSource
- PerformedExercise / PerformedSet
- Workout / workouts/{workoutId}
- Legacy Data Still Present Section
- Firestore Data Refactor Migration History
- Dev Build Guide (Android)
- catalog-seed.test.js
- workout-prefill-loader.tsx
- build-reviewed-migration-files.js
- plate-calculator.tsx
- phone-auth.tsx
- plugins
- LiveUpdateNotificationModule
- index.ts
- Exercise Catalog
- Canonical Collections
- generate-ic-stat-timber.js
- Beads
- Users
- Workouts
- Legacy workout subcollection
- Pump Pal Data Model
- adaptiveIcon
- @ai-sdk/openai
- expo-constants
- expo-dev-client
- expo-file-system
- expo-haptics
- expo-image
- expo-insights
- expo-linear-gradient
- expo-localization
- expo-navigation-bar
- expo-router
- expo-sharing
- expo-splash-screen
- expo-status-bar
- expo-symbols
- expo-system-ui
- expo-updates
- @expo/vector-icons
- expo-web-browser
- firebase
- @notifee/react-native
- react-dom
- @react-native-async-storage/async-storage
- react-native-chart-kit
- @react-native-community/datetimepicker
- react-native-gesture-handler
- react-native-get-random-values
- react-native-reanimated
- react-native-reorderable-list
- react-native-safe-area-context
- react-native-screens
- react-native-svg
- ios
- react-native-webview
- react-native-worklets
- @react-navigation/bottom-tabs
- @react-navigation/elements
- @react-navigation/native
- zod
- extra
- @ai-sdk/google
- experiments
- react-native-web

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 37 edges
2. `toDateObj()` - 25 edges
3. `ActiveWorkoutScreen()` - 23 edges
4. `expo-router` - 22 edges
5. `AddWorkoutModal()` - 19 edges
6. `db` - 18 edges
7. `expo` - 17 edges
8. `scripts` - 17 edges
9. `Workout` - 17 edges
10. `isSplitOption()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Props` --references--> `Workout`  [EXTRACTED]
  components/muscle-insight-cards.tsx → types/workout.ts
- `analyzeMuscles()` --references--> `output`  [EXTRACTED]
  utils/muscle-analysis.ts → app.json
- `generateSplitWorkoutNames()` --references--> `output`  [EXTRACTED]
  utils/workout-suggestions.ts → app.json
- `suggestWorkoutCompletion()` --references--> `output`  [EXTRACTED]
  utils/workout-suggestions.ts → app.json
- `SettingsAppScreen()` --references--> `updates`  [EXTRACTED]
  app/settings-app.tsx → app.json

## Import Cycles
- None detected.

## Communities (133 total, 76 thin omitted)

### Community 0 - "pushup-challenge.tsx"
Cohesion: 0.14
Nodes (20): buildTimeline(), ChallengeData, ChallengeDay, currentStreakLength(), formatDate(), formatTime(), isStreakAlive(), PushupChallengeScreen() (+12 more)

### Community 1 - "settings-injuries.tsx"
Cohesion: 0.11
Nodes (28): atNoon(), cap(), labelToSide(), newId(), SettingsInjuriesScreen(), SEVERITIES, SIDE_OPTIONS, styles (+20 more)

### Community 2 - "legacy-inventory.test.js"
Cohesion: 0.09
Nodes (29): fs, generateMappingDraft(), guessExerciseId(), path, run(), slugify(), addToMapSet(), formatMarkdown() (+21 more)

### Community 3 - "expo"
Cohesion: 0.14
Nodes (13): expo, icon, name, newArchEnabled, orientation, runtimeVersion, scheme, slug (+5 more)

### Community 4 - "canonical-muscles.test.js"
Cohesion: 0.20
Nodes (9): MUSCLE_IDS, assert, fs, match, { MUSCLE_IDS }, path, tsMuscleIds, tsSource (+1 more)

### Community 5 - "write-migrated-workouts.js"
Cohesion: 0.15
Nodes (22): firestoreTimestamp(), timestampShapeToIso(), buildPlan(), compareTotals(), { convertLegacyWorkout }, crypto, { firestoreTimestamp, patchDocument, timestampShapeToIso }, flattenSnapshot() (+14 more)

### Community 6 - "dependencies"
Cohesion: 0.18
Nodes (11): ai, expo, expo-font, expo-linking, dependencies, ai, expo, expo-font (+3 more)

### Community 8 - "build-v2-migration.js"
Cohesion: 0.12
Nodes (30): blocker(), buildUsageFlags(), buildV2Artifacts(), cleanUndefined(), collectSource(), countMappedExerciseIds(), EXERCISES_OUT, EXPORT_FILE (+22 more)

### Community 9 - "build-exercise-inventory.js"
Cohesion: 0.13
Nodes (26): buildInventory(), buildMapping(), buildReviewWarnings(), compactCounts(), csvCell(), documentIdFromPath(), EXPORT_FILE, fs (+18 more)

### Community 10 - "scripts"
Cohesion: 0.06
Nodes (32): eslint, eslint-config-expo, devDependencies, eslint, eslint-config-expo, sharp, @types/react, typescript (+24 more)

### Community 11 - "collapsible.tsx"
Cohesion: 0.14
Nodes (16): ParallaxScrollView(), Props, styles, styles, ThemedText(), ThemedTextProps, ThemedView(), ThemedViewProps (+8 more)

### Community 12 - "write-v2-firestore.js"
Cohesion: 0.13
Nodes (21): commitWrites(), documentRoot(), encodeFields(), encodePathSegments(), encodeValue(), { execFileSync }, EXERCISES_FILE, fs (+13 more)

### Community 13 - "dry-run-conversion.js"
Cohesion: 0.15
Nodes (18): convertLegacyExercise(), convertLegacyWorkout(), durationSeconds(), assert, { convertedWorkout, report }, { convertLegacyWorkout }, mappingsByLegacyName, compareTotals() (+10 more)

### Community 14 - "muscle-analysis.ts"
Cohesion: 0.10
Nodes (30): InsightsCache, MuscleInsightCards(), Props, RefreshCache, styles, todayKey(), AI_MAX_RETRIES, AI_MODEL (+22 more)

### Community 15 - "android"
Cohesion: 0.25
Nodes (8): edgeToEdgeEnabled, package, permissions, predictiveBackGestureEnabled, softwareKeyboardLayoutMode, android, android.permission.POST_NOTIFICATIONS, android.permission.POST_PROMOTED_NOTIFICATIONS

### Community 16 - "reset-project.js"
Cohesion: 0.22
Nodes (7): exampleDirPath, fs, oldDirs, path, readline, rl, root

### Community 17 - "AGENTS.md"
Cohesion: 0.18
Nodes (10): Agent Context Profiles, Beads Issue Tracker, Beads Issue Tracker, graphify, Quick Reference, Quick Reference, Rules, Rules (+2 more)

### Community 18 - "include"
Cohesion: 0.18
Nodes (10): expo-env.d.ts, expo/tsconfig.base, .expo/types/**/*.ts, **/*.ts, **/*.tsx, compilerOptions, paths, strict (+2 more)

### Community 19 - "seed-exercise-catalog.js"
Cohesion: 0.18
Nodes (17): buildExerciseDocument(), documentUrl(), fs, { getAccessToken, requestJson }, isFirestoreTimestamp(), jsObjectToFirestoreFields(), jsToFirestoreValue(), MUSCLE_ID_SET (+9 more)

### Community 20 - "generate-icons.js"
Cohesion: 0.33
Nodes (9): fs, IMAGES_DIR, log(), LOGS, main(), markSvg(), path, sharp (+1 more)

### Community 21 - "CLAUDE.md"
Cohesion: 0.08
Nodes (21): AI features, Architecture, Beads Issue Tracker, Commands, Firebase, graphify, Migration scripts (`scripts/migration/`, `migration/`), Navigation / auth gating (+13 more)

### Community 22 - "vercel.json"
Cohesion: 0.40
Nodes (4): buildCommand, cleanUrls, outputDirectory, rewrites

### Community 23 - "(tabs)/_layout.tsx"
Cohesion: 0.43
Nodes (4): TabLayout(), HapticTab(), TimberTabIcon(), TimberTabIconProps

### Community 24 - "workout.ts"
Cohesion: 0.07
Nodes (49): DragHandle(), styles, compareExerciseLabels(), ExercisePicker(), ExercisePickerProps, ExercisePickerSelection, Sheet, SheetHandle (+41 more)

### Community 26 - "active-workout.tsx"
Cohesion: 0.06
Nodes (77): ActiveWorkoutScreen(), formatElapsed(), styles, WorkoutTimer(), RootLayoutNav(), unstable_settings, AddWorkoutModal(), styles (+69 more)

### Community 27 - "web"
Cohesion: 0.40
Nodes (5): web, description, favicon, name, output

### Community 35 - "Beads - AI-Native Issue Tracking"
Cohesion: 0.22
Nodes (8): Beads - AI-Native Issue Tracking, Essential Commands, Get Started with Beads, Learn More, Quick Start, What is Beads?, Why Beads?, Working with Issues

### Community 38 - "Pump Pal Firestore Data Refactor"
Cohesion: 0.20
Nodes (10): Completed Work, Current Status, Exercise Picker UX, Legacy Data Still Present, Migration Rules Used, Pump Pal Firestore Data Refactor, Refactor Goal, Remaining Work (+2 more)

### Community 44 - "oauth-config.ts"
Cohesion: 0.50
Nodes (3): GOOGLE_ANDROID_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID

### Community 46 - "firestore-readonly-snapshot.js"
Cohesion: 0.22
Nodes (15): base64url(), createJwt(), crypto, docId(), fieldsToJs(), firestoreValueToJs(), fs, getAccessToken() (+7 more)

### Community 70 - "Dev Build Guide (Android)"
Cohesion: 0.18
Nodes (10): Daily loop (after the dev build is installed), Dev Build Guide (Android), One-time setup, Path A — Local build (`expo run:android`), Path B — Cloud build (EAS), Separate app from your "Timber" preview, Testing the Android 16 Live Update (Pixel, API 36+), Testing the workout notification (+2 more)

### Community 71 - "catalog-seed.test.js"
Cohesion: 0.20
Nodes (9): assert, catalog, catalogPath, errors, fs, { MUSCLE_IDS }, muscleIdSet, path (+1 more)

### Community 72 - "workout-prefill-loader.tsx"
Cohesion: 0.33
Nodes (5): LoadingPlateProps, PLATES, styles, WorkoutPrefillLoader(), WorkoutPrefillLoaderProps

### Community 73 - "build-reviewed-migration-files.js"
Cohesion: 0.14
Nodes (8): byName, catalog, catalogSeed, decisions, fs, inventory, mapping, path

### Community 74 - "plate-calculator.tsx"
Cohesion: 0.24
Nodes (12): fmt(), Mode, MODES, num(), PlateCalculator(), PlateCalculatorProps, styles, DENOM_UNITS (+4 more)

### Community 76 - "phone-auth.tsx"
Cohesion: 0.09
Nodes (26): getCallingCode(), PhoneAuthScreen(), REGION_TO_CALLING_CODE, styles, SignInScreen(), styles, SignUpScreen(), styles (+18 more)

### Community 77 - "plugins"
Cohesion: 0.29
Nodes (5): plugins, Props, expo-localization, expo-web-browser, @react-native-community/datetimepicker

### Community 78 - "LiveUpdateNotificationModule"
Cohesion: 0.29
Nodes (6): Module, LiveUpdateNotificationModule, LiveUpdateNotificationPayload, LiveUpdateSegment, NotificationManager, Record

### Community 79 - "index.ts"
Cohesion: 0.15
Nodes (10): LiveUpdateNotificationPayload, LiveUpdateSegment, dismiss(), isSupported(), LiveUpdateNotificationNativeModule, nativeModule, show(), buildNotificationBody() (+2 more)

### Community 80 - "Exercise Catalog"
Cohesion: 0.22
Nodes (9): Doc ID convention, Exercise Catalog, Exercise picker (why the shape is flattened at read time), `exerciseCatalogMeta/current`, `ExerciseVariation` (embedded, not a separate doc), Muscle taxonomy, Shape, Validation (+1 more)

### Community 81 - "Canonical Collections"
Cohesion: 0.25
Nodes (8): Canonical Collections, `exerciseCatalogMeta/current`, `exercises/{exerciseId}`, `ExerciseVariation`, `MigrationSource`, `PerformedExercise`, `PerformedSet`, `workouts/{workoutId}`

### Community 82 - "generate-ic-stat-timber.js"
Cohesion: 0.29
Nodes (7): fs, main(), path, RES_DIR, sharp, SIZES, SOURCE

### Community 83 - "Beads"
Cohesion: 0.29
Nodes (6): Beads, Core CLI Workflow, First Step, Preferred Route, Rules, What Belongs In Beads

### Community 84 - "Users"
Cohesion: 0.40
Nodes (5): Account deletion, Injuries, Shape, The doc doesn't exist until onboarding completes, Users

### Community 85 - "Workouts"
Cohesion: 0.40
Nodes (5): AI consumers, Doc ID convention, `MigrationSource`, Shape, Workouts

### Community 86 - "Legacy workout subcollection"
Cohesion: 0.50
Nodes (4): Do not delete this data outside of account deletion, Legacy workout subcollection, Shape (historical reference only), The only remaining live touchpoint: account deletion

### Community 87 - "Pump Pal Data Model"
Cohesion: 0.67
Nodes (3): Collections, Conventions used throughout, Pump Pal Data Model

### Community 88 - "adaptiveIcon"
Cohesion: 0.40
Nodes (5): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon

### Community 121 - "ios"
Cohesion: 0.40
Nodes (5): ios, ITSAppUsesNonExemptEncryption, bundleIdentifier, infoPlist, supportsTablet

### Community 129 - "extra"
Cohesion: 0.50
Nodes (4): projectId, extra, eas, router

### Community 131 - "experiments"
Cohesion: 0.67
Nodes (3): reactCompiler, typedRoutes, experiments

## Knowledge Gaps
- **420 isolated node(s):** `name`, `slug`, `version`, `orientation`, `icon` (+415 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **76 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `settings-injuries.tsx`, `@ai-sdk/google`, `react-native-web`, `scripts`, `@ai-sdk/openai`, `expo-constants`, `expo-dev-client`, `expo-file-system`, `expo-haptics`, `expo-image`, `expo-insights`, `expo-linear-gradient`, `expo-localization`, `expo-navigation-bar`, `expo-router`, `expo-sharing`, `expo-splash-screen`, `expo-status-bar`, `expo-symbols`, `expo-system-ui`, `expo-updates`, `@expo/vector-icons`, `expo-web-browser`, `firebase`, `@notifee/react-native`, `react-dom`, `@react-native-async-storage/async-storage`, `react-native-chart-kit`, `@react-native-community/datetimepicker`, `react-native-gesture-handler`, `react-native-get-random-values`, `react-native-reanimated`, `react-native-reorderable-list`, `react-native-safe-area-context`, `react-native-screens`, `react-native-svg`, `react-native-webview`, `react-native-worklets`, `@react-navigation/bottom-tabs`, `@react-navigation/elements`, `@react-navigation/native`, `zod`?**
  _High betweenness centrality (0.112) - this node is a cross-community bridge._
- **Why does `react` connect `settings-injuries.tsx` to `active-workout.tsx`, `dependencies`?**
  _High betweenness centrality (0.099) - this node is a cross-community bridge._
- **Why does `AddWorkoutModal()` connect `active-workout.tsx` to `workout.ts`, `settings-injuries.tsx`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _420 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `pushup-challenge.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.14461538461538462 - nodes in this community are weakly interconnected._
- **Should `settings-injuries.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10795454545454546 - nodes in this community are weakly interconnected._
- **Should `legacy-inventory.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.0928030303030303 - nodes in this community are weakly interconnected._
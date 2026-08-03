# Graph Report - pump-pal  (2026-08-03)

## Corpus Check
- 160 files · ~111,739 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1279 nodes · 2383 edges · 144 communities (69 shown, 75 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 56 edges (avg confidence: 0.56)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `44cce725`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- pushup-challenge.tsx
- settings-injuries.tsx
- legacy-inventory.test.js
- generate-muscle-pebble-map.js
- catalog-seed.test.js
- write-migrated-workouts.js
- dependencies
- data-model/README.md
- build-v2-migration.js
- build-exercise-inventory.js
- scripts
- collapsible.tsx
- write-v2-firestore.js
- review-pending-exercises.js
- auth-context.tsx
- planned-workouts.tsx
- reset-project.js
- AGENTS.md
- include
- seed-exercise-catalog.js
- generate-icons.js
- CLAUDE.md
- vercel.json
- (tabs)/_layout.tsx
- modal.tsx
- eslint.config.js
- useAuth
- workout.ts
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
- muscle-analysis.ts
- workout-prefill-loader.tsx
- build-reviewed-migration-files.js
- plate-calculator.tsx
- muscle-development.ts
- muscle-load.test.ts
- LiveUpdateNotificationModule
- index.ts
- Exercise Catalog
- muscle-load-map.tsx
- generate-ic-stat-timber.js
- Beads
- Users
- Workouts
- Timber Design Language
- expo
- Why Timber Exists
- react-native-web
- workout-suggestions.ts
- expo-dev-client
- expo-file-system
- expo-haptics
- expo-image
- expo-insights
- expo-linear-gradient
- expo-localization
- expo-navigation-bar
- muscle-load.ts
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
- workout-conversion.ts
- @react-native-async-storage/async-storage
- react-native-chart-kit
- @react-native-community/datetimepicker
- components/development-progress.tsx
- expo-constants
- react-native-reanimated
- react-native-reorderable-list
- timber-auth-shell.tsx
- react-native-screens
- react-native-svg
- muscle-development.test.ts
- react-native-webview
- react-native-worklets
- @react-navigation/bottom-tabs
- @react-navigation/elements
- @react-navigation/native
- zod
- exercise-card.tsx
- @ai-sdk/google
- set-split.tsx
- expo-router
- react-dom
- react-native-get-random-values
- react-native-safe-area-context
- active-workout.tsx
- review-pending-exercises.test.js
- promptApprovedExercise
- phone-auth.tsx
- Legacy workout subcollection
- expo-router
- react-native-gesture-handler
- @ai-sdk/openai

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 41 edges
2. `Workout` - 29 edges
3. `toDateObj()` - 29 edges
4. `expo-router` - 26 edges
5. `ActiveWorkoutScreen()` - 23 edges
6. `MuscleId` - 22 edges
7. `db` - 20 edges
8. `scripts` - 20 edges
9. `AddWorkoutModal()` - 19 edges
10. `computeMuscleLoad()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `WorkoutsScreen()` --calls--> `useAuth()`  [EXTRACTED]
  app/(tabs)/workouts.tsx → context/auth-context.tsx
- `ActiveWorkoutScreen()` --indirect_call--> `collapseSetsToDraft()`  [INFERRED]
  app/active-workout.tsx → utils/workout-conversion.ts
- `DevelopmentProgressSummaryProps` --references--> `Workout`  [EXTRACTED]
  components/development-progress-summary.tsx → types/workout.ts
- `DevelopmentProgressProps` --references--> `Workout`  [EXTRACTED]
  components/development-progress.tsx → types/workout.ts
- `Props` --references--> `Workout`  [EXTRACTED]
  components/muscle-insight-cards.tsx → types/workout.ts

## Import Cycles
- None detected.

## Communities (144 total, 75 thin omitted)

### Community 0 - "pushup-challenge.tsx"
Cohesion: 0.07
Nodes (43): buildTimeline(), ChallengeData, ChallengeDay, currentStreakLength(), formatDate(), formatTime(), isStreakAlive(), PushupChallengeScreen() (+35 more)

### Community 1 - "settings-injuries.tsx"
Cohesion: 0.12
Nodes (28): atNoon(), cap(), labelToSide(), newId(), SettingsInjuriesScreen(), SEVERITIES, SIDE_OPTIONS, styles (+20 more)

### Community 2 - "legacy-inventory.test.js"
Cohesion: 0.09
Nodes (29): fs, generateMappingDraft(), guessExerciseId(), path, run(), slugify(), addToMapSet(), formatMarkdown() (+21 more)

### Community 3 - "generate-muscle-pebble-map.js"
Cohesion: 0.09
Nodes (39): CANONICAL_MUSCLES, capsulePath(), capsulePoints(), CENTERS, clearance(), coverage(), ellipsePath(), ellipsePoints() (+31 more)

### Community 4 - "catalog-seed.test.js"
Cohesion: 0.10
Nodes (18): MUSCLE_IDS, assert, fs, match, { MUSCLE_IDS }, path, tsMuscleIds, tsSource (+10 more)

### Community 5 - "write-migrated-workouts.js"
Cohesion: 0.08
Nodes (40): convertLegacyExercise(), convertLegacyWorkout(), durationSeconds(), assert, { convertedWorkout, report }, { convertLegacyWorkout }, mappingsByLegacyName, compareTotals() (+32 more)

### Community 6 - "dependencies"
Cohesion: 0.18
Nodes (11): ai, expo, expo-font, expo-linking, dependencies, ai, expo, expo-font (+3 more)

### Community 7 - "data-model/README.md"
Cohesion: 0.23
Nodes (5): Pushup Challenge (TPC tab), Shape, Collections, Conventions used throughout, Pump Pal Data Model

### Community 8 - "build-v2-migration.js"
Cohesion: 0.12
Nodes (30): blocker(), buildUsageFlags(), buildV2Artifacts(), cleanUndefined(), collectSource(), countMappedExerciseIds(), EXERCISES_OUT, EXPORT_FILE (+22 more)

### Community 9 - "build-exercise-inventory.js"
Cohesion: 0.13
Nodes (26): buildInventory(), buildMapping(), buildReviewWarnings(), compactCounts(), csvCell(), documentIdFromPath(), EXPORT_FILE, fs (+18 more)

### Community 10 - "scripts"
Cohesion: 0.05
Nodes (37): eslint, eslint-config-expo, devDependencies, eslint, eslint-config-expo, sharp, tsx, @types/react (+29 more)

### Community 11 - "collapsible.tsx"
Cohesion: 0.14
Nodes (16): ParallaxScrollView(), Props, styles, styles, ThemedText(), ThemedTextProps, ThemedView(), ThemedViewProps (+8 more)

### Community 12 - "write-v2-firestore.js"
Cohesion: 0.13
Nodes (21): commitWrites(), documentRoot(), encodeFields(), encodePathSegments(), encodeValue(), { execFileSync }, EXERCISES_FILE, fs (+13 more)

### Community 13 - "review-pending-exercises.js"
Cohesion: 0.11
Nodes (30): fieldsToJs(), addExerciseToCatalog(), createPrompt(), DEFAULT_CATALOG_PATH, deleteDocument(), documentId(), documentUrl(), { fieldsToJs, getAccessToken, listDocuments, requestJson } (+22 more)

### Community 14 - "auth-context.tsx"
Cohesion: 0.14
Nodes (14): RootLayoutNav(), unstable_settings, styles, styles, styles, styles, Toast(), ToastProps (+6 more)

### Community 15 - "planned-workouts.tsx"
Cohesion: 0.23
Nodes (15): PlannedWorkoutsScreen(), queueOrderCacheKey(), styles, SettingsSplitScreen(), styles, HomeScreen(), styles, isSplitOption() (+7 more)

### Community 16 - "reset-project.js"
Cohesion: 0.22
Nodes (7): exampleDirPath, fs, oldDirs, path, readline, rl, root

### Community 17 - "AGENTS.md"
Cohesion: 0.17
Nodes (11): Agent Context Profiles, Beads Issue Tracker, Beads Issue Tracker, graphify, Quick Reference, Quick Reference, Rules, Rules (+3 more)

### Community 18 - "include"
Cohesion: 0.18
Nodes (10): expo-env.d.ts, expo/tsconfig.base, .expo/types/**/*.ts, **/*.ts, **/*.tsx, compilerOptions, paths, strict (+2 more)

### Community 19 - "seed-exercise-catalog.js"
Cohesion: 0.17
Nodes (19): getAccessToken(), requestJson(), buildExerciseDocument(), documentUrl(), fs, { getAccessToken, requestJson }, isFirestoreTimestamp(), jsObjectToFirestoreFields() (+11 more)

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

### Community 24 - "modal.tsx"
Cohesion: 0.31
Nodes (12): AddWorkoutModal(), styles, cascadeSetField(), DraftExerciseOptions, findLastPerformed(), useDraftExercises(), getOngoingInjuries(), getOngoingInjuryIds() (+4 more)

### Community 26 - "useAuth"
Cohesion: 0.20
Nodes (9): DevelopmentProgressScreen(), styles, updates, SettingsAccountScreen(), SettingsAppScreen(), SettingsScreen(), styles, url (+1 more)

### Community 27 - "workout.ts"
Cohesion: 0.13
Nodes (22): AnalyticsNavigationRow(), AnalyticsNavigationRowProps, styles, DevelopmentProgressSummary(), DevelopmentProgressSummaryProps, styles, MuscleLoadSummary(), MuscleLoadSummaryProps (+14 more)

### Community 35 - "Beads - AI-Native Issue Tracking"
Cohesion: 0.22
Nodes (8): Beads - AI-Native Issue Tracking, Essential Commands, Get Started with Beads, Learn More, Quick Start, What is Beads?, Why Beads?, Working with Issues

### Community 38 - "Pump Pal Firestore Data Refactor"
Cohesion: 0.11
Nodes (18): Canonical Collections, Completed Work, Current Status, Exercise Picker UX, `exerciseCatalogMeta/current`, `exercises/{exerciseId}`, `ExerciseVariation`, Legacy Data Still Present (+10 more)

### Community 44 - "oauth-config.ts"
Cohesion: 0.50
Nodes (3): GOOGLE_ANDROID_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID

### Community 46 - "firestore-readonly-snapshot.js"
Cohesion: 0.22
Nodes (12): base64url(), createJwt(), crypto, docId(), firestoreValueToJs(), fs, https, listDocuments() (+4 more)

### Community 70 - "Dev Build Guide (Android)"
Cohesion: 0.18
Nodes (10): Daily loop (after the dev build is installed), Dev Build Guide (Android), One-time setup, Path A — Local build (`expo run:android`), Path B — Cloud build (EAS), Separate app from your "Timber" preview, Testing the Android 16 Live Update (Pixel, API 36+), Testing the workout notification (+2 more)

### Community 71 - "muscle-analysis.ts"
Cohesion: 0.14
Nodes (22): MUSCLE_OPTIONS, MuscleMap(), MuscleMapProps, styles, BODY_SILHOUETTES, MUSCLE_PEBBLES, BodySilhouette, MUSCLE_MAP_VIEWBOX (+14 more)

### Community 72 - "workout-prefill-loader.tsx"
Cohesion: 0.33
Nodes (5): LoadingPlateProps, PLATES, styles, WorkoutPrefillLoader(), WorkoutPrefillLoaderProps

### Community 73 - "build-reviewed-migration-files.js"
Cohesion: 0.14
Nodes (8): byName, catalog, catalogSeed, decisions, fs, inventory, mapping, path

### Community 74 - "plate-calculator.tsx"
Cohesion: 0.24
Nodes (12): fmt(), Mode, MODES, num(), PlateCalculator(), PlateCalculatorProps, styles, DENOM_UNITS (+4 more)

### Community 76 - "muscle-development.ts"
Cohesion: 0.16
Nodes (18): MuscleId, buildMappings(), ComparableSignal, makeMapping(), mappingKey(), MUSCLE_DEVELOPMENT_WINDOW_DAYS, MuscleDevelopmentContributor, MuscleDevelopmentCoverage (+10 more)

### Community 77 - "muscle-load.test.ts"
Cohesion: 0.29
Nodes (14): PerformedSet, MUSCLE_LOAD_SATURATION_SCORE, muscleLoadColor(), catalogExercise(), closeTo(), NOW, score(), testCatalogAvailabilityAndColor() (+6 more)

### Community 78 - "LiveUpdateNotificationModule"
Cohesion: 0.29
Nodes (6): Module, LiveUpdateNotificationModule, LiveUpdateNotificationPayload, LiveUpdateSegment, NotificationManager, Record

### Community 79 - "index.ts"
Cohesion: 0.15
Nodes (10): LiveUpdateNotificationPayload, LiveUpdateSegment, dismiss(), isSupported(), LiveUpdateNotificationNativeModule, nativeModule, show(), buildNotificationBody() (+2 more)

### Community 80 - "Exercise Catalog"
Cohesion: 0.22
Nodes (9): Doc ID convention, Exercise Catalog, Exercise picker (why the shape is flattened at read time), `exerciseCatalogMeta/current`, `ExerciseVariation` (embedded, not a separate doc), Muscle taxonomy, Shape, Validation (+1 more)

### Community 81 - "muscle-load-map.tsx"
Cohesion: 0.16
Nodes (18): MuscleLoadMap(), MuscleLoadMapProps, relativeDate(), selectedAccessibility(), statusFor(), styles, GRADIENT_COLORS, MuscleMapLegend() (+10 more)

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

### Community 86 - "Timber Design Language"
Cohesion: 0.07
Nodes (29): Accessibility, Appendix: known drift, Color, Color, Component canon, Copy, Copy, Copy voice (+21 more)

### Community 87 - "expo"
Cohesion: 0.05
Nodes (41): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, edgeToEdgeEnabled, package, permissions (+33 more)

### Community 88 - "Why Timber Exists"
Cohesion: 0.18
Nodes (11): A note on the name, Decision rules, How the product already embodies this, Known tensions, Non-goals, Simple by design, The deterministic-first rule, Thesis (+3 more)

### Community 90 - "workout-suggestions.ts"
Cohesion: 0.16
Nodes (14): AnalyticsScreen(), chartConfig, formatDuration(), formatPounds(), formatSignedPounds(), StrengthHistoryPoint, styles, BODY_PART_MUSCLES (+6 more)

### Community 99 - "muscle-load.ts"
Cohesion: 0.16
Nodes (18): MuscleLoadScreen(), PerformedExercise, baselineKey(), buildMappings(), computeMuscleLoad(), contributorKey(), makeMapping(), mappingKey() (+10 more)

### Community 110 - "workout-conversion.ts"
Cohesion: 0.21
Nodes (14): styles, WorkoutsScreen(), styles, WorkoutCardProps, DraftSet, Workout, buildPerformedExercise(), expandDraftToSets() (+6 more)

### Community 114 - "components/development-progress.tsx"
Cohesion: 0.33
Nodes (10): DevelopmentProgress(), DevelopmentProgressProps, formatChange(), selectedAccessibility(), statusFor(), styles, developmentGrade, testDevelopmentGrades() (+2 more)

### Community 118 - "timber-auth-shell.tsx"
Cohesion: 0.19
Nodes (10): Slide, SLIDES, styles, styles, TimberAuthShell(), TimberAuthShellProps, TimberBrandProps, LOGS (+2 more)

### Community 121 - "muscle-development.test.ts"
Cohesion: 0.50
Nodes (11): computeMuscleDevelopment(), catalogExercise(), closeTo(), NOW, performed(), stat(), testAllPositiveAndAllNegativeScaling(), testGeometricAttributionAndRelativeScores() (+3 more)

### Community 129 - "exercise-card.tsx"
Cohesion: 0.09
Nodes (26): DragHandle(), styles, Dropdown(), DropdownProps, styles, compareExerciseLabels(), ExercisePicker(), ExercisePickerProps (+18 more)

### Community 131 - "set-split.tsx"
Cohesion: 0.22
Nodes (10): SignInScreen(), styles, SignUpScreen(), styles, SetSplitScreen(), styles, timberAuthStyles, TimberBrand() (+2 more)

### Community 136 - "active-workout.tsx"
Cohesion: 0.27
Nodes (12): ActiveWorkoutScreen(), formatElapsed(), styles, WorkoutTimer(), WorkoutCard(), workoutTotalReps(), workoutVolume(), dismissWorkoutNotification() (+4 more)

### Community 137 - "review-pending-exercises.test.js"
Cohesion: 0.17
Nodes (9): {
  addExerciseToCatalog,
  buildApprovedExercise,
  buildVariation,
  documentUrl,
  filterPendingExercises,
  nextCatalogVersion,
  parseArgs,
  parseCommaList,
  timestampMillis,
}, approvedExercise, assert, candidate, catalog, documents, pending, { validateCatalog } (+1 more)

### Community 138 - "promptApprovedExercise"
Cohesion: 0.23
Nodes (12): askChoice(), askMuscles(), askTrackingModes(), askVariation(), buildApprovedExercise(), buildVariation(), muscleErrors(), parseCommaList() (+4 more)

### Community 139 - "phone-auth.tsx"
Cohesion: 0.24
Nodes (8): getCallingCode(), PhoneAuthScreen(), REGION_TO_CALLING_CODE, styles, FirebaseRecaptchaVerifierModal, FirebaseRecaptchaVerifierModalRef, Props, styles

### Community 140 - "Legacy workout subcollection"
Cohesion: 0.50
Nodes (4): Do not delete this data outside of account deletion, Legacy workout subcollection, Shape (historical reference only), The only remaining live touchpoint: account deletion

### Community 141 - "expo-router"
Cohesion: 0.25
Nodes (5): plugins, Props, expo-localization, expo-router, expo-web-browser

## Knowledge Gaps
- **517 isolated node(s):** `name`, `slug`, `version`, `orientation`, `icon` (+512 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **75 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `settings-injuries.tsx`, `@ai-sdk/google`, `expo-router`, `react-dom`, `react-native-get-random-values`, `react-native-safe-area-context`, `scripts`, `react-native-gesture-handler`, `@ai-sdk/openai`, `react-native-web`, `expo-dev-client`, `expo-file-system`, `expo-haptics`, `expo-image`, `expo-insights`, `expo-linear-gradient`, `expo-localization`, `expo-navigation-bar`, `expo-sharing`, `expo-splash-screen`, `expo-status-bar`, `expo-symbols`, `expo-system-ui`, `expo-updates`, `@expo/vector-icons`, `expo-web-browser`, `firebase`, `@notifee/react-native`, `@react-native-async-storage/async-storage`, `react-native-chart-kit`, `@react-native-community/datetimepicker`, `expo-constants`, `react-native-reanimated`, `react-native-reorderable-list`, `react-native-screens`, `react-native-svg`, `react-native-webview`, `react-native-worklets`, `@react-navigation/bottom-tabs`, `@react-navigation/elements`, `@react-navigation/native`, `zod`?**
  _High betweenness centrality (0.109) - this node is a cross-community bridge._
- **Why does `react` connect `settings-injuries.tsx` to `modal.tsx`, `dependencies`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Why does `AddWorkoutModal()` connect `modal.tsx` to `pushup-challenge.tsx`, `settings-injuries.tsx`, `exercise-card.tsx`, `workout-suggestions.ts`, `workout-conversion.ts`, `planned-workouts.tsx`, `useAuth`, `workout.ts`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _517 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `pushup-challenge.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06531204644412192 - nodes in this community are weakly interconnected._
- **Should `settings-injuries.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11742424242424243 - nodes in this community are weakly interconnected._
- **Should `legacy-inventory.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.0928030303030303 - nodes in this community are weakly interconnected._
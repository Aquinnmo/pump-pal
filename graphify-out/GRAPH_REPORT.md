# Graph Report - pump-pal  (2026-07-07)

## Corpus Check
- 94 files · ~162,452 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 645 nodes · 999 edges · 81 communities (29 shown, 52 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 35 edges (avg confidence: 0.59)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_App Screens & Workout Data|App Screens & Workout Data]]
- [[_COMMUNITY_Auth Flow & Firebase Config|Auth Flow & Firebase Config]]
- [[_COMMUNITY_Firestore Migration Write Scripts|Firestore Migration Write Scripts]]
- [[_COMMUNITY_Expo App Config|Expo App Config]]
- [[_COMMUNITY_NPM Dependencies|NPM Dependencies]]
- [[_COMMUNITY_Legacy Data Inventory & Mapping|Legacy Data Inventory & Mapping]]
- [[_COMMUNITY_V2 Migration Builder|V2 Migration Builder]]
- [[_COMMUNITY_Exercise Inventory Builder|Exercise Inventory Builder]]
- [[_COMMUNITY_NPM Scripts & Package Meta|NPM Scripts & Package Meta]]
- [[_COMMUNITY_Firestore Refactor Docs|Firestore Refactor Docs]]
- [[_COMMUNITY_Theming & UI Primitives|Theming & UI Primitives]]
- [[_COMMUNITY_Firestore V2 Writer Script|Firestore V2 Writer Script]]
- [[_COMMUNITY_Legacy Workout Conversion Scripts|Legacy Workout Conversion Scripts]]
- [[_COMMUNITY_Pushup Challenge Feature|Pushup Challenge Feature]]
- [[_COMMUNITY_Migration File Review Builder|Migration File Review Builder]]
- [[_COMMUNITY_Project Reset Script|Project Reset Script]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Welcome Onboarding Screen|Welcome Onboarding Screen]]
- [[_COMMUNITY_Theming Doc Notes|Theming Doc Notes]]
- [[_COMMUNITY_Vercel Deploy Config|Vercel Deploy Config]]
- [[_COMMUNITY_Tab Bar Layout|Tab Bar Layout]]
- [[_COMMUNITY_Auth Doc Notes|Auth Doc Notes]]
- [[_COMMUNITY_External Link Component|External Link Component]]
- [[_COMMUNITY_Exercise Schema Docs|Exercise Schema Docs]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_Android Icon Background Asset|Android Icon Background Asset]]
- [[_COMMUNITY_Favicon & Mascot Logo|Favicon & Mascot Logo]]
- [[_COMMUNITY_Android Icon Foreground Asset|Android Icon Foreground Asset]]
- [[_COMMUNITY_Android Icon Monochrome Asset|Android Icon Monochrome Asset]]
- [[_COMMUNITY_App Icon Asset|App Icon Asset]]
- [[_COMMUNITY_ExerciseCatalogMeta Doc Note|ExerciseCatalogMeta Doc Note]]
- [[_COMMUNITY_Firebase Config Doc Note|Firebase Config Doc Note]]
- [[_COMMUNITY_Color Scheme Doc Note|Color Scheme Doc Note]]
- [[_COMMUNITY_Exercise Picker UX Rationale|Exercise Picker UX Rationale]]
- [[_COMMUNITY_Search Ranking Rationale|Search Ranking Rationale]]
- [[_COMMUNITY_AGENTS|AGENTS.md]]
- [[_COMMUNITY_post-checkout|post-checkout]]
- [[_COMMUNITY_post-merge|post-merge]]
- [[_COMMUNITY_pre-commit|pre-commit]]
- [[_COMMUNITY_pre-push|pre-push]]
- [[_COMMUNITY_prepare-commit-msg|prepare-commit-msg]]
- [[_COMMUNITY_AsyncStorage pumppal_onboarding_seen key|AsyncStorage pumppal_onboarding_seen key]]
- [[_COMMUNITY_AuthProvider (contextauth-context.tsx)|AuthProvider (context/auth-context.tsx)]]
- [[_COMMUNITY_exercises{exerciseId} collection|exercises/{exerciseId} collection]]
- [[_COMMUNITY_Expo Router (file-based routing)|Expo Router (file-based routing)]]
- [[_COMMUNITY_constantsgemini-config.ts|constants/gemini-config.ts]]
- [[_COMMUNITY_utilsgemini-muscle-analysis.ts|utils/gemini-muscle-analysis.ts]]
- [[_COMMUNITY_utilsgemini-workout-suggestions.ts|utils/gemini-workout-suggestions.ts]]
- [[_COMMUNITY_scriptsmigration Node scripts|scripts/migration/ Node scripts]]
- [[_COMMUNITY_app(tabs)settings.tsx|app/(tabs)/settings.tsx]]
- [[_COMMUNITY_constantssplit-options.ts|constants/split-options.ts]]
- [[_COMMUNITY_constantstheme.ts|constants/theme.ts]]
- [[_COMMUNITY_componentsthemed-text.tsx|components/themed-text.tsx]]
- [[_COMMUNITY_componentsthemed-view.tsx|components/themed-view.tsx]]
- [[_COMMUNITY_hooksuse-theme-color.ts|hooks/use-theme-color.ts]]
- [[_COMMUNITY_@typesworkout (performedExercises.sets shape)|@/types/workout (performedExercises[].sets shape)]]
- [[_COMMUNITY_workouts{workoutId} collection|workouts/{workoutId} collection]]
- [[_COMMUNITY_app(tabs)analytics.tsx|app/(tabs)/analytics.tsx]]
- [[_COMMUNITY_App cutover to canonical top-level collections|App cutover to canonical top-level collections]]
- [[_COMMUNITY_appmodal.tsx|app/modal.tsx]]
- [[_COMMUNITY_ExerciseCatalogMeta (exerciseCatalogMetacurrent)|ExerciseCatalogMeta (exerciseCatalogMeta/current)]]
- [[_COMMUNITY_utilsgemini-muscle-analysis.ts|utils/gemini-muscle-analysis.ts]]
- [[_COMMUNITY_utilsgemini-workout-suggestions.ts|utils/gemini-workout-suggestions.ts]]
- [[_COMMUNITY_app(tabs)index.tsx|app/(tabs)/index.tsx]]
- [[_COMMUNITY_LegacyExercise type|LegacyExercise type]]
- [[_COMMUNITY_LegacyWorkout type (users{uid}workouts{oldWorkoutId})|LegacyWorkout type (users/{uid}/workouts/{oldWorkoutId})]]
- [[_COMMUNITY_Migration rules aggregate rows expanded to set-by-set|Migration rules: aggregate rows expanded to set-by-set]]
- [[_COMMUNITY_Firestore Data Refactor doc (canonical schema)|Firestore Data Refactor doc (canonical schema)]]
- [[_COMMUNITY_app(tabs)settings.tsx|app/(tabs)/settings.tsx]]
- [[_COMMUNITY_TPC pushup-challenge feature (users{uid}pushup-challengedata)|TPC pushup-challenge feature (users/{uid}/pushup-challenge/data)]]
- [[_COMMUNITY_Workout type (workouts{workoutId})|Workout type (workouts/{workoutId})]]
- [[_COMMUNITY_componentsworkout-card.tsx|components/workout-card.tsx]]
- [[_COMMUNITY_app(tabs)workouts.tsx|app/(tabs)/workouts.tsx]]
- [[_COMMUNITY_.env.example|.env.example]]

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 25 edges
2. `toDateObj()` - 18 edges
3. `expo` - 17 edges
4. `AddWorkoutModal()` - 17 edges
5. `scripts` - 16 edges
6. `Workout` - 14 edges
7. `db` - 12 edges
8. `buildPlan()` - 11 edges
9. `Pump Pal Firestore Data Refactor` - 11 edges
10. `isSplitOption()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `SettingsScreen()` --indirect_call--> `variation()`  [INFERRED]
  app/(tabs)/settings.tsx → scripts/migration/build-reviewed-migration-files.js
- `AddWorkoutModal()` --references--> `react`  [EXTRACTED]
  app/modal.tsx → package.json
- `AddWorkoutModal()` --indirect_call--> `todayUTC()`  [INFERRED]
  app/modal.tsx → utils/daily-name.ts
- `SettingsScreen()` --references--> `updates`  [EXTRACTED]
  app/(tabs)/settings.tsx → app.json
- `SignInScreen()` --calls--> `useAuth()`  [EXTRACTED]
  app/(auth)/sign-in.tsx → context/auth-context.tsx

## Import Cycles
- None detected.

## Communities (81 total, 52 thin omitted)

### Community 0 - "App Screens & Workout Data"
Cohesion: 0.07
Nodes (70): AddWorkoutModal(), styles, AnalyticsScreen(), styles, HomeScreen(), styles, styles, WorkoutsScreen() (+62 more)

### Community 1 - "Auth Flow & Firebase Config"
Cohesion: 0.08
Nodes (30): getCallingCode(), PhoneAuthScreen(), REGION_TO_CALLING_CODE, styles, RootLayoutNav(), unstable_settings, SetSplitScreen(), styles (+22 more)

### Community 2 - "Firestore Migration Write Scripts"
Cohesion: 0.07
Nodes (51): base64url(), createJwt(), crypto, docId(), fieldsToJs(), firestoreValueToJs(), fs, getAccessToken() (+43 more)

### Community 3 - "Expo App Config"
Cohesion: 0.05
Nodes (38): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, edgeToEdgeEnabled, package, predictiveBackGestureEnabled (+30 more)

### Community 4 - "NPM Dependencies"
Cohesion: 0.04
Nodes (47): dependencies, expo, expo-constants, expo-file-system, expo-font, expo-haptics, expo-image, expo-linear-gradient (+39 more)

### Community 5 - "Legacy Data Inventory & Mapping"
Cohesion: 0.09
Nodes (30): exercise(), fs, generateMappingDraft(), guessExerciseId(), path, run(), slugify(), addToMapSet() (+22 more)

### Community 6 - "V2 Migration Builder"
Cohesion: 0.12
Nodes (30): blocker(), buildUsageFlags(), buildV2Artifacts(), cleanUndefined(), collectSource(), countMappedExerciseIds(), EXERCISES_OUT, EXPORT_FILE (+22 more)

### Community 7 - "Exercise Inventory Builder"
Cohesion: 0.13
Nodes (26): buildInventory(), buildMapping(), buildReviewWarnings(), compactCounts(), csvCell(), documentIdFromPath(), EXPORT_FILE, fs (+18 more)

### Community 8 - "NPM Scripts & Package Meta"
Cohesion: 0.12
Nodes (16): scripts, android, build:web, ios, lint, migration:dry-run, migration:firestore:snapshot, migration:inventory (+8 more)

### Community 9 - "Firestore Refactor Docs"
Cohesion: 0.05
Nodes (34): AI features, Architecture, Beads Issue Tracker, Commands, Firebase, graphify, Migration scripts (`scripts/migration/`, `migration/`), Navigation / auth gating (+26 more)

### Community 10 - "Theming & UI Primitives"
Cohesion: 0.14
Nodes (16): ParallaxScrollView(), Props, styles, styles, ThemedText(), ThemedTextProps, ThemedView(), ThemedViewProps (+8 more)

### Community 11 - "Firestore V2 Writer Script"
Cohesion: 0.13
Nodes (21): commitWrites(), documentRoot(), encodeFields(), encodePathSegments(), encodeValue(), { execFileSync }, EXERCISES_FILE, fs (+13 more)

### Community 12 - "Legacy Workout Conversion Scripts"
Cohesion: 0.15
Nodes (18): convertLegacyExercise(), convertLegacyWorkout(), durationSeconds(), assert, { convertedWorkout, report }, { convertLegacyWorkout }, mappingsByLegacyName, compareTotals() (+10 more)

### Community 13 - "Pushup Challenge Feature"
Cohesion: 0.18
Nodes (15): buildTimeline(), ChallengeData, ChallengeDay, currentStreakLength(), formatDate(), formatTime(), isStreakAlive(), PushupChallengeScreen() (+7 more)

### Community 14 - "Migration File Review Builder"
Cohesion: 0.15
Nodes (9): byName, catalog, catalogSeed, decisions, fs, inventory, mapping, path (+1 more)

### Community 15 - "Project Reset Script"
Cohesion: 0.22
Nodes (7): exampleDirPath, fs, oldDirs, path, readline, rl, root

### Community 16 - "TypeScript Config"
Cohesion: 0.29
Nodes (6): compilerOptions, paths, strict, extends, include, @/*

### Community 17 - "Welcome Onboarding Screen"
Cohesion: 0.40
Nodes (3): Slide, SLIDES, styles

### Community 20 - "Vercel Deploy Config"
Cohesion: 0.40
Nodes (4): buildCommand, cleanUrls, outputDirectory, rewrites

### Community 40 - "Exercise Picker UX Rationale"
Cohesion: 0.33
Nodes (6): SignInScreen(), styles, SignUpScreen(), styles, FIREBASE_ERROR_MAP, getFriendlyAuthError()

### Community 41 - "Search Ranking Rationale"
Cohesion: 0.22
Nodes (8): Beads - AI-Native Issue Tracking, Essential Commands, Get Started with Beads, Learn More, Quick Start, What is Beads?, Why Beads?, Working with Issues

### Community 42 - "AGENTS.md"
Cohesion: 0.33
Nodes (5): Beads Issue Tracker, graphify, Quick Reference, Rules, Session Completion

## Knowledge Gaps
- **307 isolated node(s):** `name`, `slug`, `version`, `orientation`, `icon` (+302 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **52 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SettingsScreen()` connect `Auth Flow & Firebase Config` to `App Screens & Workout Data`, `Expo App Config`, `Migration File Review Builder`?**
  _High betweenness centrality (0.268) - this node is a cross-community bridge._
- **Why does `exercise()` connect `Legacy Data Inventory & Mapping` to `Firestore Migration Write Scripts`, `Legacy Workout Conversion Scripts`, `V2 Migration Builder`, `Migration File Review Builder`?**
  _High betweenness centrality (0.256) - this node is a cross-community bridge._
- **Why does `variation()` connect `Migration File Review Builder` to `Auth Flow & Firebase Config`?**
  _High betweenness centrality (0.226) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `AddWorkoutModal()` (e.g. with `todayUTC()` and `collapseSetsToDraft()`) actually correct?**
  _`AddWorkoutModal()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _308 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Screens & Workout Data` be split into smaller, more focused modules?**
  _Cohesion score 0.06575781876503609 - nodes in this community are weakly interconnected._
- **Should `Auth Flow & Firebase Config` be split into smaller, more focused modules?**
  _Cohesion score 0.07973421926910298 - nodes in this community are weakly interconnected._
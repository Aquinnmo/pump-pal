# Graph Report - .  (2026-07-07)

## Corpus Check
- 86 files · ~155,640 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 577 nodes · 950 edges · 42 communities (29 shown, 13 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.63)
- Token cost: 254,481 input · 0 output

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
- [[_COMMUNITY_Project README & Docs|Project README & Docs]]
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

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 25 edges
2. `expo` - 17 edges
3. `scripts` - 16 edges
4. `AddWorkoutModal()` - 15 edges
5. `toDateObj()` - 15 edges
6. `Workout` - 13 edges
7. `db` - 11 edges
8. `buildPlan()` - 11 edges
9. `exerciseLabel()` - 11 edges
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
- `TabLayout()` --indirect_call--> `HapticTab()`  [INFERRED]
  app/(tabs)/_layout.tsx → components/haptic-tab.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Auth/onboarding redirect gating in app/_layout.tsx** — claude_md_app_layout, claude_md_authprovider, claude_md_split_options, claude_md_asyncstorage_onboarding [EXTRACTED 1.00]
- **Canonical Firestore workout/exercise schema** — docs_firestore_data_refactor_workout, docs_firestore_data_refactor_performedexercise, docs_firestore_data_refactor_performedset, docs_firestore_data_refactor_exercise [EXTRACTED 1.00]
- **Gemini AI features consuming canonical workout shape** — claude_md_gemini_muscle_analysis, claude_md_gemini_workout_suggestions, claude_md_workout_types [EXTRACTED 1.00]

## Communities (42 total, 13 thin omitted)

### Community 0 - "App Screens & Workout Data"
Cohesion: 0.07
Nodes (59): AddWorkoutModal(), styles, AnalyticsScreen(), styles, HomeScreen(), styles, styles, InsightsCache (+51 more)

### Community 1 - "Auth Flow & Firebase Config"
Cohesion: 0.07
Nodes (38): getCallingCode(), PhoneAuthScreen(), REGION_TO_CALLING_CODE, styles, SignInScreen(), styles, SignUpScreen(), styles (+30 more)

### Community 2 - "Firestore Migration Write Scripts"
Cohesion: 0.07
Nodes (51): base64url(), createJwt(), crypto, docId(), fieldsToJs(), firestoreValueToJs(), fs, getAccessToken() (+43 more)

### Community 3 - "Expo App Config"
Cohesion: 0.05
Nodes (38): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, edgeToEdgeEnabled, package, predictiveBackGestureEnabled (+30 more)

### Community 4 - "NPM Dependencies"
Cohesion: 0.05
Nodes (38): dependencies, expo, expo-constants, expo-file-system, expo-font, expo-haptics, expo-image, expo-linear-gradient (+30 more)

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
Cohesion: 0.08
Nodes (25): devDependencies, eslint, eslint-config-expo, @types/react, typescript, main, name, private (+17 more)

### Community 9 - "Firestore Refactor Docs"
Cohesion: 0.09
Nodes (25): exercises/{exerciseId} collection, constants/gemini-config.ts, utils/gemini-muscle-analysis.ts, utils/gemini-workout-suggestions.ts, scripts/migration/ Node scripts, app/(tabs)/settings.tsx, @/types/workout (performedExercises[].sets shape), workouts/{workoutId} collection (+17 more)

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
Cohesion: 0.17
Nodes (8): byName, catalog, catalogSeed, decisions, fs, inventory, mapping, path

### Community 15 - "Project Reset Script"
Cohesion: 0.22
Nodes (7): exampleDirPath, fs, oldDirs, path, readline, rl, root

### Community 16 - "TypeScript Config"
Cohesion: 0.29
Nodes (6): compilerOptions, paths, strict, extends, include, @/*

### Community 17 - "Welcome Onboarding Screen"
Cohesion: 0.40
Nodes (3): Slide, SLIDES, styles

### Community 18 - "Project README & Docs"
Cohesion: 0.50
Nodes (4): Expo Router (file-based routing), Firestore Data Refactor doc (canonical schema), .env.example, Pump Pal (project)

### Community 19 - "Theming Doc Notes"
Cohesion: 0.40
Nodes (5): app/(tabs)/_layout.tsx, constants/theme.ts, components/themed-text.tsx, components/themed-view.tsx, hooks/use-theme-color.ts

### Community 20 - "Vercel Deploy Config"
Cohesion: 0.40
Nodes (4): buildCommand, cleanUrls, outputDirectory, rewrites

### Community 22 - "Auth Doc Notes"
Cohesion: 0.50
Nodes (4): app/_layout.tsx, AsyncStorage pumppal_onboarding_seen key, AuthProvider (context/auth-context.tsx), constants/split-options.ts

### Community 24 - "Exercise Schema Docs"
Cohesion: 0.67
Nodes (3): Exercise type (exercises/{exerciseId}), ExerciseCatalogMeta (exerciseCatalogMeta/current), ExerciseVariation

## Ambiguous Edges - Review These
- `App cutover to canonical top-level collections` → `TPC pushup-challenge feature (users/{uid}/pushup-challenge/data)`  [AMBIGUOUS]
  docs/firestore-data-refactor.md · relation: references

## Knowledge Gaps
- **247 isolated node(s):** `name`, `slug`, `version`, `orientation`, `icon` (+242 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `App cutover to canonical top-level collections` and `TPC pushup-challenge feature (users/{uid}/pushup-challenge/data)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `SettingsScreen()` connect `Auth Flow & Firebase Config` to `App Screens & Workout Data`, `Expo App Config`?**
  _High betweenness centrality (0.319) - this node is a cross-community bridge._
- **Why does `exercise()` connect `Legacy Data Inventory & Mapping` to `Firestore Migration Write Scripts`, `Legacy Workout Conversion Scripts`, `V2 Migration Builder`, `Migration File Review Builder`?**
  _High betweenness centrality (0.309) - this node is a cross-community bridge._
- **Why does `variation()` connect `Auth Flow & Firebase Config` to `Migration File Review Builder`?**
  _High betweenness centrality (0.269) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `AddWorkoutModal()` (e.g. with `todayUTC()` and `collapseSetsToDraft()`) actually correct?**
  _`AddWorkoutModal()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _249 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Screens & Workout Data` be split into smaller, more focused modules?**
  _Cohesion score 0.07404664938911515 - nodes in this community are weakly interconnected._
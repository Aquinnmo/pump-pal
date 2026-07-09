# Exercise Catalog

Path: `exercises/{exerciseId}` · Type: `CatalogExercise` (`types/workout.ts`)

One document per exercise **family** (e.g. `bench-press`). Variations
(equipment/angle/grip differences) are embedded arrays inside the parent doc,
not separate Firestore documents — there is no `exercises/{id}/variations/*`
subcollection. This keeps the exercise picker a single-query, in-memory-search
UX (see "Exercise picker" below) and keeps a family's data atomic.

The catalog currently has 74 exercise docs, seeded from
`migration/catalog-seed.json` by `scripts/migration/seed-exercise-catalog.js`
(dry-run by default; `--apply` writes to Firestore — see that script's
`--help`-equivalent usage in its own header comments).

## Doc ID convention

`exerciseId` is a kebab-case slug of the exercise name (`bench-press`,
`romanian-deadlift`), not an auto-generated ID. This is deliberate: the seed
script does a Firestore `PATCH` (upsert) per `exercises/{id}`, so re-running
the seed script is idempotent — it updates the same docs instead of creating
duplicates. Don't switch this to auto-IDs without re-deriving that guarantee.

## Shape

```ts
type CatalogExercise = {
  id: string;
  name: string;
  normalizedName: string;
  aliases: string[];
  primaryMuscles: MuscleId[];
  secondaryMuscles: MuscleId[];
  movementPattern: string;
  equipment: string[];
  bodyRegion: 'upper' | 'lower' | 'core' | 'full_body';
  mechanics: 'compound' | 'isolation' | 'static' | 'cardio';
  forceType: 'push' | 'pull' | 'hinge' | 'squat' | 'carry' | 'rotation' | 'static' | 'mixed';
  trackingModes: TrackingMode[];
  variations: ExerciseVariation[];
  schemaVersion: 2;
  status?: 'approved' | 'pending_review';
  createdBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};
```

Field notes:

- `movementPattern` is typed `string` but is an empty string `""` on every
  seeded exercise today — it's reserved, not populated. Don't rely on it for
  filtering until it's actually seeded.
- `equipment` (on the parent) is the union of equipment across all of that
  exercise's variations, for coarse filtering. Per-variation equipment lives
  on `ExerciseVariation.equipment` (see below) and is the one that matters for
  display/search.
- `status: 'pending_review'` marks exercises created in-app by a user via the
  "can't find my exercise" flow (`utils/create-pending-exercise.ts`) rather
  than seeded from the catalog. These have `primaryMuscles: []`,
  `secondaryMuscles: []`, and `variations: []` — the muscle-required
  invariant described below is enforced by the seed script's validator, not
  by Firestore, and pending exercises are the one legitimate exception.
  `createdBy` is the creating user's uid on these; absent on seeded exercises.
- `trackingModes` — **the `TrackingMode` type is stale** (`types/workout.ts`
  defines `'reps' | 'duration' | 'distance' | 'calories'`), but the actual
  data (and the code that reads it) uses `'reps_weight' | 'reps_bodyweight' |
  'duration' | 'distance'`. This forces a cast in
  `utils/create-pending-exercise.ts`. Known issue, not fixed as part of the
  muscle-data work — fix the type to match reality before adding a 5th
  tracking mode.

## Muscle taxonomy

`primaryMuscles` and `secondaryMuscles` are `MuscleId[]`, drawn from a single
canonical vocabulary defined in [`constants/muscles.ts`](../../constants/muscles.ts)
(the `MUSCLES` const array). That file is the source of truth for valid
values — this doc lists them for reference but **read the constant**, not
this table, if they ever diverge:

| Region | Muscle IDs |
| --- | --- |
| Chest | `chest` |
| Back | `upper back`, `lower back`, `lats`, `upper traps`, `mid traps`, `lower traps` |
| Shoulders | `front delts`, `side delts`, `rear delts`, `rotator cuff` |
| Arms | `biceps`, `triceps`, `forearm flexors`, `forearm extensors` |
| Trunk | `serratus anterior`, `upper abs`, `lower abs`, `obliques` |
| Legs | `quads`, `hamstrings`, `glutes`, `glute medius`, `adductors`, `hip flexors`, `gastrocnemius`, `soleus` |

Design rules for this vocabulary (why it's split the way it is, so future
additions stay consistent):

- Splits exist only where they change a training/analytics decision — e.g.
  `upper traps` vs `lower traps` (shrugs vs face-pulls), `gastrocnemius` vs
  `soleus` (standing vs seated calf raise), `upper abs` vs `lower abs`
  (crunches vs leg raises/hip-flexion holds). It is **not** a full anatomy-
  textbook split (no separate vastus medialis/lateralis, no
  biceps-femoris/semitendinosus split) — that level of precision isn't
  supported by real per-exercise EMG data and would just be guessing.
  When more precision is needed, ask "the app coach would train these two
  exercises differently" before splitting a muscle further, not "anatomy
  charts label these separately."
- No generic catch-all values. There used to be a generic `shoulders` and
  `traps`/`abs`/`forearms`/`calves`; all were removed in favor of the
  specific heads above so muscle-volume rollups aren't muddied by a vague
  bucket sitting next to its own specific components.
- Every value in the taxonomy is used by at least one exercise or variation
  in the seed data — there's a test for this (see "Validation" below), so
  the vocabulary can't drift into containing dead entries.

`isMuscleId()` and `muscleLabel()` (also in `constants/muscles.ts`) are the
runtime guard and the Title-Case display formatter, respectively — use those
instead of ad-hoc casing/validation anywhere muscle IDs cross a boundary
(user input, AI prompt output, etc).

## `ExerciseVariation` (embedded, not a separate doc)

```ts
type ExerciseVariation = {
  id: string;
  name: string;
  aliases: string[];
  primaryMuscles: MuscleId[];
  secondaryMuscles: MuscleId[];
  equipment?: string;
  angle?: string;
  grip?: string;
  stance?: string;
  side?: string;
  loadType?: string;
  mechanics?: string;
};
```

- `id` is only unique **within its parent exercise** (`incline`, `dumbbell`,
  `barbell` repeat across many exercises) — the stable reference is the pair
  `(exerciseId, variationId)`, never `variationId` alone.
- Every variation carries its **own full** `primaryMuscles`/`secondaryMuscles`
  arrays — there is no inheritance-from-parent at read time. When a
  variation's emphasis matches its parent exactly, its arrays are a literal
  copy of the parent's; when equipment/angle/grip shifts emphasis (e.g.
  incline bench → adds `front delts` to primary), the variation's arrays
  reflect that directly. This was a deliberate tradeoff: it costs redundant
  data (~200 variations each carry full arrays) in exchange for callers never
  having to fall back to the parent to get a variation's real muscle
  involvement.
- `equipment`/`angle`/`grip`/`stance`/`side`/`loadType`/`mechanics` are all
  optional and free-text — only populate the ones relevant to that variation
  (a barbell curl sets `equipment`; a single-leg deadlift sets `side:
  "unilateral"`; neither sets the other's field). `mechanics` here is
  variation-level and independent of the parent's `mechanics` enum — it's
  used sparingly (e.g. a "hold" variation of an otherwise dynamic exercise).
- Do **not** create a variation for temporary notes, typos, or one-off user
  wording — that's what `aliases` is for, both on the parent and on
  variations.

## `exerciseCatalogMeta/current`

Type: `ExerciseCatalogMeta`. Single document, cache-invalidation only:

```ts
type ExerciseCatalogMeta = {
  version: number;
  exerciseCount: number;
  schemaVersion: 2;
  updatedAt?: Timestamp;
};
```

The app loads the catalog once after auth, caches it in `AsyncStorage`
(`utils/exercise-catalog.ts`), and only refetches when `version` here differs
from the cached `version`. **Any time the seed script writes new catalog
data with `--apply`, bump `--catalog-version` so clients actually pick up the
change** — writing new exercise docs without bumping this is a silent no-op
for every device with a warm cache.

## Exercise picker (why the shape is flattened at read time)

The picker must stay a single search field, no "pick family then pick
variation" step. At runtime `utils/exercise-catalog.ts` flattens every
exercise + variation combination into `ExerciseSearchOption[]`:

```ts
type ExerciseSearchOption = {
  label: string;
  exerciseId: string;
  variationId: string | null;
  tokens: string[];
  aliases: string[];
  primaryMuscles: MuscleId[];
  equipment: string[];
};
```

Search ranks in-memory (no Firestore query per keystroke): recently-used
exact label → exact label → starts-with → alias match → contains-all-words →
muscle/equipment token match. `primaryMuscles` here is currently copied from
the **parent** exercise even for variation options — using the variation's
own (now-populated) `primaryMuscles` instead is a follow-up, not done yet.

## Validation

`scripts/migration/seed-exercise-catalog.js`'s `validateCatalog()` enforces,
on every seed run (dry-run or `--apply`):

- unique exercise ids, unique variation ids within a parent
- `primaryMuscles` non-empty on every exercise and every variation
  (`secondaryMuscles` may legitimately be empty — e.g. `lateral-raise` has no
  secondary muscle worth tracking)
- every muscle value is a canonical id from
  `scripts/migration/canonical-muscles.js` (a CommonJS mirror of
  `constants/muscles.ts` — Node scripts can't `import` the `.ts` file
  directly, so this list must be kept in sync by hand; the sync itself is
  enforced by `scripts/migration/canonical-muscles.test.js`, which diffs the
  two files)

`scripts/migration/catalog-seed.test.js` runs the same validation plus a
few extra invariants against the checked-in `migration/catalog-seed.json`,
and is wired into `npm run migration:test`.

## Writing to Firestore

`buildExerciseDocument()` in `seed-exercise-catalog.js` spreads the raw
exercise object into the write payload — any field present in
`catalog-seed.json` (including the muscle arrays) flows to Firestore with no
extra mapping step. Adding a new field to the schema means: add it to
`CatalogExercise`/`ExerciseVariation` in `types/workout.ts`, add it to the
JSON, and (if it needs enforcement) add a check to `validateCatalog()` — no
change needed to the write path itself.

Never run the seed script with `--apply` casually. It's a real,
one-directional Firestore write against `pumppal-c9199`. It is idempotent
(same doc IDs → upsert, not duplicate), but idempotent isn't the same as
free — it overwrites whatever is currently in `exercises/*` with whatever is
in the local `catalog-seed.json`.

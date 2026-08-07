import { z } from 'zod';

/**
 * Wire contract for the domain REST API (`/api/profile`, `/api/workouts`,
 * `/api/injuries`, `/api/catalog`, `/api/pushup-challenge`, `/api/account`,
 * `/api/sync`). Imported by the server (`api/`), the native client, and the
 * web client, so — same rule as `ai-contract.ts` — this file imports nothing
 * but `zod`: no Expo, React Native, or Firebase types cross this boundary.
 *
 * Design (see epic pump-pal-4xn):
 * - Timestamps on the wire are ISO-8601 UTC strings, never a Firestore
 *   `Timestamp`/sentinel. Server routes convert at the edge.
 * - Every mutable entity carries an opaque string `version`, derived from the
 *   authoritative Firestore `updateTime` for the doc that backs it. Clients
 *   never construct or interpret a version, only echo it back as
 *   `baseVersion` on a mutation.
 * - A mutation whose `baseVersion` doesn't match the server's current version
 *   fails with `409` and a `ConflictError` body carrying the canonical
 *   remote entity + version, so the caller can rebase instead of guessing.
 * - Creates accept a client-supplied `id` so an offline client can retry a
 *   create safely: replaying the same `id` acknowledges the already-applied
 *   result instead of duplicating.
 */

// ------------------------------------------------------------ common wire types

/** ISO-8601 with an explicit offset (server always writes `Z`). */
export const isoTimestamp = z.string().datetime({ offset: true });

/** Opaque — derived from Firestore `updateTime`. Never parse this string. */
export const version = z.string().min(1);

export const errorResponse = z.object({
  error: z.string(),
  code: z.string().optional(),
});
export type ErrorResponse = z.infer<typeof errorResponse>;

/** Standard 409 body for a `baseVersion` mismatch on any versioned mutation. */
export function conflictResponse<T extends z.ZodTypeAny>(entity: T) {
  return z.object({
    error: z.string(),
    code: z.literal('conflict'),
    remote: entity,
    remoteVersion: version,
  });
}
export type ConflictResponse<T> = { error: string; code: 'conflict'; remote: T; remoteVersion: string };

export const listQuery = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});
export type ListQuery = z.infer<typeof listQuery>;

export function listResponse<T extends z.ZodTypeAny>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

// ------------------------------------------------------------------- profile

export const SPLIT_OPTIONS = [
  'Push / Pull / Legs',
  'Upper / Lower',
  'Bro Split',
  'Full Body',
  'Other',
] as const;
export const splitOption = z.enum(SPLIT_OPTIONS);

export const workoutSplit = z.object({
  type: splitOption,
  custom: z.string().max(200).nullable(),
});

export const aiUsage = z.object({ date: z.string(), count: z.number().int().min(0) });

export const profileDTO = z.object({
  workoutSplit: workoutSplit.nullable(),
  aiUsage: aiUsage.nullable(),
  version,
});
export type ProfileDTO = z.infer<typeof profileDTO>;
export const profileResponse = z.object({ profile: profileDTO });
export type ProfileResponse = z.infer<typeof profileResponse>;

/** PATCH /api/profile — allowlisted fields only; UID always comes from the token, never the body. */
export const profilePatchInput = z.object({
  workoutSplit: workoutSplit.optional(),
  baseVersion: version.optional(),
});
export type ProfilePatchInput = z.infer<typeof profilePatchInput>;

// ------------------------------------------------------------------ injuries

export const BODY_PARTS = [
  'neck',
  'shoulder',
  'elbow',
  'wrist',
  'hand',
  'upper back',
  'lower back',
  'chest',
  'abdomen',
  'hip',
  'groin',
  'knee',
  'ankle',
  'foot',
] as const;
export const bodyPart = z.enum(BODY_PARTS);

export const injurySeverity = z.enum(['mild', 'moderate', 'severe']);
export const injuryStatus = z.enum(['ongoing', 'resolved']);
export const injurySide = z.enum(['left', 'right', 'both']);

export const injuryDTO = z.object({
  id: z.string(),
  bodyPart,
  side: injurySide.optional(),
  muscles: z.array(z.string()).optional(),
  severity: injurySeverity,
  status: injuryStatus,
  onsetDate: isoTimestamp,
  resolvedDate: isoTimestamp.nullable().optional(),
  avoid: z.array(z.string().max(200)).optional(),
  notes: z.string().max(2_000).optional(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});
export type InjuryDTO = z.infer<typeof injuryDTO>;

/** POST /api/injuries — `id` is client-generated so a retried create is idempotent. */
export const createInjuryInput = z.object({
  id: z.string().min(1).max(100),
  bodyPart,
  side: injurySide.optional(),
  muscles: z.array(z.string()).optional(),
  severity: injurySeverity,
  status: injuryStatus.default('ongoing'),
  onsetDate: isoTimestamp,
  resolvedDate: isoTimestamp.nullable().optional(),
  avoid: z.array(z.string().max(200)).optional(),
  notes: z.string().max(2_000).optional(),
});
export type CreateInjuryInput = z.infer<typeof createInjuryInput>;

/** PATCH /api/injuries/:id — partial edit (e.g. resolve). */
export const updateInjuryInput = z.object({
  side: injurySide.optional(),
  muscles: z.array(z.string()).optional(),
  severity: injurySeverity.optional(),
  status: injuryStatus.optional(),
  resolvedDate: isoTimestamp.nullable().optional(),
  avoid: z.array(z.string().max(200)).optional(),
  notes: z.string().max(2_000).optional(),
  baseVersion: version.optional(),
});
export type UpdateInjuryInput = z.infer<typeof updateInjuryInput>;

/** Response for every injury mutation: the profile's user doc is what's versioned. */
export const injuryMutationResponse = z.object({ injury: injuryDTO, version });
export const injuriesListResponse = z.object({ injuries: z.array(injuryDTO), version });

/**
 * POST /api/injuries/:id/apply-to-history and .../remove-from-history —
 * retroactively (arrayUnion/arrayRemove) stamp `workouts[].injuries` for
 * every workout whose `date` falls in the injury's `[onsetDate, resolvedDate
 * ?? now]` window. Idempotent: re-applying never duplicates.
 */
export const injuryHistoryOpResponse = z.object({ affectedWorkoutIds: z.array(z.string()) });

// ------------------------------------------------------------------- workouts

export const performedSet = z.object({
  setNumber: z.number().int().min(1),
  reps: z.number().min(0).optional(),
  weight: z.number().min(0).optional(),
  bodyweight: z.boolean().optional(),
  durationSeconds: z.number().min(0).optional(),
  holdSeconds: z.number().min(0).optional(),
  distance: z.number().min(0).optional(),
  calories: z.number().min(0).optional(),
  rpe: z.number().min(0).max(10).optional(),
  notes: z.string().max(500).optional(),
  /** Mid-workout completion checkbox. Server strips this on the transition to 'completed' — a finished workout's sets never carry it. */
  completed: z.boolean().optional(),
});
export type PerformedSetDTO = z.infer<typeof performedSet>;

export const performedExercise = z.object({
  order: z.number().int().min(0),
  exerciseId: z.string(),
  exerciseRefPath: z.string(),
  exerciseNameSnapshot: z.string(),
  variationId: z.string().nullable(),
  variationNameSnapshot: z.string().nullable(),
  sets: z.array(performedSet),
  notes: z.string().max(2_000).optional(),
});
export type PerformedExerciseDTO = z.infer<typeof performedExercise>;

// Matches types/workout.ts WorkoutStatus exactly (NOT 'active' — the app uses
// 'in_progress'). Missing status on a doc means 'completed' (pre-dates this
// field); the server always fills it in on the DTO so the wire type stays
// non-optional.
export const workoutStatus = z.enum(['planned', 'in_progress', 'completed']);

export const workoutDTO = z.object({
  id: z.string(),
  name: z.string().max(200),
  /** Absent for a freshly-created 'planned'/'in_progress' workout that hasn't been dated yet. */
  date: isoTimestamp.optional(),
  status: workoutStatus,
  startedAt: isoTimestamp.optional(),
  queueOrder: z.number().int().optional(),
  notes: z.string().max(2_000).optional(),
  performedExercises: z.array(performedExercise),
  injuries: z.array(z.string()).optional(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  version,
});
export type WorkoutDTO = z.infer<typeof workoutDTO>;

/**
 * Every single-workout endpoint (GET/POST/PATCH /api/workouts) wraps the DTO,
 * matching profileResponse and injuryMutationResponse. Note the 409 body is
 * different: its `remote` field carries a *bare* DTO, so `conflictEntitySchema`
 * on the client stays `workoutDTO`.
 */
export const workoutResponse = z.object({ workout: workoutDTO });
export type WorkoutResponse = z.infer<typeof workoutResponse>;

/** GET /api/workouts — cursor pages ordered by `date desc` by default. */
export const listWorkoutsQuery = listQuery.extend({
  status: workoutStatus.optional(),
});
export type ListWorkoutsQuery = z.infer<typeof listWorkoutsQuery>;

/**
 * POST /api/workouts — `id` is client-supplied (offline-created workouts
 * need a stable id before they ever reach the server) so a retried create
 * with the same `id` acknowledges the existing doc instead of duplicating.
 */
export const createWorkoutInput = z.object({
  id: z.string().min(1).max(100),
  name: z.string().max(200),
  /** Omit for a 'planned'/'in_progress' workout not yet dated. */
  date: isoTimestamp.optional(),
  status: workoutStatus,
  notes: z.string().max(2_000).optional(),
  performedExercises: z.array(performedExercise).default([]),
  injuries: z.array(z.string()).optional(),
});
export type CreateWorkoutInput = z.infer<typeof createWorkoutInput>;

/** PATCH /api/workouts/:id — full desired-state replace of the mutable fields, versioned. */
export const updateWorkoutInput = z.object({
  name: z.string().max(200).optional(),
  date: isoTimestamp.optional(),
  status: workoutStatus.optional(),
  notes: z.string().max(2_000).optional(),
  performedExercises: z.array(performedExercise).optional(),
  injuries: z.array(z.string()).optional(),
  baseVersion: version,
});
export type UpdateWorkoutInput = z.infer<typeof updateWorkoutInput>;

/** PATCH /api/workouts/reorder — bulk `queueOrder` update for planned workouts. */
export const reorderWorkoutsInput = z.object({
  order: z.array(z.object({ id: z.string(), queueOrder: z.number().int() })).min(1).max(200),
});
export type ReorderWorkoutsInput = z.infer<typeof reorderWorkoutsInput>;

// -------------------------------------------------------------------- catalog

export const TRACKING_MODES = ['reps_weight', 'reps_bodyweight', 'duration', 'distance'] as const;
export const trackingMode = z.enum(TRACKING_MODES);

export const exerciseVariationDTO = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  primaryMuscles: z.array(z.string()),
  secondaryMuscles: z.array(z.string()),
  equipment: z.string().optional(),
  angle: z.string().optional(),
  grip: z.string().optional(),
  stance: z.string().optional(),
  side: z.string().optional(),
  loadType: z.string().optional(),
  mechanics: z.string().optional(),
});

export const catalogExerciseDTO = z.object({
  id: z.string(),
  name: z.string(),
  normalizedName: z.string(),
  aliases: z.array(z.string()),
  primaryMuscles: z.array(z.string()),
  secondaryMuscles: z.array(z.string()),
  movementPattern: z.string(),
  equipment: z.array(z.string()),
  bodyRegion: z.enum(['upper', 'lower', 'core', 'full_body']),
  mechanics: z.enum(['compound', 'isolation', 'static', 'cardio']),
  forceType: z.enum(['push', 'pull', 'hinge', 'squat', 'carry', 'rotation', 'static', 'mixed']),
  trackingModes: z.array(trackingMode),
  variations: z.array(exerciseVariationDTO),
  /** Canonical catalog documents only; clients use this to reject legacy rows. */
  schemaVersion: z.literal(2),
  status: z.enum(['approved', 'pending_review']).optional(),
  createdBy: z.string().optional(),
});
export type CatalogExerciseDTO = z.infer<typeof catalogExerciseDTO>;

/**
 * GET /api/catalog — the whole approved catalog plus its cache-invalidation
 * `version` (`exerciseCatalogMeta/current.version`). Public read data, no
 * per-user fields, safe to cache; clients skip refetching while `version`
 * matches what they cached.
 */
export const catalogResponse = z.object({
  /** An empty snapshot must never replace a usable cached catalog. */
  exercises: z.array(catalogExerciseDTO).min(1),
  version: z.number().int(),
});
export type CatalogResponse = z.infer<typeof catalogResponse>;

/**
 * POST /api/catalog/pending — a user-submitted "can't find my exercise".
 * `createdBy` is never accepted from the body; the server stamps it from the
 * verified token.
 */
export const createPendingExerciseInput = z.object({
  name: z.string().min(1).max(200),
});
export type CreatePendingExerciseInput = z.infer<typeof createPendingExerciseInput>;
export const createPendingExerciseResponse = z.object({ exercise: catalogExerciseDTO });

// ---------------------------------------------------------- pushup challenge

export const challengeDay = z.object({
  date: z.string(), // YYYY-MM-DD
  dayNumber: z.number().int().min(1),
  completedAt: isoTimestamp,
});

export const pushupChallengeDTO = z.object({
  startDate: z.string().nullable(), // null = no active challenge
  days: z.array(challengeDay),
  longestStreak: z.number().int().min(0),
  version: version.nullable(), // null when the doc doesn't exist yet
});
export type PushupChallengeDTO = z.infer<typeof pushupChallengeDTO>;

/** Wrapper both /api/pushup-challenge verbs return. Same rule as workoutResponse. */
export const pushupChallengeResponse = z.object({ challenge: pushupChallengeDTO });
export type PushupChallengeResponse = z.infer<typeof pushupChallengeResponse>;

/**
 * PUT /api/pushup-challenge — full desired-state replace, same semantics as
 * the existing client `setDoc` (no partial merge): starting/restarting a run
 * overwrites `startDate`/`days` and only `longestStreak` can carry over.
 */
export const putPushupChallengeInput = z.object({
  startDate: z.string(),
  days: z.array(challengeDay),
  longestStreak: z.number().int().min(0),
  baseVersion: version.nullable().optional(),
});
export type PutPushupChallengeInput = z.infer<typeof putPushupChallengeInput>;

// ----------------------------------------------------------------- account

/**
 * DELETE /api/account/data — server-side purge of every per-user
 * Firestore collection/doc (`workouts` where `userId == uid`, legacy
 * `users/{uid}/workouts/*`, `users/{uid}/pushup-challenge/data`,
 * `users/{uid}` itself). Does NOT delete the Firebase Auth account — that
 * stays a client Auth operation, invoked only after this succeeds.
 */
export const deleteAccountDataResponse = z.object({
  deleted: z.object({
    workouts: z.number().int(),
    legacyWorkouts: z.number().int(),
    pushupChallenge: z.boolean(),
    userDoc: z.boolean(),
  }),
  /** Present when a later step failed after earlier ones committed — safe to retry. */
  partial: z.boolean(),
});
export type DeleteAccountDataResponse = z.infer<typeof deleteAccountDataResponse>;

// -------------------------------------------------------------------- sync

export const SYNCABLE_KINDS = ['workout', 'injury', 'pushupChallenge', 'profile'] as const;
export const syncableKind = z.enum(SYNCABLE_KINDS);
export type SyncableKind = z.infer<typeof syncableKind>;

/**
 * GET /api/sync/manifest — authoritative `{ id, version }` for every
 * synchronizable entity the caller owns, paged. A v1 full manifest (not an
 * incremental change log) because legacy direct Firestore clients may still
 * write during the migration grace period and would bypass a log. A local
 * record whose id is absent from the manifest and is clean (unmodified since
 * last sync) may be deleted locally; if it's dirty (local edits pending), it
 * is surfaced as a conflict instead of silently dropped.
 */
export const manifestEntry = z.object({ kind: syncableKind, id: z.string(), version });
export const manifestQuery = listQuery;
export const manifestResponse = listResponse(manifestEntry);
export type ManifestEntry = z.infer<typeof manifestEntry>;

/**
 * POST /api/sync/pull — bounded batch fetch of full entities by
 * `{ kind, id }`, for ids the manifest says are stale/missing locally.
 * Capped so a client can't force one call to return unbounded payload size.
 */
export const pullRequest = z.object({
  entities: z.array(z.object({ kind: syncableKind, id: z.string() })).min(1).max(200),
});
export type PullRequest = z.infer<typeof pullRequest>;

export const pullResponse = z.object({
  workouts: z.array(workoutDTO),
  injuries: z.array(injuryDTO),
  pushupChallenge: pushupChallengeDTO.optional(),
  profile: profileDTO.optional(),
  /** ids requested but not found (deleted, or never existed) — caller should drop them locally. */
  missing: z.array(z.object({ kind: syncableKind, id: z.string() })),
});
export type PullResponse = z.infer<typeof pullResponse>;

import type { CatalogExerciseDTO, CatalogResponse } from '../../../shared/api-contract.js';
import { ApiError } from '../http.js';
import { commit, getDoc, runQuery, ts, type DecodedValue, type FirestoreDoc } from './rest.js';

/**
 * `exercises/{id}` catalog reads + pending-submission creates, and
 * `exerciseCatalogMeta/current` for the cache-invalidation version. Exact
 * port of `utils/exercise-catalog.ts loadCatalog`'s filter (schemaVersion 2,
 * named, not pending_review) and `utils/create-pending-exercise.ts`'s id
 * reservation/default-fields, since those are the two real Firestore call
 * sites this route replaces.
 */

const EXERCISES_COLLECTION = 'exercises';
const MAX_SUFFIX_ATTEMPTS = 10;

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function asStringArray(v: DecodedValue): string[] {
  return Array.isArray(v) ? (v.filter((x) => typeof x === 'string') as string[]) : [];
}

function toCatalogExerciseDTO(doc: FirestoreDoc): CatalogExerciseDTO {
  const f = doc.fields;
  const id = doc.path.split('/').pop()!;
  return {
    id,
    name: (f.name as string) ?? '',
    normalizedName: (f.normalizedName as string) ?? '',
    aliases: asStringArray(f.aliases),
    primaryMuscles: asStringArray(f.primaryMuscles),
    secondaryMuscles: asStringArray(f.secondaryMuscles),
    movementPattern: (f.movementPattern as string) ?? '',
    equipment: asStringArray(f.equipment),
    bodyRegion: (f.bodyRegion as CatalogExerciseDTO['bodyRegion']) ?? 'full_body',
    mechanics: (f.mechanics as CatalogExerciseDTO['mechanics']) ?? 'compound',
    forceType: (f.forceType as CatalogExerciseDTO['forceType']) ?? 'mixed',
    trackingModes: asStringArray(f.trackingModes) as CatalogExerciseDTO['trackingModes'],
    variations: (Array.isArray(f.variations) ? f.variations : []).map((v) => {
      const r = v as Record<string, DecodedValue>;
      return {
        id: String(r.id ?? ''),
        name: String(r.name ?? ''),
        aliases: asStringArray(r.aliases),
        primaryMuscles: asStringArray(r.primaryMuscles),
        secondaryMuscles: asStringArray(r.secondaryMuscles),
        equipment: typeof r.equipment === 'string' ? r.equipment : undefined,
        angle: typeof r.angle === 'string' ? r.angle : undefined,
        grip: typeof r.grip === 'string' ? r.grip : undefined,
        stance: typeof r.stance === 'string' ? r.stance : undefined,
        side: typeof r.side === 'string' ? r.side : undefined,
        loadType: typeof r.loadType === 'string' ? r.loadType : undefined,
        mechanics: typeof r.mechanics === 'string' ? r.mechanics : undefined,
      };
    }),
    status: f.status as CatalogExerciseDTO['status'],
    createdBy: typeof f.createdBy === 'string' ? f.createdBy : undefined,
  };
}

/** Filter matches loadCatalog() exactly: only approved, named, current-schema exercises are ever returned. Pending submissions (which carry createdBy) never leak into this response. Pure -- operates on decoded fields, not the live doc, so it's directly unit-testable. */
export function isPublicCatalogEntry(fields: Record<string, DecodedValue>): boolean {
  return fields.schemaVersion === 2 && !!fields.name && fields.status !== 'pending_review';
}

export async function getCatalog(): Promise<CatalogResponse> {
  const [meta, docs] = await Promise.all([
    getDoc('exerciseCatalogMeta/current'),
    runQuery({ collectionId: EXERCISES_COLLECTION, limit: 5000 }),
  ]);

  return {
    exercises: docs.filter((d) => isPublicCatalogEntry(d.fields)).map(toCatalogExerciseDTO),
    version: typeof meta?.fields.version === 'number' ? meta.fields.version : 0,
  };
}

async function reserveExerciseId(baseId: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_SUFFIX_ATTEMPTS; attempt++) {
    const candidateId = attempt === 1 ? baseId : `${baseId}-${attempt}`;
    const existing = await getDoc(`${EXERCISES_COLLECTION}/${candidateId}`, ['name']);
    if (!existing) return candidateId;
  }
  throw new ApiError(409, `Could not reserve an exercise id for ${baseId}`);
}

/** createdBy is ALWAYS the verified uid, never taken from the request -- this is the one thing that must never be spoofable here. */
export async function createPendingExercise(uid: string, name: string): Promise<CatalogExerciseDTO> {
  const trimmed = name.trim();
  if (!trimmed) throw new ApiError(400, 'Exercise name is required');

  const id = await reserveExerciseId(`pending-${slugify(trimmed)}`);
  const now = ts(new Date().toISOString());

  const fields: Record<string, unknown> = {
    id,
    name: trimmed,
    normalizedName: trimmed.toLowerCase(),
    aliases: [],
    primaryMuscles: [],
    secondaryMuscles: [],
    movementPattern: '',
    equipment: [],
    bodyRegion: 'full_body',
    mechanics: 'compound',
    forceType: 'mixed',
    trackingModes: ['reps_weight'],
    variations: [],
    schemaVersion: 2,
    status: 'pending_review',
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
  };

  await commit([{ path: `${EXERCISES_COLLECTION}/${id}`, fields, updateMask: Object.keys(fields), currentDocument: { exists: false } }]);

  const created = await getDoc(`${EXERCISES_COLLECTION}/${id}`);
  return toCatalogExerciseDTO(created!);
}

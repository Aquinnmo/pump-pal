import { auth } from '@/config/firebase';
import { catalogRepository } from '@/data/catalog-repository';
import { CatalogExercise, ExerciseSearchOption } from '@/types/workout';
import { createCatalogLoader } from './catalog-loader';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CATALOG_CACHE_KEY = 'pumppal_catalog_v2';
const CATALOG_VERSION_KEY = 'pumppal_catalog_version_v2';

async function readCache(): Promise<CatalogExercise[] | null> {
  const cached = await AsyncStorage.getItem(CATALOG_CACHE_KEY);
  if (!cached) return null;
  try {
    return JSON.parse(cached) as CatalogExercise[];
  } catch {
    return null;
  }
}

async function writeCache(catalog: CatalogExercise[], version: number): Promise<void> {
  await AsyncStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(catalog));
  await AsyncStorage.setItem(CATALOG_VERSION_KEY, String(version));
}

const catalogLoader = createCatalogLoader(catalogRepository, { read: readCache, write: writeCache });

/**
 * Passing the authenticated uid avoids depending on Firebase's global auth
 * state during bootstrap; callers outside auth setup can keep using the
 * current-user default.
 */
export function loadCatalog(uid: string | null | undefined = auth.currentUser?.uid): Promise<CatalogExercise[]> {
  return catalogLoader.load(uid);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function buildSearchOptions(catalog: CatalogExercise[]): ExerciseSearchOption[] {
  const options: ExerciseSearchOption[] = [];

  catalog.forEach((ex) => {
    const baseAliases = ex.aliases ?? [];
    options.push({
      label: ex.name,
      exerciseId: ex.id,
      variationId: null,
      tokens: tokenize(ex.name),
      aliases: baseAliases.map((a) => a.toLowerCase()),
      primaryMuscles: ex.primaryMuscles ?? [],
      equipment: ex.equipment ?? [],
    });

    (ex.variations ?? []).forEach((variation) => {
      options.push({
        label: variation.name,
        exerciseId: ex.id,
        variationId: variation.id,
        tokens: tokenize(variation.name),
        aliases: [...baseAliases, ...(variation.aliases ?? [])].map((a) => a.toLowerCase()),
        primaryMuscles: ex.primaryMuscles ?? [],
        equipment: ex.equipment ?? [],
      });
    });
  });

  return options;
}

export function rankSearchOptions(
  options: ExerciseSearchOption[],
  query: string,
  recentLabels: string[]
): ExerciseSearchOption[] {
  const trimmed = query.trim().toLowerCase();

  if (!trimmed) {
    const recentSet = new Map(recentLabels.map((label, i) => [label, i]));
    return [...options].sort((a, b) => {
      const ra = recentSet.has(a.label) ? recentSet.get(a.label)! : Infinity;
      const rb = recentSet.has(b.label) ? recentSet.get(b.label)! : Infinity;
      if (ra !== rb) return ra - rb;
      return a.label.localeCompare(b.label);
    });
  }

  const queryTokens = tokenize(trimmed);
  const recentSet = new Set(recentLabels);

  const tiered: { option: ExerciseSearchOption; tier: number }[] = [];

  options.forEach((option) => {
    const label = option.label.toLowerCase();
    let tier = -1;

    if (recentSet.has(option.label) && label === trimmed) {
      tier = 0;
    } else if (label === trimmed) {
      tier = 1;
    } else if (label.startsWith(trimmed)) {
      tier = 2;
    } else if (option.aliases.some((a) => a === trimmed || a.startsWith(trimmed))) {
      tier = 3;
    } else if (queryTokens.every((t) => option.tokens.some((tok) => tok.includes(t)))) {
      tier = 4;
    } else if (
      option.primaryMuscles.some((m) => m.toLowerCase().includes(trimmed)) ||
      option.equipment.some((e) => e.toLowerCase().includes(trimmed))
    ) {
      tier = 5;
    }

    if (tier >= 0) tiered.push({ option, tier });
  });

  tiered.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return a.option.label.localeCompare(b.option.label);
  });

  return tiered.map((t) => t.option);
}

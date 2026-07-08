import { db } from '@/config/firebase';
import { CatalogExercise, ExerciseCatalogMeta, ExerciseSearchOption } from '@/types/workout';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';

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

export async function loadCatalog(): Promise<CatalogExercise[]> {
  try {
    const metaSnap = await getDoc(doc(db, 'exerciseCatalogMeta', 'current'));
    const meta = metaSnap.exists() ? (metaSnap.data() as ExerciseCatalogMeta) : null;
    const cachedVersion = await AsyncStorage.getItem(CATALOG_VERSION_KEY);

    if (meta && cachedVersion !== null && Number(cachedVersion) === meta.version) {
      const cached = await readCache();
      if (cached) return cached;
    }

    const snap = await getDocs(collection(db, 'exercises'));
    const catalog = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as CatalogExercise)
      .filter((ex) => ex.schemaVersion === 2 && !!ex.name && ex.status !== 'pending_review');

    if (meta) await writeCache(catalog, meta.version);
    return catalog;
  } catch {
    const cached = await readCache();
    return cached ?? [];
  }
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

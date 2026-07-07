import { useAuth } from '@/context/auth-context';
import { CatalogExercise, ExerciseSearchOption } from '@/types/workout';
import { buildSearchOptions, loadCatalog } from '@/utils/exercise-catalog';
import { useEffect, useMemo, useState } from 'react';

export function useExerciseCatalog() {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState<CatalogExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const loaded = await loadCatalog();
        if (!cancelled) setCatalog(loaded);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Could not load exercise catalog.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const options = useMemo(() => buildSearchOptions(catalog), [catalog]);

  const byId = useMemo(() => {
    const map = new Map<string, CatalogExercise>();
    catalog.forEach((ex) => map.set(ex.id, ex));
    return map;
  }, [catalog]);

  return { options, byId, loading, error } as {
    options: ExerciseSearchOption[];
    byId: Map<string, CatalogExercise>;
    loading: boolean;
    error: string | null;
  };
}

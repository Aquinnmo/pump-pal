import { AnalyticsNavigationRow } from "@/ui/analytics-navigation-row";
import type { CatalogExercise, Workout } from "@/types/workout";
import { loadCatalog } from "@/lib/exercise-catalog";
import { computeMuscleLoad } from "@/lib/muscle-load";
import { router } from "expo-router";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { StyleSheet, Text } from "react-native";

interface MuscleLoadSummaryProps {
  workouts: Workout[];
}

export function MuscleLoadSummary({ workouts }: MuscleLoadSummaryProps) {
  const [catalog, setCatalog] = useState<CatalogExercise[] | null>(null);
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);

  const fetchCatalog = useCallback(async () => {
    setCatalogUnavailable(false);
    const loaded = await loadCatalog();
    if (loaded.length === 0) {
      setCatalogUnavailable(true);
      return;
    }
    setCatalog(loaded);
  }, []);

  useEffect(() => {
    void fetchCatalog();
  }, [fetchCatalog]);

  const result = useMemo(
    () => (catalog ? computeMuscleLoad(workouts, catalog) : null),
    [catalog, workouts],
  );
  const noMappedWork =
    result != null && result.muscles.every((stat) => stat.score === 0);
  const hasPartialMapping = (result?.coverage.unmatchedExercises ?? 0) > 0;

  let body: ReactNode = null;
  let accessibilityLabel: string;
  if (catalogUnavailable) {
    body = (
      <Text style={styles.message} selectable>
        Exercise catalog unavailable. Open muscle load to try again.
      </Text>
    );
    accessibilityLabel =
      "Recent muscle load. Exercise catalog unavailable. Open muscle load to try again.";
  } else if (result == null) {
    accessibilityLabel = "Recent muscle load. Mapping your recent work.";
  } else if (noMappedWork) {
    body = (
      <Text style={styles.message} selectable>
        No muscle load detected in the past 7 days.
      </Text>
    );
    accessibilityLabel =
      "Recent muscle load. No mapped work in the past 7 days.";
  } else {
    body = hasPartialMapping ? (
      <Text style={styles.message} selectable>
        Some exercises could not be mapped.
      </Text>
    ) : null;
    accessibilityLabel = `Recent muscle load. Past 7 days.${hasPartialMapping ? " Some exercises are not mapped yet." : ""}`;
  }

  return (
    <AnalyticsNavigationRow
      title="Muscular Load"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Opens the full muscle load diagram"
      onPress={() => router.push("/muscle-load")}
    >
      {body}
    </AnalyticsNavigationRow>
  );
}

const styles = StyleSheet.create({
  message: { color: "#888", fontSize: 14, fontWeight: "500", lineHeight: 20 },
});

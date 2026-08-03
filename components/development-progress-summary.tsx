import { AnalyticsNavigationRow } from "@/components/analytics-navigation-row";
import type { CatalogExercise, Workout } from "@/types/workout";
import { loadCatalog } from "@/utils/exercise-catalog";
import { computeMuscleDevelopment } from "@/utils/muscle-development";
import { router } from "expo-router";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { StyleSheet, Text } from "react-native";

interface DevelopmentProgressSummaryProps {
  workouts: Workout[];
}

export function DevelopmentProgressSummary({
  workouts,
}: DevelopmentProgressSummaryProps) {
  const [catalog, setCatalog] = useState<CatalogExercise[] | null>(null);
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);

  const fetchCatalog = useCallback(async () => {
    setCatalogUnavailable(false);
    const loaded = await loadCatalog();
    if (loaded.length === 0) {
      setCatalog(null);
      setCatalogUnavailable(true);
      return;
    }
    setCatalog(loaded);
  }, []);

  useEffect(() => {
    void fetchCatalog();
  }, [fetchCatalog]);

  const result = useMemo(
    () => (catalog ? computeMuscleDevelopment(workouts, catalog) : null),
    [catalog, workouts],
  );
  const noComparableHistory =
    result != null && result.coverage.comparableSignals === 0;
  const hasPartialMapping = (result?.coverage.unmatchedExercises ?? 0) > 0;

  let body: ReactNode = null;
  let accessibilityLabel: string;
  if (catalogUnavailable) {
    body = (
      <Text style={styles.message} selectable>
        Exercise catalog unavailable. Open Development Progress to try again.
      </Text>
    );
    accessibilityLabel =
      "Development Progress. Exercise catalog unavailable. Open Development Progress to try again.";
  } else if (result == null) {
    accessibilityLabel = "Development Progress. Comparing your training.";
  } else if (noComparableHistory) {
    body = (
      <Text style={styles.message} selectable>
        Not enough comparable history yet.
      </Text>
    );
    accessibilityLabel =
      "Development Progress. Not enough comparable history yet.";
  } else {
    body = hasPartialMapping ? (
      <Text style={styles.message} selectable>
        Some exercises could not be mapped.
      </Text>
    ) : null;
    accessibilityLabel = `Development Progress. Last 90 days compared with the previous 90 days.${hasPartialMapping ? " Some exercises could not be mapped." : ""}`;
  }

  return (
    <AnalyticsNavigationRow
      title="Development Progress"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Opens the full Development Progress diagram"
      onPress={() => router.push("/development-progress")}
    >
      {body}
    </AnalyticsNavigationRow>
  );
}

const styles = StyleSheet.create({
  message: { color: "#888", fontSize: 14, fontWeight: "500", lineHeight: 20 },
});

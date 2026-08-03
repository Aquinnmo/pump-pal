import type { CatalogExercise, Workout } from "@/types/workout";
import { loadCatalog } from "@/utils/exercise-catalog";
import { computeMuscleLoad } from "@/utils/muscle-load";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

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

  let body: ReactNode;
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
    body = (
      <View style={styles.loadingRow}>
        <ActivityIndicator color="#e54242" />
        <Text style={styles.message} selectable>
          Mapping your recent work
        </Text>
      </View>
    );
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
    body = (
      hasPartialMapping ? (
        <Text style={styles.message} selectable>
          Some recent exercises are not mapped yet.
        </Text>
      ) : null
    );
    accessibilityLabel = `Recent muscle load.${hasPartialMapping ? " Some recent exercises are not mapped yet." : ""}`;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Opens the full muscle load diagram"
      onPress={() => router.push("/muscle-load")}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <Text style={styles.title} selectable>
          Recent muscle load
        </Text>
        <Ionicons name="chevron-forward" size={22} color="#888" />
      </View>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 44,
    backgroundColor: "#1c1c1c",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 14,
    borderCurve: "continuous",
    padding: 16,
    gap: 16,
  },
  pressed: { opacity: 0.8 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: { flex: 1, color: "#fff", fontSize: 18, fontWeight: "700", lineHeight: 22 },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 24,
  },
  message: { color: "#888", fontSize: 14, fontWeight: "500", lineHeight: 20 },
});

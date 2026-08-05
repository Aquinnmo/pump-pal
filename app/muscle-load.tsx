import { MuscleLoadMap } from "@/components/muscle-load-map";
import { FadingScrollView } from "@/components/ui/fading-scroll-view";
import { workoutRepository } from "@/db/workout-repository";
import { useAuth } from "@/context/auth-context";
import type { CatalogExercise, Workout } from "@/types/workout";
import { loadCatalog } from "@/utils/exercise-catalog";
import { computeMuscleLoad } from "@/utils/muscle-load";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
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

export default function MuscleLoadScreen() {
  const { user } = useAuth();
  const [workouts, setWorkouts] = useState<Workout[] | null>(null);
  const [catalog, setCatalog] = useState<CatalogExercise[] | null>(null);
  const [workoutError, setWorkoutError] = useState(false);
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);

  const loadPage = useCallback(async () => {
    if (!user) return;
    setWorkouts(null);
    setCatalog(null);
    setWorkoutError(false);
    setCatalogUnavailable(false);
    try {
      const [storedWorkouts, loadedCatalog] = await Promise.all([
        workoutRepository.getAll(user.uid),
        loadCatalog(),
      ]);
      setWorkouts(storedWorkouts.map((record) => record.data));
      if (loadedCatalog.length === 0) {
        setCatalogUnavailable(true);
      } else {
        setCatalog(loadedCatalog);
      }
    } catch (error) {
      console.error(error);
      setWorkoutError(true);
    }
  }, [user]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const result = useMemo(
    () => (workouts && catalog ? computeMuscleLoad(workouts, catalog) : null),
    [catalog, workouts],
  );

  let content: ReactNode;
  if (!user) {
    content = (
      <StatePanel
        title="Sign in to view muscle load"
        message="Muscle load is based on your logged workouts."
      />
    );
  } else if (workoutError) {
    content = (
      <StatePanel
        icon="cloud-offline-outline"
        title="Workout history unavailable"
        message="Timber could not load your workout history, so it cannot calculate muscle load."
        action="Try again"
        onAction={loadPage}
      />
    );
  } else if (catalogUnavailable) {
    content = (
      <StatePanel
        icon="cloud-offline-outline"
        title="Muscle map unavailable"
        message="The exercise catalog could not be loaded, so Timber cannot safely map your work."
        action="Try again"
        onAction={loadPage}
      />
    );
  } else if (result == null) {
    content = (
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Mapping your recent muscle work"
        style={styles.loading}
      >
        <ActivityIndicator color="#e54242" />
        <Text style={styles.loadingText} selectable>
          Mapping your recent work
        </Text>
      </View>
    );
  } else if (workouts != null && workouts.length === 0) {
    content = (
      <StatePanel
        icon="barbell-outline"
        title="No workouts yet"
        message="Log a session and Timber will map the work across your muscles."
        action="Start a workout"
        onAction={() => router.push("/active-workout")}
      />
    );
  } else {
    content = <MuscleLoadMap result={result} />;
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "Muscular Load",
          headerStyle: { backgroundColor: "#0f0f0f" },
          headerTintColor: "#fff",
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: "#0f0f0f" },
        }}
      />
      <FadingScrollView contentContainerStyle={styles.content}>
        {content}
      </FadingScrollView>
    </>
  );
}

function StatePanel({
  icon = "information-circle-outline",
  title,
  message,
  action,
  onAction,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.statePanel}>
      <Ionicons name={icon} size={28} color="#e54242" />
      <Text style={styles.stateTitle} selectable>
        {title}
      </Text>
      <Text style={styles.stateMessage} selectable>
        {message}
      </Text>
      {action && onAction && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action}
          onPress={onAction}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  loading: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  statePanel: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#1c1c1c",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 14,
    borderCurve: "continuous",
    padding: 20,
  },
  stateTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 22,
    textAlign: "center",
  },
  stateMessage: {
    color: "#888",
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
    textAlign: "center",
  },
  action: {
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: "#e54242",
    paddingHorizontal: 16,
  },
  actionText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  pressed: { opacity: 0.8 },
});

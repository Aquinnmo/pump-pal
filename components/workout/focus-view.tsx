import { DraftExerciseRow } from "@/types/workout";
import { flattenSets, nextSetIndex } from "@/utils/wear-state";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Single-set-at-a-time layout for a live workout: a horizontal strip of exercise
// cards, the current set's numbers, and one big button to mark it done. The cursor
// is derived from the exact same flattenSets/nextSetIndex pair the watch and the
// Android live notification use, so all three surfaces always agree on "next set" —
// no cursor logic lives here.

const CARD_WIDTH = 150;
const CARD_GAP = 8;

type FocusViewProps = {
  exercises: DraftExerciseRow[];
  saving: boolean;
  onCompleteSet: () => void;
  onUndo: () => void;
  onFinish: () => void;
  onEdit: () => void;
  onOpenPlateCalc: () => void;
};

function formatMSS(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type CardState = "complete" | "in-progress" | "not-started";

export function FocusView({
  exercises,
  saving,
  onCompleteSet,
  onUndo,
  onFinish,
  onEdit,
  onOpenPlateCalc,
}: FocusViewProps) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<DraftExerciseRow>>(null);

  const flat = useMemo(() => flattenSets(exercises), [exercises]);
  const nextIdx = useMemo(() => nextSetIndex(flat.map((f) => f.set)), [flat]);
  const done = nextIdx === -1;
  const current = !done ? flat[nextIdx] : null;
  const completedCount = flat.filter((f) => f.set.completed).length;
  const totalCount = flat.length;

  // Rows that actually carry sets — mirrors flattenSets' own filter, so the bar's
  // indices line up with rowIndex values coming out of flat/current.
  const rows = useMemo(
    () => exercises.filter((ex) => ex.label.trim() !== ""),
    [exercises],
  );
  const currentRowIndex = current
    ? rows.findIndex((r) => r.uid === exercises[current.rowIndex].uid)
    : -1;

  useEffect(() => {
    if (currentRowIndex < 0) return;
    listRef.current?.scrollToIndex({
      index: currentRowIndex,
      viewPosition: 0.5,
      animated: true,
    });
  }, [currentRowIndex]);

  const cardState = (row: DraftExerciseRow, rowIndex: number): CardState => {
    if (row.sets.length > 0 && row.sets.every((s) => s.completed)) return "complete";
    if (row.sets.some((s) => s.completed) || rowIndex === currentRowIndex) return "in-progress";
    return "not-started";
  };

  const handleCompleteSet = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCompleteSet();
  };

  const handleFinish = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onFinish();
  };

  const currentRow = current ? exercises[current.rowIndex] : null;
  const currentSet = current?.set ?? null;
  const isDuration = currentRow?.exerciseType === "Sets of Duration";

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={rows}
        horizontal
        keyExtractor={(item) => item.uid}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.barContent}
        getItemLayout={(_, index) => ({
          length: CARD_WIDTH + CARD_GAP,
          offset: (CARD_WIDTH + CARD_GAP) * index,
          index,
        })}
        onScrollToIndexFailed={({ index }) => {
          // Rare timing edge (list not yet measured) — retry once next frame rather
          // than silently leaving the bar off-center.
          requestAnimationFrame(() =>
            listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true }),
          );
        }}
        renderItem={({ item, index }) => {
          const state = done ? "complete" : cardState(item, index);
          return (
            <View
              style={[
                styles.exCard,
                state === "in-progress" && styles.exCardInProgress,
                state === "complete" && styles.exCardComplete,
              ]}
            >
              <Text style={styles.exCardText} numberOfLines={1} ellipsizeMode="tail">
                {item.label} x
                <Text style={styles.tabularNums}>{item.sets.length}</Text>
              </Text>
            </View>
          );
        }}
      />

      <View style={styles.infoZone}>
        {done ? (
          <>
            <Text style={styles.eyebrow}>ALL SETS COMPLETE</Text>
            <Text style={[styles.metric, styles.tabularNums]}>
              {completedCount}/{totalCount}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.eyebrow}>
              SET <Text style={styles.tabularNums}>{current!.setIndex + 1}</Text> OF{" "}
              <Text style={styles.tabularNums}>{currentRow!.sets.length}</Text>
            </Text>
            <Text style={[styles.metric, styles.tabularNums]}>
              {isDuration
                ? formatMSS(
                    (Number(currentSet!.durationMinutes) || 0) * 60 +
                      (Number(currentSet!.durationSeconds) || 0),
                  )
                : currentRow!.bodyweight || currentSet!.weight.trim() === ""
                  ? `${currentSet!.reps} reps`
                  : `${currentSet!.reps} × ${currentSet!.weight} lbs`}
            </Text>
            <Text style={styles.exerciseLabel} numberOfLines={1}>
              {currentRow!.label}
            </Text>
          </>
        )}
      </View>

      <TouchableOpacity
        style={styles.completeButton}
        onPress={done ? handleFinish : handleCompleteSet}
        disabled={done && saving}
        activeOpacity={0.8}
      >
        {done && saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.completeButtonText}>
            {done ? "Finish Workout" : "Complete Set"}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.undoButton, completedCount === 0 && styles.undoButtonDisabled]}
        onPress={onUndo}
        disabled={completedCount === 0}
        activeOpacity={0.8}
      >
        <Text
          style={[
            styles.undoButtonText,
            completedCount === 0 && styles.undoButtonTextDisabled,
          ]}
        >
          Undo last set
        </Text>
      </TouchableOpacity>

      <View style={[styles.pillRow, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <TouchableOpacity style={styles.pill} onPress={onEdit} activeOpacity={0.8}>
          <Ionicons name="create-outline" size={16} color="#888" />
          <Text style={styles.pillText}>Edit workout</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.pill} onPress={onOpenPlateCalc} activeOpacity={0.8}>
          <Ionicons name="calculator-outline" size={16} color="#888" />
          <Text style={styles.pillText}>Plate calculator</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  tabularNums: {
    fontVariant: ["tabular-nums"],
  },
  barContent: {
    gap: CARD_GAP,
    paddingVertical: 16,
  },
  exCard: {
    width: CARD_WIDTH,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderCurve: "continuous",
    backgroundColor: "#1c1c1c",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    justifyContent: "center",
  },
  exCardInProgress: {
    backgroundColor: "rgba(229, 66, 66, 0.08)",
    borderColor: "rgba(229, 66, 66, 0.24)",
  },
  exCardComplete: {
    backgroundColor: "rgba(229, 66, 66, 0.08)",
    borderColor: "rgba(229, 66, 66, 0.35)",
  },
  exCardText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  infoZone: {
    alignItems: "center",
    paddingVertical: 16,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    color: "#888",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  metric: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
    lineHeight: 24 * 1.2,
    color: "#fff",
  },
  exerciseLabel: {
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 14 * 1.4,
    color: "#888",
    marginTop: 8,
  },
  completeButton: {
    flex: 1,
    backgroundColor: "#e54242",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#e54242",
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  completeButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
  undoButton: {
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1c1c1c",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 14,
    marginTop: 12,
  },
  undoButtonDisabled: {
    opacity: 0.5,
  },
  undoButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#888",
  },
  undoButtonTextDisabled: {
    color: "#666",
  },
  pillRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  pill: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#1c1c1c",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 999,
  },
  pillText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#888",
  },
});

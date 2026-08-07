import { SetField, SetFields } from "@/components/workout/set-fields";
import { DraftExerciseRow } from "@/types/workout";
import { flattenSets, nextSetIndex } from "@/utils/wear-state";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  LayoutChangeEvent,
  ScrollView,
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

const CARD_GAP = 8;

type FocusViewProps = {
  exercises: DraftExerciseRow[];
  saving: boolean;
  onCompleteSet: () => void;
  onUndo: () => void;
  onFinish: () => void;
  onEdit: () => void;
  onOpenPlateCalc: () => void;
  onUpdateSet: (
    index: number,
    setIdx: number,
    field: SetField,
    value: string,
  ) => void;
  onIncrementSet: (index: number, setIdx: number) => void;
  onDecrementSet: (index: number, setIdx: number) => void;
};

type CardState = "complete" | "in-progress" | "not-started";

const ACCENT = "#e54242";
// Amber for partially-logged exercises. Matches the AOD notification's
// COLOR_IN_PROGRESS in LiveUpdateNotificationModule.kt — keep the two in step.
const IN_PROGRESS = "#fbbf24";
const NOT_STARTED = "#444";

// The card you are on takes a solid border in its own state colour, so "where am I"
// and "how done is it" stay readable as two separate signals.
const CURRENT_BORDER: Record<CardState, { borderColor: string }> = {
  complete: { borderColor: ACCENT },
  "in-progress": { borderColor: IN_PROGRESS },
  "not-started": { borderColor: "#888" },
};

// Segment-bar fill colour, one per exercise state — same three-state palette as
// CURRENT_BORDER above, just solid fills instead of borders.
const SEGMENT_COLOR: Record<CardState, { backgroundColor: string }> = {
  complete: { backgroundColor: ACCENT },
  "in-progress": { backgroundColor: IN_PROGRESS },
  "not-started": { backgroundColor: NOT_STARTED },
};

export function FocusView({
  exercises,
  saving,
  onCompleteSet,
  onUndo,
  onFinish,
  onEdit,
  onOpenPlateCalc,
  onUpdateSet,
  onIncrementSet,
  onDecrementSet,
}: FocusViewProps) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<ScrollView>(null);
  // Cards size to their own text, so their offsets can't be computed up front —
  // each one reports its layout here and the bar centres the current one from that.
  const cardLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const barWidth = useRef(0);

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

  const currentUid = currentRowIndex >= 0 ? rows[currentRowIndex].uid : null;
  const previousCompletedCount = useRef(completedCount);
  const previousCurrentUid = useRef(currentUid);

  const centerCurrent = (animated: boolean) => {
    if (!currentUid) return;
    const card = cardLayouts.current[currentUid];
    if (!card || barWidth.current === 0) return;
    listRef.current?.scrollTo({
      x: Math.max(0, card.x + card.width / 2 - barWidth.current / 2),
      animated,
    });
  };

  useEffect(() => {
    centerCurrent(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUid]);

  // A set completed within the same exercise advances the cursor without changing
  // currentUid, so the transition effect above does not run. Detect that progress
  // separately and restore the current card after the user has scrolled the strip.
  // Exercise transitions remain owned by the effect above, and the final set has no
  // currentUid, so it deliberately leaves the bar where it is.
  useEffect(() => {
    const completionAdvanced =
      completedCount > previousCompletedCount.current;
    const stayedOnCurrentExercise =
      currentUid === previousCurrentUid.current;

    previousCompletedCount.current = completedCount;
    previousCurrentUid.current = currentUid;

    if (completionAdvanced && stayedOnCurrentExercise && currentUid) {
      centerCurrent(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedCount, currentUid]);

  // Strictly about how much of the exercise is logged — being the exercise you are
  // currently on is a separate axis, drawn as the border emphasis below.
  const cardState = (row: DraftExerciseRow): CardState => {
    if (row.sets.length > 0 && row.sets.every((s) => s.completed))
      return "complete";
    if (row.sets.some((s) => s.completed)) return "in-progress";
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

  return (
    <View style={styles.container}>
      <View style={styles.segmentBar}>
        {rows.map((item) => {
          const state = done ? "complete" : cardState(item);
          return (
            <View
              key={item.uid}
              style={[
                styles.segment,
                { flex: item.sets.length || 1 },
                SEGMENT_COLOR[state],
              ]}
            />
          );
        })}
      </View>

      <View style={styles.bar}>
        <ScrollView
          ref={listRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.barContent}
          onLayout={(e: LayoutChangeEvent) => {
            barWidth.current = e.nativeEvent.layout.width;
            centerCurrent(false);
          }}
        >
          {rows.map((item) => {
            const state = done ? "complete" : cardState(item);
            const isCurrent = item.uid === currentUid;
            return (
              <View
                key={item.uid}
                onLayout={(e: LayoutChangeEvent) => {
                  const { x, width } = e.nativeEvent.layout;
                  cardLayouts.current[item.uid] = { x, width };
                  if (isCurrent) centerCurrent(false);
                }}
                style={[
                  styles.exCard,
                  state === "in-progress" && styles.exCardInProgress,
                  state === "complete" && styles.exCardComplete,
                  isCurrent && CURRENT_BORDER[state],
                ]}
              >
                <Text
                  style={[
                    styles.exCardText,
                    !isCurrent && styles.exCardTextMuted,
                  ]}
                  numberOfLines={1}
                >
                  {item.label} x
                  <Text style={styles.tabularNums}>{item.sets.length}</Text>
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.infoZone}>
        {done ? (
          <View style={styles.doneZone}>
            <Text style={styles.eyebrow}>ALL SETS COMPLETE</Text>
            <Text style={[styles.metric, styles.tabularNums]}>
              {completedCount}/{totalCount}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.setHeaderRow}>
              <Text style={styles.eyebrow}>
                SET{" "}
                <Text style={styles.tabularNums}>{current!.setIndex + 1}</Text>{" "}
                OF{" "}
                <Text style={styles.tabularNums}>
                  {currentRow!.sets.length}
                </Text>
              </Text>
              <Text style={styles.exerciseLabel} numberOfLines={1}>
                {currentRow!.label}
              </Text>
            </View>
            <View style={styles.setFieldsRow}>
              <SetFields
                set={currentSet!}
                exerciseType={currentRow!.exerciseType}
                bodyweight={currentRow!.bodyweight}
                onUpdate={(field, v) =>
                  onUpdateSet(current!.rowIndex, current!.setIndex, field, v)
                }
                onIncrement={() =>
                  onIncrementSet(current!.rowIndex, current!.setIndex)
                }
                onDecrement={() =>
                  onDecrementSet(current!.rowIndex, current!.setIndex)
                }
              />
            </View>
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
          <>
            <Text style={styles.completeButtonText}>
              {done
                ? "Finish Workout"
                : `Complete Set ${current!.setIndex + 1}`}
            </Text>
            <Ionicons
              name={done ? "checkmark-sharp" : "arrow-forward"}
              size={56}
              color="#fff"
            />
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.undoButton,
          completedCount === 0 && styles.undoButtonDisabled,
        ]}
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

      <View
        style={[styles.pillRow, { paddingBottom: Math.max(insets.bottom, 20) }]}
      >
        <TouchableOpacity
          style={styles.pill}
          onPress={onEdit}
          activeOpacity={0.8}
        >
          <Ionicons name="create-outline" size={16} color="#888" />
          <Text style={styles.pillText}>Edit workout</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pill, styles.pillAccent]}
          onPress={onOpenPlateCalc}
          activeOpacity={0.8}
        >
          <Ionicons name="calculator-outline" size={16} color="#e54242" />
          <Text style={[styles.pillText, styles.pillTextAccent]}>
            Plate calculator
          </Text>
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
  segmentBar: {
    flexDirection: "row",
    gap: 4,
    paddingTop: 12,
  },
  segment: {
    height: 6,
    borderRadius: 999,
  },
  bar: {
    // Bleed past the screen gutter so the strip scrolls edge to edge; the gutter is
    // restored as content padding so the first/last card still line up with the rest.
    marginHorizontal: -20,
    paddingVertical: 12,
    backgroundColor: "#151515",
    borderBottomWidth: 1,
    borderBottomColor: "#1e1e1e",
  },
  barContent: {
    gap: CARD_GAP,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  exCard: {
    // No fixed width — each card hugs its own label. A very long exercise name is
    // capped so one card can't take the whole bar; the strip scrolls either way.
    maxWidth: 220,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderCurve: "continuous",
    backgroundColor: "#1c1c1c",
    // 2px on every card, not just the current one, so promoting a card to the
    // current state doesn't reflow the strip by a pixel.
    borderWidth: 2,
    borderColor: "#2a2a2a",
  },
  exCardInProgress: {
    backgroundColor: "rgba(251, 191, 36, 0.08)",
    borderColor: "rgba(251, 191, 36, 0.24)",
  },
  exCardComplete: {
    backgroundColor: "rgba(229, 66, 66, 0.08)",
    borderColor: "rgba(229, 66, 66, 0.35)",
  },
  exCardText: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 14 * 1.4,
    color: "#fff",
  },
  exCardTextMuted: {
    color: "#888",
  },
  infoZone: {
    // Sits on the page itself — only the exercise strip above is banded chrome.
    paddingVertical: 16,
  },
  doneZone: {
    alignItems: "center",
  },
  setHeaderRow: {
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  setFieldsRow: {
    flexDirection: "row",
    gap: 8,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    color: "#888",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  metric: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
    lineHeight: 24 * 1.2,
    color: "#fff",
    marginTop: 8,
  },
  exerciseLabel: {
    flexShrink: 1,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
    lineHeight: 24 * 1.2,
    color: "#fff",
  },
  completeButton: {
    flex: 1,
    marginTop: 16,
    backgroundColor: "#e54242",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#e54242",
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  completeButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 24,
    letterSpacing: -0.5,
  },
  undoButton: {
    // Info blue, not the accent — stepping back is not the same class of action as
    // completing a set, and the accent is the screen's single action colour.
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(96, 165, 250, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.24)",
    borderRadius: 14,
    marginTop: 12,
  },
  undoButtonDisabled: {
    opacity: 0.5,
  },
  undoButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#60a5fa",
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
  // Carries over the outlined look the plate-calc FAB had in the editor, so the
  // control stays recognisable as the same tool across both views.
  pillAccent: {
    backgroundColor: "#271515",
    borderColor: "#e54242",
  },
  pillText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#888",
  },
  pillTextAccent: {
    color: "#e54242",
  },
});

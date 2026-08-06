import { Dropdown } from "@/components/ui/dropdown";
import { PlateCalculator } from "@/components/ui/plate-calculator";
import { Toast } from "@/components/ui/toast";
import { ExerciseCard } from "@/components/workout/exercise-card";
import { FocusView } from "@/components/workout/focus-view";
import { profileRepository } from "@/db/profile-repository";
import { workoutRepository } from "@/db/workout-repository";
import { triggerSyncAfterWrite } from "@/db/sync-trigger";
import { isSplitOption } from "@/constants/split-options";
import { SPLIT_WORKOUT_NAMES } from "@/constants/split-workout-names";
import { useAuth } from "@/context/auth-context";
import { useDraftExercises } from "@/hooks/use-draft-exercises";
import { useExerciseCatalog } from "@/hooks/use-exercise-catalog";
import { TEMPORARY_AI_DAILY_LIMIT } from "@/shared/ai-contract";
import { DraftExerciseRow, PerformedExercise, Workout } from "@/types/workout";
import { formatAIError } from "@/utils/ai-client";
import { useAIGenerationAvailable } from "@/utils/use-ai-connectivity";
import { showAlert } from "@/utils/alert";
import { createPendingExercise } from "@/utils/create-pending-exercise";
import { getOngoingInjuries, getOngoingInjuryIds } from "@/utils/injuries";
import { describeUpNext } from "@/utils/up-next";
import { subscribeLiveUpdateNotificationActions } from "@/utils/live-update-notification-actions";
import { matchesExpectedCompletedSets, type LiveUpdateNotificationAction } from "@/utils/workout-action";
import { buildWorkoutNotificationPresentation } from "@/utils/workout-notification-model";
import { setScreenOwnsWorkoutActions } from "@/utils/wear-action-task";
import {
  applyWearAction,
  buildWearActiveState,
  buildWearIdleState,
  flattenSets,
  nextSetIndex,
  WearAction,
} from "@/utils/wear-state";
import { pushWearState, subscribeWearActions } from "@/utils/wear-sync";
import {
  buildPerformedExercise,
  collapseSetsToDraft,
  recentExercisesForDay,
  toDateObj,
} from "@/utils/workout-conversion";
import {
  dismissWorkoutNotification,
  ensureWorkoutChannel,
  requestNotificationPermission,
  showWorkoutNotification,
} from "@/utils/workout-notification";
import {
  generateSplitWorkoutNames,
  suggestedExercisesToDraftRows,
  suggestWorkoutCompletion,
} from "@/utils/workout-suggestions";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import ReorderableList, {
  ReorderableListRenderItemInfo,
} from "react-native-reorderable-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

// Self-contained so its 1Hz tick re-renders only this text, not the whole
// ActiveWorkout tree — a parent re-render mid-drag jars the reorderable list.
function WorkoutTimer({ startedAt }: { startedAt: Date | null }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const update = () =>
      setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000));
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [startedAt]);
  return <Text style={styles.headerTimer}>{formatElapsed(elapsed)}</Text>;
}

export default function ActiveWorkoutScreen() {
  const { user } = useAuth();
  const { id, suggestion } = useLocalSearchParams<{
    id: string;
    suggestion: string;
  }>();
  const insets = useSafeAreaInsets();
  const { options: catalogOptions } = useExerciseCatalog();
  const aiAvailable = useAIGenerationAvailable();

  const [workoutId, setWorkoutId] = useState<string | null>(null);
  const [cameFromPlan, setCameFromPlan] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const exercisesRef = useRef<DraftExerciseRow[]>([]);
  // Focus (single-set-at-a-time) is the default view for a workout that already has
  // exercises; a blank/new workout opens straight into the editor. Local state — no
  // new route — so hydration, autosave and watch/notification ownership stay owned
  // by this one screen.
  const [mode, setMode] = useState<"focus" | "editor">("editor");
  const [hasEnteredFocus, setHasEnteredFocus] = useState(false);

  const [workoutName, setWorkoutName] = useState("");
  const [isCustomWorkoutName, setIsCustomWorkoutName] = useState(false);
  const [customWorkoutName, setCustomWorkoutName] = useState("");
  const [workoutNameOptions, setWorkoutNameOptions] = useState<string[]>([]);
  const [workoutHistory, setWorkoutHistory] = useState<Workout[]>([]);
  const [splitType, setSplitType] = useState("");
  const effectiveWorkoutName = isCustomWorkoutName
    ? customWorkoutName.trim()
    : workoutName.trim();
  const {
    exercises,
    setExercises,
    blankRow,
    addExercise,
    selectExercise,
    toggleBodyweight,
    removeExercise,
    updateExerciseField,
    updateSet,
    incrementSet,
    decrementSet,
    addSet,
    removeSet,
    toggleSetComplete,
    reorder,
  } = useDraftExercises({
    trackCompletion: true,
    workoutHistory,
    workoutName: effectiveWorkoutName,
  });
  exercisesRef.current = exercises;
  const [saving, setSaving] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showLogConfirm, setShowLogConfirm] = useState(false);
  const [showPlateCalc, setShowPlateCalc] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiUsesLeft, setAiUsesLeft] = useState(TEMPORARY_AI_DAILY_LIMIT);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error";
  }>({
    visible: false,
    message: "",
    type: "success",
  });

  const hydrated = useRef(false);

  useEffect(() => {
    if (!user || hydrated.current) return;
    hydrated.current = true;

    (async () => {
      try {
        if (id) {
          const stored = await workoutRepository.getById(user.uid, id);
          if (!stored) {
            showAlert("Error", "Could not load workout.");
            router.back();
            return;
          }
          const data = stored.data;
          setWorkoutName(data.name || "");
          const hasExercises =
            !!data.performedExercises && data.performedExercises.length > 0;
          setExercises(
            hasExercises
              ? data.performedExercises.map(collapseSetsToDraft)
              : [blankRow()],
          );
          if (hasExercises) {
            setMode("focus");
            setHasEnteredFocus(true);
          }
          // queueOrder is only ever set on docs that passed through the planned
          // queue — it's left in place through the in_progress transition, so
          // its presence tells us how "discard" should behave even on resume.
          setCameFromPlan(data.queueOrder !== undefined);
          if (data.status === "planned") {
            await workoutRepository.update(user.uid, id, { ...data, status: "in_progress", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
            setStartedAt(new Date());
          } else {
            setStartedAt(
              (data.startedAt ? toDateObj(data.startedAt) : null) ?? new Date(),
            );
          }
          setWorkoutId(id);
        } else {
          const name = suggestion || "";
          const newId = await workoutRepository.create(user.uid, {
            name,
            performedExercises: [],
            status: "in_progress",
            startedAt: new Date().toISOString(),
            schemaVersion: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          setWorkoutId(newId);
          setWorkoutName(name);
          setCameFromPlan(false);
          setStartedAt(new Date());
        }
      } catch (err: any) {
        showAlert("Error", "Could not start workout. " + err.message);
        router.back();
      } finally {
        setInitializing(false);
      }
    })();
  }, [user, id, suggestion, blankRow, setExercises]);

  // Build the workout-name dropdown: the user's split day names first, then any
  // other names they've actually used. Mirrors the same list the add/plan modal shows.
  useEffect(() => {
    if (!user) return;

    (async () => {
      try {
        const profile = await profileRepository.get(user.uid);
        const data = profile?.data;
        const todayUTC = new Date().toISOString().slice(0, 10);
        const aiUsage = data?.aiUsage as
          | { date: string; count: number }
          | undefined;
        setAiUsesLeft(
          aiUsage && aiUsage.date === todayUTC
            ? TEMPORARY_AI_DAILY_LIMIT - (aiUsage.count ?? 0)
            : TEMPORARY_AI_DAILY_LIMIT,
        );
        const splitType = data?.workoutSplit?.type;
        setSplitType(splitType ?? "");
        const customSplitDesc: string = data?.workoutSplit?.custom ?? "";
        let splitNames: string[] = isSplitOption(splitType)
          ? SPLIT_WORKOUT_NAMES[splitType]
          : [];

        if (splitType === "Other" && customSplitDesc) {
          const cacheKey = `pumppal_split_names_v2_${customSplitDesc.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 60)}`;
          const cached = await AsyncStorage.getItem(cacheKey);
          if (cached) {
            try {
              splitNames = JSON.parse(cached);
            } catch {
              /* ignore */
            }
          } else {
            try {
              const generated =
                await generateSplitWorkoutNames(customSplitDesc);
              if (generated.length > 0) {
                splitNames = generated;
                await AsyncStorage.setItem(cacheKey, JSON.stringify(generated));
              }
            } catch {
              /* silently fall through to used names */
            }
          }
        }

        const merged = [...splitNames];
        const historyData = (await workoutRepository.getHistory(user.uid)).map((record) => record.data);
        historyData.forEach((workout) => {
          if (workout.name && !merged.includes(workout.name)) merged.push(workout.name);
        });
        setWorkoutNameOptions(merged);
        setWorkoutHistory(historyData);
      } catch {
        // silently fail — user can still type a name
      }
    })();
  }, [user]);

  // Prepare the Android notification channel + permission once a workout is live.
  useEffect(() => {
    if (!startedAt) return;
    (async () => {
      try {
        await ensureWorkoutChannel();
        await requestNotificationPermission();
      } catch (e) {
        // Usually a JS bundle running on an older native binary (an `eas update`
        // onto a build without Notifee / the Live Update module). Silent in
        // release otherwise, and the notification then never appears at all.
        console.warn("[workout-notification] setup failed", e);
      }
    })();
  }, [startedAt]);

  // Exercises performed for this same split-day (workout name) in the last 30 days
  // float to the top of the picker, mirroring the plan/log editor's behavior.
  const recentExercises = useMemo(
    () => recentExercisesForDay(workoutHistory, effectiveWorkoutName),
    [workoutHistory, effectiveWorkoutName],
  );

  // A resumed workout may carry a one-off name that predates the split list —
  // surface it so the dropdown can show it as the current selection.
  const nameOptions = useMemo(() => {
    const merged = [...workoutNameOptions];
    if (workoutName && !isCustomWorkoutName && !merged.includes(workoutName))
      merged.unshift(workoutName);
    return [...merged, "Other"];
  }, [workoutNameOptions, workoutName, isCustomWorkoutName]);

  const selectWorkoutName = (selected: string) => {
    if (selected === "Other") {
      setIsCustomWorkoutName(true);
      setWorkoutName("Other");
      return;
    }
    setIsCustomWorkoutName(false);
    setWorkoutName(selected);
    setCustomWorkoutName("");
  };

  const handleAISuggest = async () => {
    if (!user || aiUsesLeft <= 0 || !aiAvailable) return;
    setAiLoading(true);
    try {
      // The quota is counted and enforced by /api/ai; the client just reflects it.
      const { suggestions: suggested, remaining } = await suggestWorkoutCompletion(
        effectiveWorkoutName,
        splitType,
        exercises,
        workoutHistory,
        await getOngoingInjuries(user.uid),
      );
      if (remaining != null) setAiUsesLeft(remaining);

      if (suggested.length === 0) {
        setToast({
          visible: true,
          message: "Your workout already looks balanced!",
          type: "success",
        });
        return;
      }

      setExercises((prev) => [
        ...prev,
        ...suggestedExercisesToDraftRows(suggested, catalogOptions),
      ]);
    } catch (e) {
      const details = formatAIError(e);
      console.error("AI workout suggestion failed:", details, e);
      showAlert(
        "Error",
        __DEV__
          ? `AI request failed: ${details}`
          : "Could not get AI suggestions. Please try again.",
      );
    } finally {
      setAiLoading(false);
    }
  };

  // Debounced autosave — keeps the doc resumable if the app is closed mid-workout
  useEffect(() => {
    if (!workoutId || initializing) return;
    const t = setTimeout(() => {
      const performedExercises: PerformedExercise[] = exercises
        .filter((ex) => ex.label.trim() !== "")
        .map((ex, order) => buildPerformedExercise(ex, order));
      if (!user) return;
      workoutRepository.getById(user.uid, workoutId).then((stored) => {
        if (!stored) return;
        return workoutRepository.update(user.uid, workoutId, { ...stored.data, name: effectiveWorkoutName, performedExercises, updatedAt: new Date().toISOString() });
      }).catch(() => {
        /* best-effort autosave */
      });

      // Mirror the same snapshot to the watch. Debounced with the save on purpose:
      // the watch shows what the doc holds, so they can never disagree.
      pushWearState(
        buildWearActiveState(workoutId, effectiveWorkoutName, exercises),
      );
    }, 800);
    return () => clearTimeout(t);
  }, [exercises, effectiveWorkoutName, workoutId, initializing, startedAt]);

  // The notification is a live control surface, not a save artifact, so it redraws on
  // its own short timer rather than riding the autosave above — a set tapped here or on
  // the notification itself lands visibly at once, and the action PendingIntents (which
  // carry expectedCompletedSets) re-arm immediately so a fast second tap isn't rejected.
  // The 100ms only coalesces keystroke bursts: weight/duration feed the detail line.
  useEffect(() => {
    if (!workoutId || !startedAt || initializing) return;
    const t = setTimeout(() => {
      showWorkoutNotification(
        buildWorkoutNotificationPresentation({
          workoutId,
          workoutName: effectiveWorkoutName,
          startedAt,
          rows: exercises,
        }),
      ).catch((e) => console.warn("[workout-notification] show failed", e));
    }, 100);
    return () => clearTimeout(t);
  }, [exercises, effectiveWorkoutName, workoutId, initializing, startedAt]);

  const incompleteSetCount = () =>
    exercises
      .filter((ex) => ex.label.trim() !== "")
      .reduce((sum, ex) => sum + ex.sets.filter((s) => !s.completed).length, 0);

  const finishWorkout = async () => {
    if (!workoutId) return;
    setSaving(true);
    try {
      const performedExercises: PerformedExercise[] = exercises
        .filter((ex) => ex.label.trim() !== "")
        .map((ex, order) =>
          buildPerformedExercise(
            { ...ex, sets: ex.sets.filter((s) => s.completed) },
            order,
          ),
        )
        .filter((pe) => pe.sets.length > 0)
        .map((pe) => ({
          ...pe,
          sets: pe.sets.map(({ completed, ...rest }) => rest),
        }));

      const injuries = user ? await getOngoingInjuryIds(user.uid) : [];
      if (!user) throw new Error('You must be signed in to finish a workout.');
      const stored = await workoutRepository.getById(user.uid, workoutId);
      if (!stored) throw new Error('Workout no longer exists.');
      await workoutRepository.update(user.uid, workoutId, {
        ...stored.data,
        name: effectiveWorkoutName || "Workout",
        date: new Date().toISOString(),
        performedExercises,
        status: "completed",
        injuries,
        updatedAt: new Date().toISOString(),
      });
      // The session is done — push it now rather than leaving it on the device
      // until the next foreground. The autosave above deliberately does not.
      triggerSyncAfterWrite();
      await dismissWorkoutNotification();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Clear the watch immediately; the Home screen pushes the real Up Next copy a
      // moment later when it regains focus.
      pushWearState(buildWearIdleState(describeUpNext({})));
      router.replace("/(tabs)");
    } catch (err: any) {
      showAlert("Error", "Could not finish workout. " + err.message);
    } finally {
      setSaving(false);
      setShowFinishConfirm(false);
    }
  };

  const handleFinishPress = () => {
    if (incompleteSetCount() > 0) {
      setShowFinishConfirm(true);
    } else {
      finishWorkout();
    }
  };

  // focus is the default reading view once a workout has exercises; an emptied-out
  // workout (every row removed in the editor) falls back to the editor automatically
  // rather than showing an empty focus screen.
  const focusUsable = mode === "focus" && exercises.some((ex) => ex.label.trim() !== "");

  const enterFocus = () => {
    setHasEnteredFocus(true);
    setMode("focus");
  };

  // Android hardware back while in the editor-reached-from-focus should return to
  // focus rather than pop the route — Discard is still reachable from focus's header.
  useEffect(() => {
    if (mode !== "editor" || !hasEnteredFocus) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setMode("focus");
      return true;
    });
    return () => sub.remove();
  }, [mode, hasEnteredFocus]);

  // Same cursor derivation the watch/notification use, reused here to prefill the
  // plate calculator for the current set rather than inventing a second cursor.
  const currentFlat = useMemo(() => flattenSets(exercises), [exercises]);
  const currentFlatIdx = useMemo(
    () => nextSetIndex(currentFlat.map((f) => f.set)),
    [currentFlat],
  );
  const currentFlatSet = currentFlatIdx !== -1 ? currentFlat[currentFlatIdx] : null;
  const currentFlatRow = currentFlatSet ? exercises[currentFlatSet.rowIndex] : null;
  const plateWeightPrefillable =
    mode === "focus" &&
    !!currentFlatRow &&
    currentFlatRow.exerciseType !== "Sets of Duration" &&
    !currentFlatRow.bodyweight &&
    currentFlatSet!.set.weight.trim() !== "";

  const handleCompleteSet = () => {
    if (!workoutId) return;
    setExercises((prev) => applyWearAction(prev, { action: "completeSet", workoutId }));
  };

  const handleUndoSet = () => {
    if (!workoutId) return;
    setExercises((prev) => applyWearAction(prev, { action: "uncompleteSet", workoutId }));
  };

  // Watch actions land here whenever the app process is alive (otherwise the headless
  // task in utils/wear-action-task.ts handles them). Routing them through the same
  // draft state as a tap gets the autosave, notification and watch push for free, and
  // the resulting state push doubles as the watch's ack.
  const finishRef = useRef(finishWorkout);
  finishRef.current = finishWorkout;

  useEffect(() => {
    if (!workoutId) return;
    // Claim the actions so the root layout's fallback handler stands down; otherwise
    // both would apply the same set and it would land twice.
    setScreenOwnsWorkoutActions(true);
    const applyRemoteAction = (action: WearAction | LiveUpdateNotificationAction) => {
      // A stale watch acting on a workout that already ended must not touch this one.
      if ("workoutId" in action && action.workoutId !== workoutId) return;
      if (action.action === "startWorkout") return;
      if (
        "expectedCompletedSets" in action &&
        !matchesExpectedCompletedSets(exercisesRef.current, action)
      ) return;
      if (action.action === "finishWorkout") {
        finishRef.current();
        return;
      }
      setExercises((prev) => {
        if ("expectedCompletedSets" in action && !matchesExpectedCompletedSets(prev, action)) return prev;
        return applyWearAction(prev, action);
      });
    };
    const unsubscribeWear = subscribeWearActions(applyRemoteAction);
    const unsubscribeNotification = subscribeLiveUpdateNotificationActions(applyRemoteAction);
    return () => {
      setScreenOwnsWorkoutActions(false);
      unsubscribeWear();
      unsubscribeNotification();
    };
  }, [workoutId, setExercises]);

  const discardWorkout = async () => {
    if (!workoutId) return;
    setSaving(true);
    try {
      if (cameFromPlan) {
        const performedExercises: PerformedExercise[] = exercises
          .filter((ex) => ex.label.trim() !== "")
          .map((ex, order) => buildPerformedExercise(ex, order))
          .map((pe) => ({
            ...pe,
            sets: pe.sets.map(({ completed, ...rest }) => rest),
          }));
        if (!user) throw new Error('You must be signed in to discard a workout.');
        const stored = await workoutRepository.getById(user.uid, workoutId);
        if (!stored) throw new Error('Workout no longer exists.');
        const restored = { ...stored.data, status: 'planned' as const, performedExercises, updatedAt: new Date().toISOString() };
        delete restored.startedAt;
        await workoutRepository.update(user.uid, workoutId, {
          ...restored,
          status: "planned",
          performedExercises,
        });
      } else {
        if (!user) throw new Error('You must be signed in to discard a workout.');
        await workoutRepository.softDelete(user.uid, workoutId);
      }
      triggerSyncAfterWrite();
      await dismissWorkoutNotification();
      // Clear the watch immediately; the Home screen pushes the real Up Next copy a
      // moment later when it regains focus.
      pushWearState(buildWearIdleState(describeUpNext({})));
      router.replace("/(tabs)");
    } catch (err: any) {
      showAlert("Error", "Could not discard workout. " + err.message);
    } finally {
      setSaving(false);
      setShowDiscardConfirm(false);
    }
  };

  if (initializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#e54242" size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        {mode === "editor" && hasEnteredFocus ? (
          <TouchableOpacity onPress={enterFocus} hitSlop={8}>
            <Text style={styles.discardText}>‹ Focus</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => setShowDiscardConfirm(true)}
            hitSlop={8}
          >
            <Text style={styles.discardText}>Discard</Text>
          </TouchableOpacity>
        )}
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>
            {effectiveWorkoutName || "Active Workout"}
          </Text>
          <WorkoutTimer startedAt={startedAt} />
        </View>
        <TouchableOpacity onPress={handleFinishPress} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#e54242" />
          ) : (
            <Text style={styles.finishText}>Finish</Text>
          )}
        </TouchableOpacity>
      </View>

      {focusUsable ? (
        <FocusView
          exercises={exercises}
          saving={saving}
          onCompleteSet={handleCompleteSet}
          onUndo={handleUndoSet}
          onFinish={handleFinishPress}
          onEdit={() => setMode("editor")}
          onOpenPlateCalc={() => setShowPlateCalc(true)}
          onUpdateSet={updateSet}
          onIncrementSet={incrementSet}
          onDecrementSet={decrementSet}
        />
      ) : (
      <ReorderableList
        data={exercises}
        keyExtractor={(item) => item.uid}
        onReorder={({ from, to }) => reorder(from, to)}
        autoscrollSpeedScale={2}
        autoscrollThreshold={0.2}
        autoscrollDelay={50}
        animationDuration={150}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            {workoutNameOptions.length > 0 ? (
              <>
                <Dropdown
                  options={nameOptions}
                  value={isCustomWorkoutName ? "Other" : workoutName || null}
                  onSelect={selectWorkoutName}
                  placeholder="Select workout name"
                  style={styles.nameDropdown}
                />
                {isCustomWorkoutName && (
                  <TextInput
                    style={styles.nameInput}
                    placeholder="Enter workout name"
                    placeholderTextColor="#555"
                    value={customWorkoutName}
                    onChangeText={setCustomWorkoutName}
                  />
                )}
              </>
            ) : (
              <TextInput
                style={styles.nameInput}
                placeholder="Workout name (e.g. Push Day)"
                placeholderTextColor="#555"
                value={isCustomWorkoutName ? customWorkoutName : workoutName}
                onChangeText={(v) => {
                  setIsCustomWorkoutName(true);
                  setCustomWorkoutName(v);
                }}
              />
            )}
            <TouchableOpacity
              style={styles.logFinishedButton}
              onPress={() => setShowLogConfirm(true)}
            >
              <Ionicons name="create-outline" size={16} color="#888" />
              <Text style={styles.logFinishedText}>
                Log a finished workout instead
              </Text>
            </TouchableOpacity>
          </>
        }
        renderItem={({
          item: ex,
          index: i,
        }: ReorderableListRenderItemInfo<DraftExerciseRow>) => (
          <ExerciseCard
            exercise={ex}
            index={i}
            catalogOptions={catalogOptions}
            recentExercises={recentExercises}
            onCreateNew={
              user ? (name) => createPendingExercise(name, user.uid) : undefined
            }
            onSelectExercise={selectExercise}
            onChangeType={updateExerciseField}
            onToggleBodyweight={toggleBodyweight}
            onRemoveExercise={removeExercise}
            onUpdateSet={updateSet}
            onIncrementSet={incrementSet}
            onDecrementSet={decrementSet}
            onAddSet={addSet}
            onRemoveSet={removeSet}
            onToggleSetComplete={toggleSetComplete}
            showCompletion
            canRemove={exercises.length > 1}
          />
        )}
        ListFooterComponent={
          <>
            <TouchableOpacity style={styles.addExButton} onPress={addExercise}>
              <Ionicons name="add-circle-outline" size={18} color="#e54242" />
              <Text style={styles.addExText}>Add Exercise</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.aiSuggestButton,
                (aiLoading || initializing || aiUsesLeft <= 0 || !aiAvailable) &&
                  styles.aiSuggestButtonDisabled,
              ]}
              onPress={handleAISuggest}
              disabled={aiLoading || initializing || aiUsesLeft <= 0 || !aiAvailable}
              activeOpacity={0.8}
            >
              {aiLoading ? (
                <ActivityIndicator color="#4ea8de" />
              ) : (
                <>
                  <Ionicons
                    name="sparkles"
                    size={16}
                    color={aiUsesLeft <= 0 ? "#444" : "#4ea8de"}
                  />
                  <Text
                    style={[
                      styles.aiSuggestButtonText,
                      aiUsesLeft <= 0 && styles.aiSuggestButtonTextDisabled,
                    ]}
                  >
                    {!aiAvailable
                      ? "AI needs a connection"
                      : aiUsesLeft > 0
                      ? `Balance Workout with AI (${aiUsesLeft} left)`
                      : "No AI uses left today"}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.bigFinishButton,
                saving && styles.bigFinishButtonDisabled,
              ]}
              onPress={handleFinishPress}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.bigFinishButtonText}>Finish Workout</Text>
              )}
            </TouchableOpacity>
          </>
        }
      />
      )}

      {!focusUsable && !showFinishConfirm && !showLogConfirm && !showDiscardConfirm && (
        <TouchableOpacity
          style={[styles.plateCalcFab, { bottom: Math.max(insets.bottom, 20) }]}
          onPress={() => setShowPlateCalc(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="calculator-outline" size={24} color="#e54242" />
        </TouchableOpacity>
      )}

      <PlateCalculator
        visible={showPlateCalc}
        onClose={() => setShowPlateCalc(false)}
        initialTarget={plateWeightPrefillable ? currentFlatSet!.set.weight : undefined}
        onApplyWeight={
          plateWeightPrefillable
            ? (total) =>
                updateSet(currentFlatSet!.rowIndex, currentFlatSet!.setIndex, "weight", String(total))
            : undefined
        }
      />

      {showFinishConfirm && (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Sets incomplete</Text>
            <Text style={styles.confirmMessage}>
              {incompleteSetCount()} set{incompleteSetCount() !== 1 ? "s" : ""}{" "}
              not marked complete. They&apos;ll be dropped from this workout.
              Finish anyway?
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancelButton}
                onPress={() => setShowFinishConfirm(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmConfirmButton}
                onPress={finishWorkout}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmConfirmText}>Finish Anyway</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {showLogConfirm && (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Log a finished workout?</Text>
            <Text style={styles.confirmMessage}>
              This opens the manual log form for a workout you&apos;ve already
              completed. Your current session stays in progress and can be
              resumed.
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancelButton}
                onPress={() => setShowLogConfirm(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmConfirmButton}
                onPress={() => {
                  setShowLogConfirm(false);
                  router.push("/modal");
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmConfirmText}>Log Workout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {showDiscardConfirm && (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>
              {cameFromPlan ? "Stop workout?" : "Discard workout?"}
            </Text>
            <Text style={styles.confirmMessage}>
              {cameFromPlan
                ? "This will move the workout back to your planned queue."
                : "This will delete the workout — it was never saved as a plan."}
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancelButton}
                onPress={() => setShowDiscardConfirm(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmCancelText}>Keep Going</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmConfirmButton}
                onPress={discardWorkout}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmConfirmText}>
                  {cameFromPlan ? "Stop" : "Discard"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f0f",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0f0f0f",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1e1e1e",
  },
  headerCenter: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  headerTimer: {
    fontSize: 12,
    color: "#e54242",
    fontWeight: "600",
    marginTop: 2,
  },
  finishText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#e54242",
  },
  discardText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#888",
  },
  body: {
    padding: 20,
    // extra room so the plate-calculator FAB can't sit on the Finish Workout button
    paddingBottom: 100,
  },
  plateCalcFab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#271515",
    borderWidth: 1,
    borderColor: "#e54242",
    alignItems: "center",
    justifyContent: "center",
  },
  nameDropdown: {
    marginBottom: 16,
  },
  nameInput: {
    backgroundColor: "#1c1c1c",
    borderWidth: 1,
    borderColor: "#2e2e2e",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#fff",
    marginBottom: 16,
  },
  logFinishedButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    marginBottom: 16,
  },
  logFinishedText: {
    color: "#888",
    fontSize: 13,
    fontWeight: "600",
  },
  addExButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    backgroundColor: "#271515",
    borderWidth: 1,
    borderColor: "#e54242",
    borderRadius: 10,
    marginBottom: 16,
    gap: 6,
  },
  addExText: {
    color: "#e54242",
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 0.2,
  },
  aiSuggestButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0d1e2e",
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1a3a56",
  },
  aiSuggestButtonDisabled: {
    backgroundColor: "#141414",
    borderColor: "#2a2a2a",
  },
  aiSuggestButtonText: {
    color: "#4ea8de",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  aiSuggestButtonTextDisabled: {
    color: "#444",
  },
  bigFinishButton: {
    backgroundColor: "#e54242",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  bigFinishButtonDisabled: {
    opacity: 0.5,
  },
  bigFinishButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  confirmOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },
  confirmCard: {
    backgroundColor: "#1c1c1c",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 8,
  },
  confirmMessage: {
    fontSize: 14,
    color: "#aaa",
    lineHeight: 20,
    marginBottom: 24,
  },
  confirmActions: {
    flexDirection: "row",
    gap: 10,
  },
  confirmCancelButton: {
    flex: 1,
    backgroundColor: "#2a2a2a",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  confirmCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  confirmConfirmButton: {
    flex: 1,
    backgroundColor: "#e54242",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  confirmConfirmText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});

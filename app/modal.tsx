import { Dropdown } from "@/components/ui/dropdown";
import { Toast } from "@/components/ui/toast";
import { WorkoutPrefillLoader } from "@/components/ui/workout-prefill-loader";
import { ExerciseCard } from "@/components/workout/exercise-card";
import { profileRepository } from "@/db/profile-repository";
import { workoutRepository } from "@/db/workout-repository";
import { isSplitOption } from "@/constants/split-options";
import { SPLIT_WORKOUT_NAMES } from "@/constants/split-workout-names";
import { useAuth } from "@/context/auth-context";
import { useDraftExercises } from "@/hooks/use-draft-exercises";
import { useExerciseCatalog } from "@/hooks/use-exercise-catalog";
import { TEMPORARY_AI_DAILY_LIMIT } from "@/shared/ai-contract";
import {
  DraftExerciseRow,
  PerformedExercise,
  Workout,
  WorkoutStatus,
} from "@/types/workout";
import { formatAIError } from "@/utils/ai-client";
import { useAIGenerationAvailable } from "@/utils/use-ai-connectivity";
import { showAlert } from "@/utils/alert";
import { createPendingExercise } from "@/utils/create-pending-exercise";
import { getOngoingInjuries, getOngoingInjuryIds } from "@/utils/injuries";
import { predictNextWorkoutName } from "@/utils/predict-next-workout";
import {
  buildPerformedExercise,
  collapseSetsToDraft,
  recentExercisesForDay,
  toDateObj,
} from "@/utils/workout-conversion";
import {
  generateSplitWorkoutNames,
  suggestedExercisesToDraftRows,
  suggestWorkoutCompletion,
} from "@/utils/workout-suggestions";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
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

export default function AddWorkoutModal() {
  const { user } = useAuth();
  const { id, suggestion, mode } = useLocalSearchParams<{
    id: string;
    suggestion: string;
    mode: string;
  }>();
  const insets = useSafeAreaInsets();
  const [workoutName, setWorkoutName] = useState("");
  const [isCustomWorkoutName, setIsCustomWorkoutName] = useState(false);
  const [customWorkoutName, setCustomWorkoutName] = useState("");
  const [workoutNameOptions, setWorkoutNameOptions] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [workoutHistory, setWorkoutHistory] = useState<Workout[]>([]);
  const effectiveWorkoutName = isCustomWorkoutName
    ? customWorkoutName.trim()
    : workoutName;

  const {
    exercises,
    setExercises,
    blankRow,
    addExercise,
    toggleBodyweight,
    removeExercise,
    updateExerciseField,
    updateSet,
    incrementSet,
    decrementSet,
    addSet,
    removeSet,
    reorder,
    selectExercise,
  } = useDraftExercises({ workoutHistory, workoutName: effectiveWorkoutName });
  const { options: catalogOptions } = useExerciseCatalog();
  const aiAvailable = useAIGenerationAvailable();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [prefillLoading, setPrefillLoading] = useState(mode === "plan" && !id);
  const [prefillWorkoutName, setPrefillWorkoutName] = useState<string | null>(
    suggestion ?? null,
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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
  const [splitType, setSplitType] = useState<string>("");
  const [isToday, setIsToday] = useState(true);
  const [workoutDate, setWorkoutDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [docStatus, setDocStatus] = useState<WorkoutStatus | undefined>(
    undefined,
  );
  const typePrefillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPlanMode = mode === "plan" || docStatus === "planned";
  const isFormLoading = loading || prefillLoading;

  useEffect(
    () => () => {
      if (typePrefillTimer.current) clearTimeout(typePrefillTimer.current);
    },
    [],
  );

  // Fetch user's split + names used in past workouts to build the name dropdown.
  useEffect(() => {
    if (!user) return;
    const shouldShowPrefillLoader = mode === "plan" && !id;
    let cancelled = false;
    if (shouldShowPrefillLoader) {
      setPrefillLoading(true);
      setPrefillWorkoutName(suggestion ?? null);
    }
    const minimumPrefillTime = shouldShowPrefillLoader
      ? new Promise<void>((resolve) => setTimeout(resolve, 500))
      : Promise.resolve();

    const loadNameOptions = async () => {
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
        const customSplitDesc: string = data?.workoutSplit?.custom ?? "";
        let splitNames: string[] = isSplitOption(splitType)
          ? SPLIT_WORKOUT_NAMES[splitType]
          : [];

        // For "Other" splits, ask the configured AI model to generate day names (cached per description)
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

        // Collect unique names actually used in saved workouts
        const usedNames = new Set<string>();
        const historyData = (await workoutRepository.getHistory(user.uid)).map((record) => record.data);
        historyData.forEach((workout) => {
          if (workout.name) usedNames.add(workout.name);
        });
        setWorkoutHistory(historyData);
        setSplitType(splitType ?? "");

        // Merge: split names first, then any used names not already in the split list
        const merged = [...splitNames];
        usedNames.forEach((n) => {
          if (!merged.includes(n)) merged.push(n);
        });
        setWorkoutNameOptions(merged);

        // Auto-select workout name for new workouts only
        if (!id) {
          let initialWorkoutName: string | null = null;
          if (suggestion && merged.includes(suggestion)) {
            // Use the suggestion passed from the home screen (pattern-based prediction)
            initialWorkoutName = suggestion;
          } else if (suggestion) {
            // Suggestion isn't in the merged list yet — still honour it
            initialWorkoutName = suggestion;
          } else {
            // Fallback if opened without a suggestion — same prediction logic as "Up Next"
            initialWorkoutName = predictNextWorkoutName(
              splitNames,
              historyData,
            );
          }

          if (initialWorkoutName) {
            setPrefillWorkoutName(initialWorkoutName);
            setWorkoutName(initialWorkoutName);

            if (mode === "plan") {
              const lastMatchingWorkout = historyData.find(
                (workout) =>
                  (!workout.status || workout.status === "completed") &&
                  workout.name === initialWorkoutName,
              );
              const lastExercises =
                lastMatchingWorkout?.performedExercises ?? [];
              if (lastExercises.length > 0) {
                setExercises(lastExercises.map(collapseSetsToDraft));
              }
            }
          }
        }
      } catch {
        // silently fail — user can still type a name
      }
    };
    Promise.all([loadNameOptions(), minimumPrefillTime]).then(() => {
      if (!cancelled && shouldShowPrefillLoader) setPrefillLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [id, mode, suggestion, user, setExercises]);

  useEffect(() => {
    if (!id || !user) return;

    const fetchWorkout = async () => {
      try {
        const stored = await workoutRepository.getById(user.uid, id);
        if (stored) {
          const data = stored.data;
          setWorkoutName(data.name || "");
          setNotes(data.notes || "");
          setDocStatus(data.status);
          if (data.date) {
            const date = toDateObj(data.date);
            if (date) {
              setWorkoutDate(date);
              const today = new Date();
              if (
                date.getDate() !== today.getDate() ||
                date.getMonth() !== today.getMonth() ||
                date.getFullYear() !== today.getFullYear()
              ) {
                setIsToday(false);
              }
            }
          }
          if (data.performedExercises && data.performedExercises.length > 0) {
            setExercises(data.performedExercises.map(collapseSetsToDraft));
          }
        }
      } catch (err) {
        showAlert("Error", "Could not load workout details.");
      } finally {
        setLoading(false);
      }
    };

    fetchWorkout();
  }, [id, user, setExercises]);

  // Exercises performed for this same split-day (workout name) in the last 30 days
  // float to the top of the picker, and seed a dedicated "recent" stage in the sheet.
  const recentExercises = useMemo(
    () => recentExercisesForDay(workoutHistory, effectiveWorkoutName),
    [workoutHistory, effectiveWorkoutName],
  );

  const prefillForWorkoutName = (selectedWorkoutName: string) => {
    if (typePrefillTimer.current) clearTimeout(typePrefillTimer.current);
    setPrefillWorkoutName(selectedWorkoutName);
    setPrefillLoading(true);

    typePrefillTimer.current = setTimeout(() => {
      const lastMatchingWorkout = workoutHistory.find(
        (workout) =>
          (!workout.status || workout.status === "completed") &&
          workout.name === selectedWorkoutName,
      );
      const lastExercises = lastMatchingWorkout?.performedExercises ?? [];
      setExercises(
        lastExercises.length > 0
          ? lastExercises.map(collapseSetsToDraft)
          : [blankRow()],
      );
      setPrefillLoading(false);
      typePrefillTimer.current = null;
    }, 500);
  };

  const selectWorkoutName = (selectedWorkoutName: string) => {
    if (selectedWorkoutName === "Other") {
      setIsCustomWorkoutName(true);
      setWorkoutName("Other");
      return;
    }

    if (!isCustomWorkoutName && selectedWorkoutName === workoutName) return;
    setIsCustomWorkoutName(false);
    setWorkoutName(selectedWorkoutName);
    setCustomWorkoutName("");
    if (isPlanMode) prefillForWorkoutName(selectedWorkoutName);
  };

  const handleAISuggest = async () => {
    if (!user || aiUsesLeft <= 0 || !aiAvailable) return;
    const finalName = isCustomWorkoutName
      ? customWorkoutName.trim()
      : workoutName.trim();
    setAiLoading(true);
    try {
      // The quota is counted and enforced by /api/ai; the client just reflects it.
      const { suggestions: suggested, remaining } = await suggestWorkoutCompletion(
        finalName,
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

      const newRows: DraftExerciseRow[] = suggestedExercisesToDraftRows(
        suggested,
        catalogOptions,
      );
      setExercises((prev) => [...prev, ...newRows]);
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

  const handleDelete = async () => {
    if (!id || !user) return;
    try {
      await workoutRepository.softDelete(user.uid, id);
      router.back();
    } catch (err: any) {
      showAlert("Error", "Could not delete workout. " + err.message);
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  const handleSave = async () => {
    const finalName = isCustomWorkoutName
      ? customWorkoutName.trim()
      : workoutName.trim();
    if (!finalName) {
      showAlert("Error", "Please select or enter a workout name.");
      return;
    }
    if (!user) return;

    setSaving(true);
    try {
      const performedExercises: PerformedExercise[] = exercises
        .filter((ex) => ex.label.trim() !== "")
        .map((ex, order) => buildPerformedExercise(ex, order));

      if (isPlanMode) {
        if (id) {
          const existing = await workoutRepository.getById(user.uid, id);
          if (!existing) throw new Error('Workout no longer exists.');
          await workoutRepository.update(user.uid, id, {
            ...existing.data,
            name: finalName,
            performedExercises,
            notes: notes.trim(),
            status: "planned",
            updatedAt: new Date().toISOString(),
          });
        } else {
          const lastQueued = await workoutRepository.getByStatus(user.uid, 'planned');
          const nextQueueOrder =
            Math.max(-1, ...lastQueued.map((record) => record.data.queueOrder ?? -1)) + 1;
          await workoutRepository.create(user.uid, {
            name: finalName,
            performedExercises,
            notes: notes.trim(),
            schemaVersion: 2,
            status: "planned",
            queueOrder: nextQueueOrder,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      } else {
        const finalDate = isToday ? new Date() : workoutDate;
        const injuries = await getOngoingInjuryIds(user.uid);

        if (id) {
          const existing = await workoutRepository.getById(user.uid, id);
          if (!existing) throw new Error('Workout no longer exists.');
          await workoutRepository.update(user.uid, id, {
            ...existing.data,
            name: finalName,
            date: finalDate.toISOString(),
            performedExercises,
            notes: notes.trim(),
            status: "completed",
            injuries,
            updatedAt: new Date().toISOString(),
          });
        } else {
          await workoutRepository.create(user.uid, {
            name: finalName,
            date: finalDate.toISOString(),
            performedExercises,
            notes: notes.trim(),
            schemaVersion: 2,
            status: "completed",
            injuries,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
      router.back();
    } catch (err: any) {
      showAlert("Error", "Could not save workout. " + err.message);
    } finally {
      setSaving(false);
    }
  };

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
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isPlanMode
            ? id
              ? "Edit Plan"
              : "Plan Workout"
            : id
              ? "Edit Workout"
              : "Log Workout"}
        </Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || isFormLoading}
        >
          {saving ? (
            <ActivityIndicator color="#e54242" />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      {prefillLoading ? (
        <WorkoutPrefillLoader workoutName={prefillWorkoutName} />
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#e54242" size="large" />
        </View>
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
                    options={[...workoutNameOptions, "Other"]}
                    value={isCustomWorkoutName ? "Other" : workoutName || null}
                    onSelect={selectWorkoutName}
                    placeholder="Select workout name"
                    style={styles.nameDropdown}
                  />
                  {isCustomWorkoutName && (
                    <TextInput
                      style={styles.input}
                      placeholder="Enter workout name"
                      placeholderTextColor="#555"
                      value={customWorkoutName}
                      onChangeText={setCustomWorkoutName}
                    />
                  )}
                </>
              ) : (
                <TextInput
                  style={styles.input}
                  placeholder="Workout name (e.g. Push Day)"
                  placeholderTextColor="#555"
                  value={isCustomWorkoutName ? customWorkoutName : workoutName}
                  onChangeText={(v) => {
                    setIsCustomWorkoutName(true);
                    setCustomWorkoutName(v);
                  }}
                />
              )}

              <View style={isPlanMode ? undefined : styles.dateSection}>
                {!isPlanMode && (
                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => setIsToday(!isToday)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        isToday && styles.checkboxChecked,
                      ]}
                    >
                      {isToday && (
                        <Ionicons name="checkmark" size={16} color="#fff" />
                      )}
                    </View>
                    <Text style={styles.checkboxLabel}>
                      Today&apos;s Workout
                    </Text>
                  </TouchableOpacity>
                )}

                {!isPlanMode && !isToday && (
                  <View style={styles.datePickerContainer}>
                    <Text style={styles.dateLabel}>Workout Date:</Text>
                    {Platform.OS === "web" ? (
                      React.createElement("input", {
                        type: "date",
                        value: workoutDate.toISOString().split("T")[0],
                        onChange: (e: any) => {
                          if (e.target.value)
                            setWorkoutDate(
                              new Date(e.target.value + "T12:00:00"),
                            );
                        },
                        style: {
                          background: "#2a2a2a",
                          color: "#fff",
                          border: "1px solid #3a3a3a",
                          borderRadius: 6,
                          padding: "6px 12px",
                          fontSize: "15px",
                          cursor: "pointer",
                          colorScheme: "dark",
                        },
                      })
                    ) : Platform.OS === "ios" ? (
                      <DateTimePicker
                        value={workoutDate}
                        mode="date"
                        display="default"
                        onChange={(event, date) => {
                          if (date) setWorkoutDate(date);
                        }}
                        themeVariant="dark"
                      />
                    ) : (
                      <>
                        <TouchableOpacity
                          style={styles.dateButton}
                          onPress={() => setShowDatePicker(true)}
                        >
                          <Text style={styles.dateButtonText}>
                            {workoutDate.toLocaleDateString()}
                          </Text>
                        </TouchableOpacity>
                        {showDatePicker && (
                          <DateTimePicker
                            value={workoutDate}
                            mode="date"
                            display="default"
                            onChange={(event, date) => {
                              setShowDatePicker(false);
                              if (date) setWorkoutDate(date);
                            }}
                          />
                        )}
                      </>
                    )}
                  </View>
                )}
              </View>
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
                user
                  ? (name) => createPendingExercise(name, user.uid)
                  : undefined
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
              canRemove={exercises.length > 1}
            />
          )}
          ListFooterComponent={
            <>
              <TouchableOpacity
                style={styles.addExButton}
                onPress={addExercise}
              >
                <Ionicons name="add-circle-outline" size={18} color="#e54242" />
                <Text style={styles.addExText}>Add Exercise</Text>
              </TouchableOpacity>

              <TextInput
                style={[styles.input, styles.notesInput]}
                placeholder="Notes (optional)"
                placeholderTextColor="#555"
                multiline
                value={notes}
                onChangeText={setNotes}
              />

              {isPlanMode && (
                <TouchableOpacity
                  style={[
                    styles.aiSuggestButton,
                    (aiLoading || isFormLoading || aiUsesLeft <= 0 || !aiAvailable) &&
                      styles.aiSuggestButtonDisabled,
                  ]}
                  onPress={handleAISuggest}
                  disabled={aiLoading || isFormLoading || aiUsesLeft <= 0 || !aiAvailable}
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
              )}

              {id && (
                <Modal
                  visible={showDeleteConfirm}
                  transparent
                  animationType="fade"
                >
                  <View style={styles.deleteModalOverlay}>
                    <View style={styles.deleteModalCard}>
                      <Text style={styles.deleteModalTitle}>
                        {isPlanMode ? "Delete Plan" : "Delete Workout"}
                      </Text>
                      <Text style={styles.deleteModalMessage}>
                        {isPlanMode
                          ? "Are you sure you want to delete this planned workout? This cannot be undone."
                          : "Are you sure you want to delete this workout? This cannot be undone."}
                      </Text>
                      <View style={styles.deleteModalActions}>
                        <TouchableOpacity
                          style={styles.deleteModalCancelButton}
                          onPress={() => setShowDeleteConfirm(false)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.deleteModalCancelText}>
                            Cancel
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.deleteModalConfirmButton}
                          onPress={handleDelete}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.deleteModalConfirmText}>
                            Delete
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </Modal>
              )}

              <View style={id ? styles.saveRow : undefined}>
                <TouchableOpacity
                  style={[
                    styles.bigSaveButton,
                    (saving || isFormLoading) && styles.bigSaveButtonDisabled,
                  ]}
                  onPress={handleSave}
                  disabled={saving || isFormLoading}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.bigSaveButtonText}>
                      {isPlanMode
                        ? "Save Plan"
                        : id
                          ? "Save Changes"
                          : "Save Workout"}
                    </Text>
                  )}
                </TouchableOpacity>
                {id && (
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => setShowDeleteConfirm(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="trash-outline" size={26} color="#e54242" />
                  </TouchableOpacity>
                )}
              </View>
            </>
          }
        />
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
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
  },
  saveText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#e54242",
  },
  body: {
    padding: 20,
    paddingBottom: 40,
  },
  input: {
    backgroundColor: "#1c1c1c",
    borderWidth: 1,
    borderColor: "#2e2e2e",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#fff",
    marginBottom: 12,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  dateSection: {
    marginBottom: 16,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#555",
    marginRight: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: "#e54242",
    borderColor: "#e54242",
  },
  checkboxLabel: {
    color: "#fff",
    fontSize: 15,
  },
  datePickerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1c1c1c",
    borderWidth: 1,
    borderColor: "#2e2e2e",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 8 : 12,
  },
  dateLabel: {
    color: "#fff",
    fontSize: 15,
  },
  dateButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#2a2a2a",
    borderRadius: 6,
  },
  dateButtonText: {
    color: "#fff",
    fontSize: 15,
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
  bigSaveButton: {
    backgroundColor: "#e54242",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    flex: 1,
  },
  bigSaveButtonDisabled: {
    opacity: 0.5,
  },
  bigSaveButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  saveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  deleteButton: {
    backgroundColor: "#000",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },
  deleteModalCard: {
    backgroundColor: "#1c1c1c",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  deleteModalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 8,
  },
  deleteModalMessage: {
    fontSize: 14,
    color: "#aaa",
    lineHeight: 20,
    marginBottom: 24,
  },
  deleteModalActions: {
    flexDirection: "row",
    gap: 10,
  },
  deleteModalCancelButton: {
    flex: 1,
    backgroundColor: "#2a2a2a",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  deleteModalCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  deleteModalConfirmButton: {
    flex: 1,
    backgroundColor: "#e54242",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  deleteModalConfirmText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
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
  nameDropdown: {
    marginBottom: 12,
  },
});

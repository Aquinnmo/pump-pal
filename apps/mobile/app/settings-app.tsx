import { useAuth } from "@/context/auth-context";
import { bumpDataVersion } from "@/data/data-version";
import { profileRepository } from "@/data/profile-repository";
import { workoutRepository } from "@/data/workout-repository";
import { useAIEnabled } from "@/lib/use-ai-enabled";
import { useSocialEnabled } from "@/lib/use-social-enabled";
import { toDateObj } from "@/lib/workout-conversion";
import { Toast } from "@/ui/primitives/toast";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Updates from "expo-updates";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** One ring's trip from the switch's centre to the edge of its footprint. */
const PULSE_MS = 900;

/**
 * Saving the AI toggle is a local SQLite upsert, not a network call — it
 * usually lands in tens of milliseconds. Without a floor the pulse appears and
 * disappears inside a frame or two, which reads as a flicker rather than as
 * feedback that anything happened.
 */
const MIN_PULSE_MS = 600;

/**
 * One hairline ring, expanding and fading. `phase` offsets it around the shared
 * loop so two rings chase each other from a single driver.
 */
function PulseRing({ progress, phase }: { progress: SharedValue<number>; phase: number }) {
  const style = useAnimatedStyle(() => {
    const t = (progress.value + phase) % 1;
    return { transform: [{ scale: 0.45 + t }], opacity: (1 - t) * 0.9 };
  });
  return <Animated.View style={[styles.pulseRing, style]} />;
}

/**
 * Stands in for the switch while the opt-in is saving: growth rings, the
 * logo's own motif (the same one behind the auth shell). Outlines only — not
 * the glow/orb/blob layer that docs/design-language.md rules out, and
 * deliberately not the sparkle burst that list also names.
 *
 * Sized to the switch's footprint so the row does not reflow on the swap.
 */
function TogglePulse() {
  const progress = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      // Held mid-expansion rather than removed: the row still shows that
      // something is in flight, it just doesn't move. Same fallback shape as
      // src/ui/primitives/workout-prefill-loader.tsx.
      progress.value = 0.35;
      return;
    }
    progress.value = withRepeat(
      withTiming(1, { duration: PULSE_MS, easing: Easing.out(Easing.quad) }),
      -1,
      false
    );
    return () => cancelAnimation(progress);
  }, [progress, reducedMotion]);

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(160)}
      style={styles.pulse}
      accessibilityRole="progressbar"
      accessibilityLabel="Saving"
    >
      <PulseRing progress={progress} phase={0} />
      <PulseRing progress={progress} phase={0.5} />
    </Animated.View>
  );
}

export default function SettingsAppScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const aiEnabled = useAIEnabled();
  const socialEnabled = useSocialEnabled();
  const [savingPreference, setSavingPreference] = useState<"aiEnabled" | "socialEnabled" | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error";
  }>({
    visible: false,
    message: "",
    type: "success",
  });

  const handleTogglePreference = async (field: "aiEnabled" | "socialEnabled", next: boolean) => {
    if (!user || savingPreference) return;
    const startedAt = Date.now();
    setSavingPreference(field);
    try {
      // The whole row is replaced by an upsert (see singleton-repository.ts), so
      // the rest of the profile has to be carried across or it is dropped.
      const existing = (await profileRepository.get(user.uid))?.data ?? {};
      await profileRepository.upsert(user.uid, {
        ...existing,
        [field]: next,
      });
      // Local writes don't bump on their own (see src/data/data-version.ts) —
      // this is what makes every mounted screen show or hide its AI surface now
      // rather than on the next focus.
      bumpDataVersion();
    } catch (err) {
      console.error(err);
      setToast({
        visible: true,
        message: "Could not save that setting",
        type: "error",
      });
    } finally {
      // Hold the pulse to its floor. Runs on the error path too, so a failed
      // write doesn't snap the switch back before the toast has a chance to
      // explain why.
      const remaining = MIN_PULSE_MS - (Date.now() - startedAt);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
      setSavingPreference(null);
    }
  };

  const handleCheckForUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      } else {
        setToast({
          visible: true,
          message: "App is up to date",
          type: "success",
        });
      }
    } catch (err) {
      console.error(err);
      setToast({
        visible: true,
        message: "Could not check for updates",
        type: "error",
      });
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleExportData = async () => {
    if (!user) return;
    setExporting(true);
    try {
      const [fileSystemModule, sharingModule] = await Promise.all([
        import("expo-file-system"),
        import("expo-sharing"),
      ]);

      const workouts = (await workoutRepository.getHistory(user.uid)).map(
        (record) => record.data,
      );

      const rows: string[] = [
        [
          "Date",
          "Workout",
          "Notes",
          "Exercise",
          "Variation",
          "Set",
          "Reps",
          "Weight (lbs)",
          "Duration (sec)",
          "Hold (sec)",
          "Bodyweight",
        ].join(","),
      ];

      workouts.forEach((w) => {
        const dateMs = toDateObj(w.date)?.getTime();
        if (dateMs === undefined) return;
        const dateStr = new Date(dateMs).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
        const name = `"${(w.name ?? "").replace(/"/g, '""')}"`;
        const notes = `"${(w.notes ?? "").replace(/"/g, '""')}"`;

        const performedExercises = w.performedExercises ?? [];
        if (performedExercises.length > 0) {
          performedExercises.forEach((pe) => {
            const exName = `"${(pe.exerciseNameSnapshot ?? "").replace(/"/g, '""')}"`;
            const variation = `"${(pe.variationNameSnapshot ?? "").replace(/"/g, '""')}"`;
            pe.sets.forEach((set) => {
              rows.push(
                [
                  dateStr,
                  name,
                  notes,
                  exName,
                  variation,
                  set.setNumber,
                  set.reps ?? "",
                  set.bodyweight ? "" : (set.weight ?? ""),
                  set.durationSeconds ?? "",
                  set.holdSeconds ?? "",
                  set.bodyweight ? "Yes" : "No",
                ].join(","),
              );
            });
          });
        } else {
          rows.push(
            [dateStr, name, notes, "", "", "", "", "", "", "", ""].join(","),
          );
        }
      });

      const csv = rows.join("\n");
      const fileName = `pump-pal-workouts-${new Date().toISOString().slice(0, 10)}.csv`;

      let fileUri = "";
      if (
        (fileSystemModule as any).File &&
        (fileSystemModule as any).Paths?.cache
      ) {
        const file = new (fileSystemModule as any).File(
          (fileSystemModule as any).Paths.cache,
          fileName,
        );
        if (file.exists) file.delete();
        file.write(csv);
        fileUri = file.uri;
      } else {
        const cacheDirectory = (fileSystemModule as any).cacheDirectory;
        if (
          !cacheDirectory ||
          typeof (fileSystemModule as any).writeAsStringAsync !== "function"
        ) {
          throw new Error(
            "File system export APIs are unavailable in this app build.",
          );
        }

        fileUri = `${cacheDirectory}${fileName}`;
        const encoding = (fileSystemModule as any).EncodingType?.UTF8 ?? "utf8";
        await (fileSystemModule as any).writeAsStringAsync(fileUri, csv, {
          encoding,
        });
      }

      const canShare = await (sharingModule as any).isAvailableAsync();
      if (canShare) {
        await (sharingModule as any).shareAsync(fileUri, {
          mimeType: "text/csv",
          dialogTitle: "Export Training Data",
          UTI: "public.comma-separated-values-text",
        });
      } else {
        setToast({
          visible: true,
          message: "Sharing is not available on this device",
          type: "error",
        });
      }
    } catch (err: any) {
      console.error(err);
      const errText = String(err?.message ?? err ?? "").toLowerCase();
      const missingNativeModule =
        errText.includes("native module") ||
        errText.includes("cannot find native module") ||
        errText.includes("cannot find module") ||
        errText.includes("unavailable in this app build");

      setToast({
        visible: true,
        message: missingNativeModule
          ? "Export is unavailable on this app build. Update the app to use this feature."
          : "Could not export data",
        type: "error",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>App</Text>
        <View style={{ width: 24 }} />
      </View>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />

      <View style={styles.content}>
        <View style={styles.toggleRow}>
          <Ionicons
            name="hardware-chip-outline"
            size={20}
            color="#fff"
            style={styles.rowIcon}
          />
          <View style={styles.toggleLabels}>
            <Text style={styles.updateButtonText}>AI Features</Text>
            {/* The consent sits on the control, not on a screen the user has to
                go find — turning this on is what sends the data. */}
            <Text style={styles.toggleSubtitle}>
              Your data may be sent to 3rd parties.
            </Text>
          </View>
          {savingPreference === "aiEnabled" ? (
            <TogglePulse />
          ) : (
            <Switch
              value={aiEnabled}
              onValueChange={(next) => handleTogglePreference("aiEnabled", next)}
              disabled={!user || savingPreference !== null}
              trackColor={{ false: "#2a2a2a", true: "#e54242" }}
              thumbColor="#fff"
              accessibilityLabel="AI features"
            />
          )}
        </View>

        <View style={styles.toggleRow}>
          <Ionicons name="people-outline" size={20} color="#fff" style={styles.rowIcon} />
          <View style={styles.toggleLabels}>
            <Text style={styles.updateButtonText}>Social Features</Text>
            <Text style={styles.toggleSubtitle}>
              Let people find you and include you in buddy lists.
            </Text>
          </View>
          {savingPreference === "socialEnabled" ? (
            <TogglePulse />
          ) : (
            <Switch
              value={socialEnabled}
              onValueChange={(next) => handleTogglePreference("socialEnabled", next)}
              disabled={!user || savingPreference !== null}
              trackColor={{ false: "#2a2a2a", true: "#e54242" }}
              thumbColor="#fff"
              accessibilityLabel="Social features"
            />
          )}
        </View>

        <TouchableOpacity
          style={styles.feedbackButton}
          onPress={() =>
            Linking.openURL(
              "mailto:adammontcompany@gmail.com?subject=Timber Feedback",
            )
          }
          activeOpacity={0.8}
        >
          <Ionicons
            name="megaphone"
            size={24}
            color="#fff"
            style={styles.rowIcon}
          />
          <Text style={styles.feedbackButtonText}>SEND FEEDBACK</Text>
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.updateButton,
            checkingUpdate && styles.updateButtonDisabled,
          ]}
          onPress={handleCheckForUpdate}
          disabled={checkingUpdate}
          activeOpacity={0.8}
        >
          {checkingUpdate ? (
            <ActivityIndicator
              size="small"
              color="#fff"
              style={styles.rowIcon}
            />
          ) : (
            <Ionicons
              name="cloud-download"
              size={20}
              color="#fff"
              style={styles.rowIcon}
            />
          )}
          <Text style={styles.updateButtonText}>
            {checkingUpdate ? "Checking..." : "Update App"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.updateButton,
            exporting && styles.updateButtonDisabled,
          ]}
          onPress={handleExportData}
          disabled={exporting}
          activeOpacity={0.8}
        >
          {exporting ? (
            <ActivityIndicator
              size="small"
              color="#fff"
              style={styles.rowIcon}
            />
          ) : (
            <Ionicons
              name="download"
              size={20}
              color="#fff"
              style={styles.rowIcon}
            />
          )}
          <Text style={styles.updateButtonText}>
            {exporting ? "Exporting..." : "Export Training Data"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
  },
  content: {
    padding: 20,
  },
  rowIcon: {
    marginRight: 12,
  },
  feedbackButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e54242",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 16,
    shadowColor: "#e54242",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  feedbackButtonText: {
    flex: 1,
    fontSize: 16,
    color: "#fff",
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1c1c1c",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  toggleLabels: {
    flex: 1,
    marginRight: 12,
  },
  // Matches the iOS switch footprint so swapping the two doesn't reflow the row.
  pulse: {
    width: 51,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#e54242",
  },
  toggleSubtitle: {
    fontSize: 12,
    color: "#888",
    marginTop: 4,
  },
  updateButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1c1c1c",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  updateButtonDisabled: {
    opacity: 0.6,
  },
  updateButtonText: {
    fontSize: 15,
    color: "#fff",
    fontWeight: "600",
  },
});

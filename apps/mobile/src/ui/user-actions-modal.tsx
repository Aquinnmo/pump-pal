import { REPORT_NOTE_MAX, type ReportReason } from "@timber/contract/api";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

/**
 * The one place a username's report, block, decline and remove actions live.
 * Timber has no list-row menu or action sheet, so this follows the RN `Modal`
 * pattern from `app/settings-account.tsx`: a question in the title, the
 * consequence in the body, and buttons that say what they do.
 *
 * The parent owns the network calls and throws on failure; this component
 * shows a terse inline error and stays open so the user can retry.
 */

export type UserActionTarget = {
  uid: string;
  username: string;
  /** Where the row came from — decides which relationship action is offered. */
  kind: "request" | "search" | "buddy";
};

type Step = "menu" | "report" | "block" | "remove";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "harassment", label: "Harassment or abuse" },
  { value: "inappropriate_username", label: "Inappropriate username" },
  { value: "spam", label: "Spam or fake account" },
  { value: "other", label: "Something else" },
];

export function UserActionsModal({
  target,
  onClose,
  onDecline,
  onRemove,
  onBlock,
  onReport,
}: {
  target: UserActionTarget | null;
  onClose: () => void;
  onDecline: (uid: string) => Promise<void>;
  onRemove: (uid: string) => Promise<void>;
  onBlock: (uid: string) => Promise<void>;
  onReport: (uid: string, reason: ReportReason, note: string) => Promise<void>;
}) {
  const [step, setStep] = useState<Step>("menu");
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A new target always starts at the menu with a clean slate.
  useEffect(() => {
    setStep("menu");
    setReason(null);
    setNote("");
    setBusy(false);
    setError(null);
  }, [target?.uid]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch {
      setError("Could not do that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!target) return null;
  const { uid, username, kind } = target;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {step === "menu" && (
            <>
              <Text style={styles.title}>{username}</Text>
              {kind === "request" && (
                <MenuRow
                  label="Decline request"
                  busy={busy}
                  onPress={() => run(() => onDecline(uid))}
                />
              )}
              {kind === "buddy" && (
                <MenuRow label="Remove buddy" onPress={() => setStep("remove")} />
              )}
              <MenuRow label="Report" onPress={() => setStep("report")} />
              <MenuRow label="Block" onPress={() => setStep("block")} />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <TouchableOpacity
                style={styles.dismiss}
                onPress={onClose}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={styles.cancelText}>Close</Text>
              </TouchableOpacity>
            </>
          )}

          {step === "report" && (
            <>
              <Text style={styles.title}>Report {username}?</Text>
              <Text style={styles.message}>
                Pick the closest reason. Reports go to the developer, and the
                person you report is not told who reported them.
              </Text>
              {REASONS.map((r) => (
                <TouchableOpacity
                  key={r.value}
                  style={[styles.reason, reason === r.value && styles.reasonSelected]}
                  onPress={() => setReason(r.value)}
                  activeOpacity={0.8}
                  accessibilityRole="radio"
                  accessibilityLabel={r.label}
                  accessibilityState={{ selected: reason === r.value }}
                >
                  <Text style={styles.menuText}>{r.label}</Text>
                </TouchableOpacity>
              ))}
              <TextInput
                style={styles.note}
                value={note}
                onChangeText={setNote}
                maxLength={REPORT_NOTE_MAX}
                multiline
                placeholder="Add detail (optional)"
                placeholderTextColor="#666"
                accessibilityLabel="Report details"
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Actions
                cancelLabel="Don't Report"
                confirmLabel="Send Report"
                busy={busy}
                disabled={!reason}
                onCancel={onClose}
                onConfirm={() => reason && run(() => onReport(uid, reason, note))}
              />
            </>
          )}

          {step === "block" && (
            <>
              <Text style={styles.title}>Block {username}?</Text>
              <Text style={styles.message}>
                They won&apos;t be able to find you, send you requests, or see
                you in their buddy list, and you won&apos;t see them. Any buddy
                connection ends. You can unblock in Settings.
              </Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Actions
                cancelLabel="Don't Block"
                confirmLabel="Block"
                busy={busy}
                onCancel={onClose}
                onConfirm={() => run(() => onBlock(uid))}
              />
            </>
          )}

          {step === "remove" && (
            <>
              <Text style={styles.title}>Remove {username}?</Text>
              <Text style={styles.message}>
                You&apos;ll stop seeing each other&apos;s streaks. Either of you
                can send a new request later.
              </Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Actions
                cancelLabel="Keep Buddy"
                confirmLabel="Remove"
                busy={busy}
                onCancel={onClose}
                onConfirm={() => run(() => onRemove(uid))}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function MenuRow({
  label,
  onPress,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.menuRow}
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {busy ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text style={styles.menuText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

function Actions({
  cancelLabel,
  confirmLabel,
  busy,
  disabled = false,
  onCancel,
  onConfirm,
}: {
  cancelLabel: string;
  confirmLabel: string;
  busy: boolean;
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <View style={styles.actions}>
      <TouchableOpacity
        style={styles.cancelButton}
        onPress={onCancel}
        disabled={busy}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={cancelLabel}
      >
        <Text style={styles.cancelText}>{cancelLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.confirmButton, (disabled || busy) && styles.confirmDisabled]}
        onPress={onConfirm}
        disabled={busy || disabled}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={confirmLabel}
        accessibilityState={{ disabled: busy || disabled }}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.confirmText}>{confirmLabel}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  card: {
    backgroundColor: "#1c1c1c",
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 24,
    width: "100%",
    maxWidth: 420,
    gap: 8,
  },
  title: { fontSize: 18, fontWeight: "700", color: "#fff" },
  message: { fontSize: 15, fontWeight: "500", color: "#888", lineHeight: 21, marginBottom: 8 },
  menuRow: {
    minHeight: 52,
    borderRadius: 10,
    borderCurve: "continuous",
    backgroundColor: "#151515",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  menuText: { fontSize: 15, fontWeight: "600", color: "#fff" },
  reason: {
    minHeight: 52,
    borderRadius: 10,
    borderCurve: "continuous",
    backgroundColor: "#151515",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  reasonSelected: { borderColor: "#e54242" },
  note: {
    minHeight: 72,
    borderRadius: 10,
    borderCurve: "continuous",
    backgroundColor: "#151515",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: "#fff",
    fontSize: 15,
    textAlignVertical: "top",
  },
  error: { fontSize: 14, color: "#f87171" },
  dismiss: {
    minHeight: 44,
    marginTop: 4,
    borderRadius: 10,
    borderCurve: "continuous",
    backgroundColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 8 },
  cancelButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderCurve: "continuous",
    backgroundColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  confirmButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderCurve: "continuous",
    backgroundColor: "#e54242",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmDisabled: { opacity: 0.4 },
  confirmText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});

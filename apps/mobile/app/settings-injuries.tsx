import { DateField } from '@/ui/primitives/date-field';
import { Dropdown } from '@/ui/primitives/dropdown';
import { FadingScrollView } from '@/ui/primitives/fading-scroll-view';
import { Toast } from '@/ui/primitives/toast';
import { randomId } from '@/data/id';
import { injuryRepository } from '@/data/injury-repository';
import { triggerSyncAfterWrite } from '@/data/sync-trigger';
import { BODY_PARTS, BodyPart, bodyPartLabel, isBodyPart } from '@/constants/body-parts';
import { useAuth } from '@/context/auth-context';
import { Injury, InjurySeverity, InjurySide } from '@/types/user';
import { applyInjuryToHistory, removeInjuryFromHistory } from '@/lib/injuries';
import { toDateObj } from '@/lib/workout-conversion';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SEVERITIES: InjurySeverity[] = ['mild', 'moderate', 'severe'];
const SIDE_OPTIONS = ['Not specified', 'Left', 'Right', 'Both'] as const;

type ViewState =
  | { kind: 'list' }
  | { kind: 'detail'; id: string }
  | { kind: 'form'; id?: string; origin: 'list' | 'detail' };

type FormDraft = {
  bodyPart: BodyPart | null;
  side: InjurySide | undefined;
  severity: InjurySeverity;
  onsetDate: Date;
  status: Injury['status'];
  resolvedDate: Date;
  avoidText: string;
  notes: string;
};

const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const atNoon = (date: Date) => {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  return next;
};
const dateLabel = (value: unknown) => toDateObj(value)?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) ?? 'Date not set';
const dateValue = (value: unknown) => toDateObj(value)?.getTime() ?? 0;
const sideLabel = (side?: InjurySide) => side ? cap(side) : 'Not specified';

function draftFromInjury(injury?: Injury): FormDraft {
  return {
    bodyPart: injury?.bodyPart ?? null,
    side: injury?.side,
    severity: injury?.severity ?? 'moderate',
    onsetDate: atNoon(toDateObj(injury?.onsetDate) ?? new Date()),
    status: injury?.status ?? 'ongoing',
    resolvedDate: atNoon(toDateObj(injury?.resolvedDate) ?? new Date()),
    avoidText: injury?.avoid?.join(', ') ?? '',
    notes: injury?.notes ?? '',
  };
}

function sideFromLabel(label: string): InjurySide | undefined {
  if (label === 'Left') return 'left';
  if (label === 'Right') return 'right';
  if (label === 'Both') return 'both';
  return undefined;
}

export default function SettingsInjuriesScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [injuries, setInjuries] = useState<Injury[]>([]);
  const [view, setView] = useState<ViewState>({ kind: 'list' });
  const [draft, setDraft] = useState<FormDraft>(() => draftFromInjury());
  const [savedDraft, setSavedDraft] = useState<FormDraft>(() => draftFromInjury());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pastExpanded, setPastExpanded] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [discardVisible, setDiscardVisible] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' }>({ visible: false, message: '', type: 'success' });

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(false);
    try {
      const stored = await injuryRepository.getAll(user.uid);
      setInjuries(stored.map((record) => record.data).filter((injury) => isBodyPart(injury?.bodyPart)));
    } catch (error) {
      console.error(error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const selected = view.kind === 'detail' || view.kind === 'form' ? injuries.find((injury) => injury.id === view.id) : undefined;
  const ongoing = useMemo(() => injuries.filter((injury) => injury.status === 'ongoing'), [injuries]);
  const past = useMemo(() => injuries.filter((injury) => injury.status === 'resolved'), [injuries]);
  const formChanged = view.kind === 'form' && JSON.stringify(draft) !== JSON.stringify(savedDraft);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => setToast({ visible: true, message, type });

  const openAdd = () => {
    const next = draftFromInjury();
    setDraft(next);
    setSavedDraft(next);
    setView({ kind: 'form', origin: 'list' });
  };

  const openEdit = (injury: Injury) => {
    const next = draftFromInjury(injury);
    setDraft(next);
    setSavedDraft(next);
    setView({ kind: 'form', id: injury.id, origin: 'detail' });
  };

  const goBackFromForm = () => {
    if (formChanged) {
      setDiscardVisible(true);
      return;
    }
    setView(view.kind === 'form' && view.origin === 'detail' && view.id ? { kind: 'detail', id: view.id } : { kind: 'list' });
  };

  const discardForm = () => {
    setDiscardVisible(false);
    setView(view.kind === 'form' && view.origin === 'detail' && view.id ? { kind: 'detail', id: view.id } : { kind: 'list' });
  };

  const saveDraft = async () => {
    if (!user || busy) return;
    if (!draft.bodyPart) {
      showToast('Choose a body part before saving', 'error');
      return;
    }
    if (draft.status === 'resolved' && dateValue(draft.resolvedDate) < dateValue(draft.onsetDate)) {
      showToast('Date ended cannot be before Date started', 'error');
      return;
    }
    setBusy(true);
    const now = new Date().toISOString();
    const existing = selected;
    const avoid = draft.avoidText.split(',').map((value) => value.trim()).filter(Boolean);
    const injury: Injury = {
      ...(existing ?? {}),
      id: existing?.id ?? randomId(),
      bodyPart: draft.bodyPart,
      side: draft.side,
      severity: draft.severity,
      status: draft.status,
      onsetDate: draft.onsetDate.toISOString(),
      ...(draft.status === 'resolved' ? { resolvedDate: draft.resolvedDate.toISOString() } : { resolvedDate: null }),
      ...(avoid.length ? { avoid } : { avoid: undefined }),
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : { notes: undefined }),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      if (existing) await injuryRepository.update(user.uid, injury);
      else await injuryRepository.create(user.uid, injury);
      triggerSyncAfterWrite();
      setInjuries((current) => existing ? current.map((item) => item.id === injury.id ? injury : item) : [...current, injury]);
      setView({ kind: 'detail', id: injury.id });
      showToast(existing ? 'Injury updated' : 'Injury saved');
    } catch (error) {
      console.error(error);
      showToast('Could not save injury. Your changes are still here.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const markEnded = async (injury: Injury) => {
    if (!user || busy) return;
    setBusy(true);
    const ended = atNoon(new Date()).toISOString();
    const updated = { ...injury, status: 'resolved' as const, resolvedDate: ended, updatedAt: new Date().toISOString() };
    try {
      await injuryRepository.update(user.uid, updated);
      triggerSyncAfterWrite();
      setInjuries((current) => current.map((item) => item.id === injury.id ? updated : item));
      showToast('Injury marked as ended');
    } catch (error) {
      console.error(error);
      showToast('Could not mark the injury as ended', 'error');
    } finally {
      setBusy(false);
    }
  };

  const applyHistory = async (injury: Injury) => {
    if (!user || busy) return;
    setBusy(true);
    try {
      const count = await applyInjuryToHistory(user.uid, injury);
      triggerSyncAfterWrite();
      showToast(`Added ${count} workout${count === 1 ? '' : 's'} from ${dateLabel(injury.onsetDate)} to ${injury.resolvedDate ? dateLabel(injury.resolvedDate) : 'today'}`);
    } catch (error) {
      console.error(error);
      showToast('Could not add the injury to past workouts', 'error');
    } finally {
      setBusy(false);
    }
  };

  const deleteInjury = async () => {
    if (!user || !selected || busy) return;
    setBusy(true);
    try {
      await removeInjuryFromHistory(user.uid, selected.id);
      await injuryRepository.softDelete(user.uid, selected.id);
      triggerSyncAfterWrite();
      setInjuries((current) => current.filter((injury) => injury.id !== selected.id));
      setDeleteVisible(false);
      setView({ kind: 'list' });
      showToast('Injury deleted and removed from workout history');
    } catch (error) {
      console.error(error);
      showToast('Could not delete the injury and its history links', 'error');
    } finally {
      setBusy(false);
    }
  };

  const header = (title: string, onBack: () => void) => (
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.headerButton}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerButton} />
    </View>
  );

  function renderRow(injury: Injury) {
    return (
      <TouchableOpacity key={injury.id} accessibilityRole="button" accessibilityLabel={`${bodyPartLabel(injury.bodyPart)}, ${sideLabel(injury.side)}, ${cap(injury.severity)}`} style={styles.row} onPress={() => setView({ kind: 'detail', id: injury.id })}>
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle}>{bodyPartLabel(injury.bodyPart)} · {sideLabel(injury.side)}</Text>
          <Text style={styles.rowMeta}>{cap(injury.severity)} · {dateLabel(injury.onsetDate)}{injury.resolvedDate ? ` – ${dateLabel(injury.resolvedDate)}` : ' – ongoing'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#888" />
      </TouchableOpacity>
    );
  }

  const renderList = () => (
    <>
      {header('Injuries', () => router.back())}
      <FadingScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity accessibilityRole="button" style={styles.primaryButton} onPress={openAdd} disabled={loading || busy}><Text style={styles.primaryButtonText}>Add injury</Text></TouchableOpacity>
        {loading ? <ActivityIndicator accessibilityLabel="Loading injuries" size="small" color="#e54242" style={styles.loader} /> : loadError ? (
          <View style={styles.messageBlock}><Text style={styles.empty}>Could not load injuries.</Text><TouchableOpacity style={styles.secondaryButton} onPress={() => void load()} disabled={busy}><Text style={styles.actionText}>Retry</Text></TouchableOpacity></View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>Current injuries</Text>
            {ongoing.length ? ongoing.map(renderRow) : <Text style={styles.empty}>No current injuries.</Text>}
            <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: pastExpanded }} style={styles.pastHeader} onPress={() => setPastExpanded((expanded) => !expanded)}><Text style={styles.sectionLabel}>Past injuries</Text><Ionicons name={pastExpanded ? 'chevron-up' : 'chevron-down'} size={20} color="#888" /></TouchableOpacity>
            {pastExpanded ? (past.length ? past.map(renderRow) : <Text style={styles.empty}>No past injuries.</Text>) : null}
          </>
        )}
      </FadingScrollView>
    </>
  );

  const renderDetail = (injury: Injury) => (
    <>
      {header('Injury details', () => setView({ kind: 'list' }))}
      <FadingScrollView contentContainerStyle={styles.content}>
        <Text style={styles.detailTitle}>{bodyPartLabel(injury.bodyPart)} · {sideLabel(injury.side)}</Text>
        <Text style={styles.detailStatus}>{injury.status === 'ongoing' ? 'Current injury' : 'Past injury'} · {cap(injury.severity)}</Text>
        <View style={styles.detailCard}>
          <Text style={styles.detailLabel}>Date started</Text><Text style={styles.detailValue}>{dateLabel(injury.onsetDate)}</Text>
          {injury.resolvedDate ? <><Text style={styles.detailLabel}>Date ended</Text><Text style={styles.detailValue}>{dateLabel(injury.resolvedDate)}</Text></> : null}
          <Text style={styles.detailLabel}>Past workout range</Text><Text style={styles.detailValue}>{dateLabel(injury.onsetDate)} – {injury.resolvedDate ? dateLabel(injury.resolvedDate) : 'today'}</Text>
          <Text style={styles.detailHint}>Adding to past workouts only affects completed workouts in this saved date range.</Text>
          {injury.avoid?.length ? <><Text style={styles.detailLabel}>Movements to avoid</Text><Text style={styles.detailValue}>{injury.avoid.join(', ')}</Text></> : null}
          {injury.notes ? <><Text style={styles.detailLabel}>Notes</Text><Text style={styles.detailValue}>{injury.notes}</Text></> : null}
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={() => openEdit(injury)} disabled={busy}><Text style={styles.primaryButtonText}>Edit injury</Text></TouchableOpacity>
        {injury.status === 'ongoing' ? <TouchableOpacity style={styles.secondaryButton} onPress={() => void markEnded(injury)} disabled={busy}><Text style={styles.actionText}>Mark as ended</Text></TouchableOpacity> : null}
        <TouchableOpacity style={styles.secondaryButton} onPress={() => void applyHistory(injury)} disabled={busy}><Text style={styles.actionText}>Add to past workouts</Text></TouchableOpacity>
        <TouchableOpacity style={styles.dangerButton} onPress={() => setDeleteVisible(true)} disabled={busy}><Text style={styles.dangerText}>Delete injury</Text></TouchableOpacity>
      </FadingScrollView>
    </>
  );

  const renderForm = () => (
    <>
      {header(view.kind === 'form' && view.id ? 'Edit injury' : 'Add injury', goBackFromForm)}
      <FadingScrollView contentContainerStyle={styles.content}>
        <Text style={styles.formIntro}>{view.kind === 'form' && view.id ? 'Update the details below. Saving does not change past workouts.' : 'Save the injury first, then decide whether to add it to past workouts.'}</Text>
        <Text style={styles.fieldLabel}>Body part</Text>
        <Dropdown accessibilityLabel="Body part" options={BODY_PARTS.map(bodyPartLabel)} value={draft.bodyPart ? bodyPartLabel(draft.bodyPart) : null} onSelect={(value) => setDraft((current) => ({ ...current, bodyPart: BODY_PARTS.find((part) => bodyPartLabel(part) === value) ?? null }))} placeholder="Choose a body part" style={styles.fieldControl} />
        <Text style={styles.fieldLabel}>Side</Text>
        <Dropdown accessibilityLabel="Side" options={[...SIDE_OPTIONS]} value={sideLabel(draft.side)} onSelect={(value) => setDraft((current) => ({ ...current, side: sideFromLabel(value) }))} placeholder="Side" style={styles.fieldControl} />
        <Text style={styles.fieldLabel}>Severity</Text>
        <Dropdown accessibilityLabel="Severity" options={SEVERITIES.map(cap)} value={cap(draft.severity)} onSelect={(value) => setDraft((current) => ({ ...current, severity: value.toLowerCase() as InjurySeverity }))} placeholder="Severity" style={styles.fieldControl} />
        <Text style={styles.fieldLabel}>Date started</Text><DateField value={draft.onsetDate} onChange={(date) => setDraft((current) => ({ ...current, onsetDate: atNoon(date) }))} />
        <Text style={styles.fieldLabel}>Status</Text>
        <View style={styles.statusOptions}>{(['ongoing', 'resolved'] as const).map((status) => <TouchableOpacity key={status} accessibilityRole="radio" accessibilityState={{ selected: draft.status === status }} style={[styles.statusOption, draft.status === status && styles.statusOptionSelected]} onPress={() => setDraft((current) => ({ ...current, status }))}><Text style={draft.status === status ? styles.statusOptionTextSelected : styles.statusOptionText}>{status === 'ongoing' ? 'Still ongoing' : 'Ended'}</Text></TouchableOpacity>)}</View>
        {draft.status === 'resolved' ? <><Text style={styles.fieldLabel}>Date ended</Text><DateField value={draft.resolvedDate} onChange={(date) => setDraft((current) => ({ ...current, resolvedDate: atNoon(date) }))} /></> : null}
        <Text style={styles.fieldLabel}>Movements to avoid (optional)</Text><TextInput accessibilityLabel="Movements to avoid" style={styles.input} placeholder="e.g. overhead press, dips" placeholderTextColor="#777" value={draft.avoidText} onChangeText={(avoidText) => setDraft((current) => ({ ...current, avoidText }))} />
        <Text style={styles.fieldLabel}>Notes (optional)</Text><TextInput accessibilityLabel="Notes" style={[styles.input, styles.notesInput]} placeholder="What should you remember?" placeholderTextColor="#777" value={draft.notes} onChangeText={(notes) => setDraft((current) => ({ ...current, notes }))} multiline />
        <TouchableOpacity accessibilityRole="button" style={[styles.primaryButton, busy && styles.disabled]} onPress={() => void saveDraft()} disabled={busy}>{busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryButtonText}>Save injury</Text>}</TouchableOpacity>
      </FadingScrollView>
    </>
  );

  return (
    <View style={styles.container}>
      <Toast visible={toast.visible} message={toast.message} type={toast.type} onHide={() => setToast((current) => ({ ...current, visible: false }))} />
      {view.kind === 'list' ? renderList() : view.kind === 'detail' && selected ? renderDetail(selected) : renderForm()}
      <Modal transparent visible={deleteVisible} animationType="fade" onRequestClose={() => setDeleteVisible(false)}><View style={styles.modalBackdrop}><View style={styles.modalCard}><Text style={styles.modalTitle}>Delete injury?</Text><Text style={styles.modalBody}>This deletes the injury and removes its link from every workout. This cannot be undone.</Text><View style={styles.modalRow}><TouchableOpacity style={styles.secondaryButton} onPress={() => setDeleteVisible(false)} disabled={busy}><Text style={styles.actionText}>Keep injury</Text></TouchableOpacity><TouchableOpacity style={styles.dangerButton} onPress={() => void deleteInjury()} disabled={busy}><Text style={styles.dangerText}>{busy ? 'Deleting…' : 'Delete injury'}</Text></TouchableOpacity></View></View></View></Modal>
      <Modal transparent visible={discardVisible} animationType="fade" onRequestClose={() => setDiscardVisible(false)}><View style={styles.modalBackdrop}><View style={styles.modalCard}><Text style={styles.modalTitle}>Discard changes?</Text><Text style={styles.modalBody}>Your unsaved injury changes will be lost.</Text><View style={styles.modalRow}><TouchableOpacity style={styles.secondaryButton} onPress={() => setDiscardVisible(false)}><Text style={styles.actionText}>Keep editing</Text></TouchableOpacity><TouchableOpacity style={styles.dangerButton} onPress={discardForm}><Text style={styles.dangerText}>Discard changes</Text></TouchableOpacity></View></View></View></Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  headerButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  content: { padding: 20, paddingBottom: 48 },
  loader: { marginVertical: 24 },
  sectionLabel: { flex: 1, fontSize: 15, color: '#fff', fontWeight: '700', marginBottom: 12 },
  pastHeader: { minHeight: 52, flexDirection: 'row', alignItems: 'center', marginTop: 24 },
  empty: { color: '#888', fontSize: 15, lineHeight: 22 },
  messageBlock: { marginTop: 28, gap: 12 },
  row: { minHeight: 72, backgroundColor: '#1c1c1c', borderRadius: 14, borderWidth: 1, borderColor: '#2a2a2a', padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center' },
  rowCopy: { flex: 1, gap: 5 },
  rowTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  rowMeta: { color: '#aaa', fontSize: 13, lineHeight: 19 },
  primaryButton: { minHeight: 48, borderRadius: 14, backgroundColor: '#e54242', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginBottom: 24 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryButton: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: '#2e2e2e', backgroundColor: '#1c1c1c', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginBottom: 12 },
  actionText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  dangerButton: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: '#5a2020', backgroundColor: '#2a1414', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginBottom: 12 },
  dangerText: { color: '#e54242', fontSize: 15, fontWeight: '600' },
  detailTitle: { color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 8 },
  detailStatus: { color: '#e54242', fontSize: 15, marginBottom: 20 },
  detailCard: { backgroundColor: '#1c1c1c', borderRadius: 14, borderWidth: 1, borderColor: '#2a2a2a', padding: 16, marginBottom: 20 },
  detailLabel: { color: '#aaa', fontSize: 13, fontWeight: '600', marginTop: 12, marginBottom: 4 },
  detailValue: { color: '#fff', fontSize: 15, lineHeight: 22 },
  detailHint: { color: '#888', fontSize: 13, lineHeight: 19, marginTop: 12 },
  formIntro: { color: '#aaa', fontSize: 14, lineHeight: 21, marginBottom: 8 },
  fieldLabel: { color: '#aaa', fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  fieldControl: { marginBottom: 0 },
  statusOptions: { flexDirection: 'row', gap: 8 },
  statusOption: { flex: 1, minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: '#2e2e2e', backgroundColor: '#151515', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  statusOptionSelected: { borderColor: '#e54242', backgroundColor: '#2a1414' },
  statusOptionText: { color: '#aaa', fontSize: 14 },
  statusOptionTextSelected: { color: '#fff', fontSize: 14, fontWeight: '600' },
  input: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: '#2e2e2e', backgroundColor: '#151515', color: '#fff', paddingHorizontal: 12, paddingVertical: 12, fontSize: 15 },
  notesInput: { minHeight: 96, textAlignVertical: 'top' },
  disabled: { opacity: 0.6 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#1c1c1c', borderRadius: 14, borderWidth: 1, borderColor: '#2a2a2a', padding: 24 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 10 },
  modalBody: { color: '#aaa', fontSize: 15, lineHeight: 22, marginBottom: 20 },
  modalRow: { gap: 4 },
});

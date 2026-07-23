import { Dropdown } from '@/components/ui/dropdown';
import { Toast } from '@/components/ui/toast';
import { db } from '@/config/firebase';
import { BODY_PARTS, BodyPart, bodyPartLabel, isBodyPart } from '@/constants/body-parts';
import { useAuth } from '@/context/auth-context';
import { Injury, InjurySeverity, InjurySide } from '@/types/user';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Timestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SEVERITIES: InjurySeverity[] = ['mild', 'moderate', 'severe'];
const SIDE_OPTIONS = ['N/A', 'Left', 'Right', 'Both'] as const;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function labelToSide(label: string): InjurySide | undefined {
  if (label === 'Left') return 'left';
  if (label === 'Right') return 'right';
  if (label === 'Both') return 'both';
  return undefined;
}

export default function SettingsInjuriesScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [injuries, setInjuries] = useState<Injury[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Add-form state
  const [bodyPart, setBodyPart] = useState<BodyPart>('shoulder');
  const [severity, setSeverity] = useState<InjurySeverity>('moderate');
  const [sideLabel, setSideLabel] = useState<string>('N/A');
  const [avoidText, setAvoidText] = useState('');
  const [notes, setNotes] = useState('');

  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' }>({
    visible: false,
    message: '',
    type: 'success',
  });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      try {
        const snapshot = await getDoc(doc(db, 'users', user.uid));
        const stored = snapshot.data()?.injuries;
        if (Array.isArray(stored)) {
          setInjuries(stored.filter((i: Injury) => isBodyPart(i?.bodyPart)));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const persist = async (next: Injury[]) => {
    if (!user) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'users', user.uid), { injuries: next }, { merge: true });
      setInjuries(next);
      return true;
    } catch (err) {
      console.error(err);
      setToast({ visible: true, message: 'Could not save injuries', type: 'error' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    // onsetDate defaults to now — ponytail: no date picker in MVP, add when past-injury UI lands.
    const now = Timestamp.now();
    const avoid = avoidText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const injury: Injury = {
      id: newId(),
      bodyPart,
      severity,
      status: 'ongoing',
      onsetDate: now,
      createdAt: now,
      updatedAt: now,
      ...(labelToSide(sideLabel) ? { side: labelToSide(sideLabel) } : {}),
      ...(avoid.length ? { avoid } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    const ok = await persist([...injuries, injury]);
    if (ok) {
      setAvoidText('');
      setNotes('');
      setSideLabel('N/A');
      setToast({ visible: true, message: 'Injury added', type: 'success' });
    }
  };

  const handleResolve = async (id: string) => {
    const now = Timestamp.now();
    const next = injuries.map((i) =>
      i.id === id ? { ...i, status: 'resolved' as const, resolvedDate: now, updatedAt: now } : i
    );
    const ok = await persist(next);
    if (ok) setToast({ visible: true, message: 'Marked resolved', type: 'success' });
  };

  const ongoing = injuries.filter((i) => i.status === 'ongoing');

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Injuries</Text>
        <View style={{ width: 24 }} />
      </View>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>Ongoing injuries</Text>
        {loading ? (
          <ActivityIndicator size="small" color="#e54242" style={{ marginVertical: 16 }} />
        ) : ongoing.length === 0 ? (
          <Text style={styles.empty}>No ongoing injuries.</Text>
        ) : (
          ongoing.map((inj) => (
            <View key={inj.id} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>
                  {bodyPartLabel(inj.bodyPart)}
                  {inj.side ? ` (${cap(inj.side)})` : ''}
                </Text>
                <Text style={styles.cardMeta}>{cap(inj.severity)}</Text>
                {inj.notes ? <Text style={styles.cardNotes}>{inj.notes}</Text> : null}
                {inj.avoid?.length ? (
                  <Text style={styles.cardNotes}>Avoid: {inj.avoid.join(', ')}</Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={styles.resolveButton}
                onPress={() => handleResolve(inj.id)}
                disabled={saving}>
                <Text style={styles.resolveText}>Resolve</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>Add ongoing injury</Text>
        <View style={styles.form}>
          <Text style={styles.fieldLabel}>Body part</Text>
          <Dropdown
            options={BODY_PARTS.map((b) => bodyPartLabel(b))}
            value={bodyPartLabel(bodyPart)}
            onSelect={(val) => {
              const match = BODY_PARTS.find((b) => bodyPartLabel(b) === val);
              if (match) setBodyPart(match);
            }}
            placeholder="Select body part"
            style={styles.dropdown}
          />

          <Text style={styles.fieldLabel}>Severity</Text>
          <Dropdown
            options={SEVERITIES.map(cap)}
            value={cap(severity)}
            onSelect={(val) => setSeverity(val.toLowerCase() as InjurySeverity)}
            placeholder="Select severity"
            style={styles.dropdown}
          />

          <Text style={styles.fieldLabel}>Side</Text>
          <Dropdown
            options={[...SIDE_OPTIONS]}
            value={sideLabel}
            onSelect={setSideLabel}
            placeholder="Side"
            style={styles.dropdown}
          />

          <Text style={styles.fieldLabel}>Avoid (comma-separated)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. overhead press, dips"
            placeholderTextColor="#777"
            value={avoidText}
            onChangeText={setAvoidText}
          />

          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            placeholder="How it happened, symptoms…"
            placeholderTextColor="#777"
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleAdd}
            disabled={saving || loading}>
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Add Injury</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  content: { padding: 20, paddingBottom: 48 },
  sectionLabel: { fontSize: 15, color: '#fff', fontWeight: '700', marginBottom: 12 },
  empty: { color: '#888', fontSize: 14 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1c',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 15, color: '#fff', fontWeight: '600' },
  cardMeta: { fontSize: 13, color: '#e54242', marginTop: 2 },
  cardNotes: { fontSize: 13, color: '#999', marginTop: 4 },
  resolveButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2e2e2e',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginLeft: 12,
  },
  resolveText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  form: {
    backgroundColor: '#1c1c1c',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    padding: 16,
  },
  fieldLabel: { fontSize: 13, color: '#aaa', fontWeight: '600', marginBottom: 6, marginTop: 12 },
  dropdown: { marginBottom: 0 },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2e2e2e',
    backgroundColor: '#151515',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
  },
  notesInput: { minHeight: 72, textAlignVertical: 'top' },
  saveButton: {
    marginTop: 20,
    borderRadius: 10,
    backgroundColor: '#e54242',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});

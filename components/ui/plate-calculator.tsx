import { PLATE_DENOMS, PlateCounts, platesWeight, solvePlates } from '@/utils/plate-math';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Mode = 'barbell' | 'machine';

const MODES: { key: Mode; label: string }[] = [
  { key: 'barbell', label: 'Barbell' },
  { key: 'machine', label: 'Machine' },
];

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2))));

type PlateCalculatorProps = {
  visible: boolean;
  onClose: () => void;
};

// One-view plate calculator. Barbell mode shows plates per side on top of a bar weight;
// machine mode shows the plates hung on the machine on top of its starting weight.
// Plate counts are the source of truth — the target field just seeds them, so the total
// stays honest after you nudge the steppers.
export function PlateCalculator({ visible, onClose }: PlateCalculatorProps) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('barbell');
  const [barWeight, setBarWeight] = useState('45');
  const [baseWeight, setBaseWeight] = useState('0');
  const [target, setTarget] = useState('');
  const [counts, setCounts] = useState<PlateCounts>({});

  const solveFor = (t: string, m: Mode, bar: string, base: string) => {
    if (t.trim() === '') return;
    const load = m === 'barbell' ? (num(t) - num(bar)) / 2 : num(t) - num(base);
    setCounts(solvePlates(load));
  };

  const changeTarget = (v: string) => {
    setTarget(v);
    solveFor(v, mode, barWeight, baseWeight);
  };

  const changeBar = (v: string) => {
    setBarWeight(v);
    solveFor(target, mode, v, baseWeight);
  };

  const changeBase = (v: string) => {
    setBaseWeight(v);
    solveFor(target, mode, barWeight, v);
  };

  const changeMode = (m: Mode) => {
    setMode(m);
    solveFor(target, m, barWeight, baseWeight);
  };

  const bump = (denom: number, delta: number) =>
    setCounts((c) => ({ ...c, [denom]: Math.max(0, (c[denom] ?? 0) + delta) }));

  const plateLoad = platesWeight(counts);
  const start = mode === 'barbell' ? num(barWeight) : num(baseWeight);
  const total = mode === 'barbell' ? start + plateLoad * 2 : start + plateLoad;
  const offTarget = target.trim() !== '' && num(target) !== total;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView style={styles.cardWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.card, { paddingBottom: Math.max(20, insets.bottom) }]}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Plate Calculator</Text>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
            </View>

            <View style={styles.toggleRow}>
              {MODES.map((m) => (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.toggleButton, mode === m.key && styles.toggleButtonActive]}
                  onPress={() => changeMode(m.key)}
                  activeOpacity={0.8}>
                  <Text style={[styles.toggleText, mode === m.key && styles.toggleTextActive]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.inputRow}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{mode === 'barbell' ? 'Bar weight' : 'Starting weight'}</Text>
                <TextInput
                  style={styles.numInput}
                  keyboardType="decimal-pad"
                  value={mode === 'barbell' ? barWeight : baseWeight}
                  onChangeText={mode === 'barbell' ? changeBar : changeBase}
                  placeholder="0"
                  placeholderTextColor="#555"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Target weight</Text>
                <TextInput
                  style={styles.numInput}
                  keyboardType="decimal-pad"
                  value={target}
                  onChangeText={changeTarget}
                  placeholder="0"
                  placeholderTextColor="#555"
                />
              </View>
            </View>

            <Text style={styles.plateHeading}>{mode === 'barbell' ? 'Plates per side' : 'Plates loaded'}</Text>

            <ScrollView style={styles.plateList} keyboardShouldPersistTaps="handled">
              {PLATE_DENOMS.map((d) => {
                const c = counts[d] ?? 0;
                return (
                  <View key={d} style={[styles.plateRow, c === 0 && styles.plateRowEmpty]}>
                    <Text style={[styles.plateLabel, c === 0 && styles.plateLabelEmpty]}>{fmt(d)} lb</Text>
                    <View style={styles.stepper}>
                      <TouchableOpacity onPress={() => bump(d, -1)} hitSlop={10} disabled={c === 0}>
                        <Ionicons name="remove-circle" size={26} color={c === 0 ? '#3a3a3a' : '#e54242'} />
                      </TouchableOpacity>
                      <Text style={[styles.plateCount, c === 0 && styles.plateCountEmpty]}>{c}</Text>
                      <TouchableOpacity onPress={() => bump(d, 1)} hitSlop={10}>
                        <Ionicons name="add-circle" size={26} color="#e54242" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.resultBlock}>
              <Text style={styles.resultTotal}>{fmt(total)} lbs</Text>
              <Text style={styles.resultDetail}>
                {mode === 'barbell'
                  ? `${fmt(start)} lb bar + ${fmt(plateLoad)} lb per side`
                  : `${fmt(start)} lb start + ${fmt(plateLoad)} lb in plates`}
              </Text>
              {offTarget && (
                <Text style={styles.resultNote}>Closest loadable to a {fmt(num(target))} lb target</Text>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  cardWrap: {
    width: '100%',
  },
  card: {
    backgroundColor: '#1c1c1c',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingHorizontal: 20,
    paddingTop: 18,
    maxHeight: '88%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2e2e2e',
    backgroundColor: '#151515',
    alignItems: 'center',
  },
  toggleButtonActive: {
    borderColor: '#e54242',
    backgroundColor: 'rgba(229, 66, 66, 0.08)',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#888',
  },
  toggleTextActive: {
    color: '#e54242',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  field: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
    textAlign: 'center',
  },
  numInput: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2e2e2e',
    borderRadius: 8,
    paddingVertical: 10,
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
  },
  plateHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  plateList: {
    flexShrink: 1,
  },
  plateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(229, 66, 66, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(229, 66, 66, 0.35)',
    marginBottom: 6,
  },
  plateRowEmpty: {
    backgroundColor: '#141414',
    borderColor: '#242424',
  },
  plateLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  plateLabelEmpty: {
    color: '#666',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  plateCount: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    minWidth: 22,
    textAlign: 'center',
  },
  plateCountEmpty: {
    color: '#555',
  },
  resultBlock: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
    alignItems: 'center',
  },
  resultTotal: {
    fontSize: 30,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  resultDetail: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
  },
  resultNote: {
    fontSize: 12,
    color: '#e54242',
    marginTop: 6,
  },
});

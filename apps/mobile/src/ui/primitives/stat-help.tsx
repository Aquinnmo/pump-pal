import { Ionicons } from '@expo/vector-icons';
import { ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Sheet } from '@/ui/primitives/exercise-picker';

interface StatHelpProps {
  title: string;
  children: ReactNode;
}

// Quiet "?" next to a stat; opens a read-only sheet explaining it.
export function StatHelp({ title, children }: StatHelpProps) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`What is ${title}?`}
        hitSlop={13}
        onPress={() => setVisible(true)}
      >
        <Ionicons name="help-circle-outline" size={18} color="#888" />
      </Pressable>
      <Sheet visible={visible} title={title} onDismiss={() => setVisible(false)}>
        <View style={styles.body}>{children}</View>
      </Sheet>
    </>
  );
}

export function StatHelpText({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.text} selectable>
      {children}
    </Text>
  );
}

export function StatHelpFormula({ children }: { children: ReactNode }) {
  return (
    <View style={styles.formula}>
      <Text style={styles.formulaText} selectable>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: 20,
    gap: 14,
  },
  text: {
    color: '#ccc',
    fontSize: 15,
    lineHeight: 22,
  },
  formula: {
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#2e2e2e',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  formulaText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});

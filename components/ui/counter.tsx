import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface CounterProps {
  label: string;
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
}

export function VerticalCounter({ label, value, onIncrement, onDecrement }: CounterProps) {
  return (
    <View style={styles.numField}>
      <Text style={styles.numLabel}>{label}</Text>
      <View style={styles.incrementerContainer}>
        <TouchableOpacity onPress={onIncrement} style={styles.incrementerButton} hitSlop={10}>
          <Ionicons name="add-circle" size={28} color="#e54242" />
        </TouchableOpacity>
        <Text style={styles.incrementerValue}>{value}</Text>
        <TouchableOpacity onPress={onDecrement} style={styles.incrementerButton} hitSlop={10}>
          <Ionicons name="remove-circle" size={28} color="#e54242" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function HorizontalCounter({ label, value, onIncrement, onDecrement }: CounterProps) {
  return (
    <View style={styles.numField}>
      <Text style={styles.numLabel}>{label}</Text>
      <View style={styles.incrementerContainerHorizontal}>
        <TouchableOpacity onPress={onDecrement} hitSlop={10}>
          <Ionicons name="remove-circle" size={28} color="#e54242" />
        </TouchableOpacity>
        <Text style={styles.incrementerValue}>{value}</Text>
        <TouchableOpacity onPress={onIncrement} hitSlop={10}>
          <Ionicons name="add-circle" size={28} color="#e54242" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  numField: {
    flex: 1,
  },
  numLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
    textAlign: 'center',
  },
  incrementerContainer: {
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#2e2e2e',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flex: 1,
  },
  incrementerContainerHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#2e2e2e',
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 48,
  },
  incrementerButton: {
    paddingVertical: 6,
    paddingHorizontal: 0,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  incrementerValue: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '700',
    paddingVertical: 4,
  },
});

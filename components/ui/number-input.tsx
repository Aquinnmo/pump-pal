import React from 'react';
import { KeyboardTypeOptions, StyleSheet, Text, TextInput, View } from 'react-native';

interface NumberInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur: () => void;
  keyboardType?: KeyboardTypeOptions;
}

export function VerticalNumberInput({ label, value, onChangeText, onBlur, keyboardType = 'number-pad' }: NumberInputProps) {
  return (
    <View style={styles.numField}>
      <Text style={styles.numLabel}>{label}</Text>
      <View style={styles.stretchContainer}>
        <TextInput
          style={[styles.numInput, styles.numInputStretch]}
          keyboardType={keyboardType}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
        />
      </View>
    </View>
  );
}

export function HorizontalNumberInput({ label, value, onChangeText, onBlur, keyboardType = 'number-pad' }: NumberInputProps) {
  return (
    <View style={styles.numField}>
      <Text style={styles.numLabel}>{label}</Text>
      <TextInput
        style={styles.numInput}
        keyboardType={keyboardType}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
      />
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
  numInput: {
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#2e2e2e',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 48,
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
  },
  stretchContainer: {
    flex: 1,
  },
  numInputStretch: {
    flex: 1,
    paddingVertical: 0,
    justifyContent: 'center',
    height: '100%',
  },
});

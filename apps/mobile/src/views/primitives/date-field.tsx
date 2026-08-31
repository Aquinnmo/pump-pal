import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity } from 'react-native';

export function DateField({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const [show, setShow] = useState(false);

  if (Platform.OS === 'web') {
    return React.createElement('input', {
      type: 'date',
      value: value.toISOString().split('T')[0],
      onChange: (e: any) => {
        if (e.target.value) onChange(new Date(e.target.value + 'T12:00:00'));
      },
      style: {
        background: '#2a2a2a', color: '#fff', border: '1px solid #3a3a3a',
        borderRadius: 6, padding: '6px 12px', fontSize: '15px', cursor: 'pointer', colorScheme: 'dark',
      },
    });
  }
  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={value}
        mode="date"
        display="default"
        onChange={(_e, date) => { if (date) onChange(date); }}
        themeVariant="dark"
      />
    );
  }
  return (
    <>
      <TouchableOpacity style={styles.button} onPress={() => setShow(true)}>
        <Text style={styles.text}>{value.toLocaleDateString()}</Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={value}
          mode="date"
          display="default"
          onChange={(_e, date) => { setShow(false); if (date) onChange(date); }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 10, borderWidth: 1, borderColor: '#2e2e2e',
    backgroundColor: '#151515', paddingHorizontal: 12, paddingVertical: 12, alignSelf: 'flex-start',
  },
  text: { color: '#fff', fontSize: 14 },
});

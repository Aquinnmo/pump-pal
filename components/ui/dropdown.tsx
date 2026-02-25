import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    Modal,
    ScrollView,
    StyleProp,
    StyleSheet,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
    ViewStyle,
} from 'react-native';

interface DropdownProps {
  options: readonly string[] | string[];
  value: string | null;
  onSelect: (value: string) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
}

export function Dropdown({
  options,
  value,
  onSelect,
  placeholder = 'Select an option',
  style,
}: DropdownProps) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <TouchableOpacity style={[styles.dropdownRow, style]} onPress={() => setVisible(true)}>
        <Text style={value ? styles.dropdownText : styles.placeholderText}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#888" />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{placeholder}</Text>
                  <TouchableOpacity onPress={() => setVisible(false)} hitSlop={8}>
                    <Ionicons name="close" size={24} color="#888" />
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.optionsList} showsVerticalScrollIndicator={false}>
                  {options.map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={[
                        styles.optionRow,
                        value === option && styles.optionRowSelected,
                      ]}
                      onPress={() => {
                        onSelect(option);
                        setVisible(false);
                      }}>
                      <Text
                        style={[
                          styles.optionText,
                          value === option && styles.optionTextSelected,
                        ]}>
                        {option}
                      </Text>
                      {value === option && (
                        <Ionicons name="checkmark" size={20} color="#e54242" />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  dropdownRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2e2e2e',
    backgroundColor: '#151515',
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownText: {
    color: '#fff',
    fontSize: 15,
  },
  placeholderText: {
    color: '#888',
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1c1c1c',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  optionsList: {
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  optionRowSelected: {
    backgroundColor: '#2a1515',
    borderRadius: 10,
    borderBottomWidth: 0,
  },
  optionText: {
    fontSize: 16,
    color: '#ccc',
  },
  optionTextSelected: {
    color: '#e54242',
    fontWeight: '600',
  },
});

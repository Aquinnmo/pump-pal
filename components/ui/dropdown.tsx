import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import {
    Dimensions,
    Modal,
    ScrollView,
    StyleProp,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const DISMISS_THRESHOLD = 120;

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
  const translateY = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);

  const dismiss = useCallback(() => {
    setVisible(false);
  }, []);

  const handleOpen = useCallback(() => {
    translateY.value = 0;
    overlayOpacity.value = 1;
    setVisible(true);
  }, [translateY, overlayOpacity]);

  const handleClose = useCallback(() => {
    translateY.value = withTiming(SCREEN_HEIGHT, { duration: 200 });
    overlayOpacity.value = withTiming(0, { duration: 200 }, () => {
      runOnJS(dismiss)();
    });
  }, [translateY, overlayOpacity, dismiss]);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
        overlayOpacity.value = Math.max(0, 1 - e.translationY / (SCREEN_HEIGHT * 0.4));
      }
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD) {
        translateY.value = withTiming(SCREEN_HEIGHT, { duration: 200 });
        overlayOpacity.value = withTiming(0, { duration: 200 }, () => {
          runOnJS(dismiss)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
        overlayOpacity.value = withSpring(1);
      }
    });

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(0,0,0,${0.6 * overlayOpacity.value})`,
  }));

  return (
    <>
      <TouchableOpacity style={[styles.dropdownRow, style]} onPress={handleOpen}>
        <Text style={value ? styles.dropdownText : styles.placeholderText}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#888" />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <Animated.View style={[styles.modalOverlay, overlayAnimatedStyle]}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
            <GestureDetector gesture={panGesture}>
              <Animated.View style={[styles.modalContent, cardAnimatedStyle]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{placeholder}</Text>
                  <TouchableOpacity onPress={handleClose} hitSlop={8}>
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
                        handleClose();
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
              </Animated.View>
            </GestureDetector>
          </Animated.View>
        </GestureHandlerRootView>
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

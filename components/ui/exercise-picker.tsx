import { ExerciseSearchOption } from '@/types/workout';
import { rankSearchOptions, slugify } from '@/utils/exercise-catalog';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const DISMISS_THRESHOLD = 120;

export type ExercisePickerSelection = {
  exerciseId: string;
  variationId: string | null;
  label: string;
};

interface ExercisePickerProps {
  options: ExerciseSearchOption[];
  value: string | null;
  recentLabels?: string[];
  onSelect: (selection: ExercisePickerSelection) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
}

export function ExercisePicker({
  options,
  value,
  recentLabels = [],
  onSelect,
  placeholder = 'Select exercise',
  style,
}: ExercisePickerProps) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const translateY = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);
  const insets = useSafeAreaInsets();

  const dismiss = useCallback(() => {
    setVisible(false);
    setQuery('');
  }, []);

  const handleOpen = useCallback(() => {
    translateY.value = 0;
    overlayOpacity.value = 1;
    setQuery('');
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

  const ranked = useMemo(
    () => rankSearchOptions(options, query, recentLabels),
    [options, query, recentLabels]
  );

  const trimmedQuery = query.trim();
  const exactMatch = trimmedQuery.length > 0 &&
    ranked.some((o) => o.label.toLowerCase() === trimmedQuery.toLowerCase());

  const selectOption = (option: ExerciseSearchOption) => {
    onSelect({ exerciseId: option.exerciseId, variationId: option.variationId, label: option.label });
    handleClose();
  };

  const selectCustom = () => {
    onSelect({
      exerciseId: 'under-review',
      variationId: `ur_${slugify(trimmedQuery)}`,
      label: trimmedQuery,
    });
    handleClose();
  };

  return (
    <>
      <TouchableOpacity style={[styles.pickerRow, style]} onPress={handleOpen}>
        <Text style={value ? styles.pickerText : styles.placeholderText} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#888" />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <Animated.View style={[styles.modalOverlay, overlayAnimatedStyle]}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
            <Animated.View style={[styles.modalContent, cardAnimatedStyle, { paddingBottom: Math.max(30, insets.bottom) }]}>
              <View style={[styles.navBarFill, { height: insets.bottom }]} />
              <GestureDetector gesture={panGesture}>
                <Animated.View>
                  <View style={styles.modalHeader}>
                    <View style={styles.pill} />
                    <View style={styles.modalHeaderRow}>
                      <Text style={styles.modalTitle}>{placeholder}</Text>
                      <TouchableOpacity onPress={handleClose} hitSlop={8}>
                        <Ionicons name="close" size={24} color="#888" />
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search exercises"
                      placeholderTextColor="#666"
                      value={query}
                      onChangeText={setQuery}
                      autoFocus
                      autoCorrect={false}
                    />
                  </View>
                </Animated.View>
              </GestureDetector>

              <FlatList
                style={styles.optionsList}
                data={ranked}
                keyExtractor={(item) => `${item.exerciseId}:${item.variationId ?? 'root'}`}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.optionRow, value === item.label && styles.optionRowSelected]}
                    onPress={() => selectOption(item)}>
                    <Text style={[styles.optionText, value === item.label && styles.optionTextSelected]}>
                      {item.label}
                    </Text>
                    {value === item.label && <Ionicons name="checkmark" size={20} color="#e54242" />}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  trimmedQuery.length === 0 ? (
                    <Text style={styles.emptyText}>No exercises found.</Text>
                  ) : null
                }
                ListFooterComponent={
                  trimmedQuery.length > 0 && !exactMatch ? (
                    <TouchableOpacity style={styles.customRow} onPress={selectCustom}>
                      <Ionicons name="add-circle-outline" size={20} color="#e54242" />
                      <Text style={styles.customRowText}>Use &quot;{trimmedQuery}&quot; as new exercise</Text>
                    </TouchableOpacity>
                  ) : null
                }
              />
            </Animated.View>
          </Animated.View>
        </GestureHandlerRootView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pickerRow: {
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
  pickerText: {
    color: '#fff',
    fontSize: 15,
    flex: 1,
    marginRight: 8,
  },
  placeholderText: {
    color: '#888',
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  navBarFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1c1c1c',
  },
  modalContent: {
    backgroundColor: '#1c1c1c',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 30,
  },
  pill: {
    width: 36,
    height: 4,
    backgroundColor: '#444',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
    marginTop: 6,
  },
  modalHeader: {
    flexDirection: 'column',
    padding: 20,
    paddingTop: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  searchInput: {
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#2e2e2e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
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
  emptyText: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    paddingVertical: 20,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  customRowText: {
    fontSize: 15,
    color: '#e54242',
    fontWeight: '600',
    flex: 1,
  },
});

import { ExerciseRef, ExerciseSearchOption } from '@/types/workout';
import { rankSearchOptions, slugify } from '@/utils/exercise-catalog';
import { Ionicons } from '@expo/vector-icons';
import {
  forwardRef,
  ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
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

export type ExercisePickerSelection = ExerciseRef;

export type SheetHandle = {
  // Plays the slide-down/fade-out animation, then calls onDone (defaults to the
  // sheet's onDismiss prop) once the animation completes.
  close: (onDone?: () => void) => void;
};

interface SheetProps {
  visible: boolean;
  title: string;
  onDismiss: () => void;
  headerExtra?: ReactNode;
  children: ReactNode;
  // 'sheet' (default): bottom sheet, slides up, drag-to-dismiss.
  // 'dialog': small fixed-size card, centered on screen, fades in, no drag.
  variant?: 'sheet' | 'dialog';
}

// Shared chrome (header with title + X, slide/fade animation, pan-to-dismiss
// for the sheet variant) so the recents popup and the search popup can be two
// independent <Modal>s without duplicating the animation/gesture wiring.
const Sheet = forwardRef<SheetHandle, SheetProps>(function Sheet(
  { visible, title, onDismiss, headerExtra, children, variant = 'sheet' },
  ref
) {
  const translateY = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);
  const scale = useSharedValue(1);
  const insets = useSafeAreaInsets();
  const isDialog = variant === 'dialog';

  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      overlayOpacity.value = 1;
      scale.value = 1;
    }
  }, [visible, translateY, overlayOpacity, scale]);

  const close = useCallback(
    (onDone?: () => void) => {
      if (isDialog) {
        scale.value = withTiming(0.9, { duration: 200 });
        overlayOpacity.value = withTiming(0, { duration: 200 }, () => {
          runOnJS(onDone ?? onDismiss)();
        });
        return;
      }
      translateY.value = withTiming(SCREEN_HEIGHT, { duration: 200 });
      overlayOpacity.value = withTiming(0, { duration: 200 }, () => {
        runOnJS(onDone ?? onDismiss)();
      });
    },
    [isDialog, translateY, overlayOpacity, scale, onDismiss]
  );

  useImperativeHandle(ref, () => ({ close }), [close]);

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
          runOnJS(onDismiss)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
        overlayOpacity.value = withSpring(1);
      }
    });

  const cardAnimatedStyle = useAnimatedStyle(() => {
    if (isDialog) {
      return {
        opacity: overlayOpacity.value,
        transform: [{ scale: scale.value }],
      };
    }
    return { transform: [{ translateY: translateY.value }] };
  });

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(0,0,0,${0.6 * overlayOpacity.value})`,
  }));

  const header = (
    <View style={styles.modalHeaderRow}>
      <Text style={styles.modalTitle}>{title}</Text>
      <TouchableOpacity onPress={() => close()} hitSlop={8}>
        <Ionicons name="close" size={24} color="#888" />
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isDialog ? 'fade' : 'slide'}
      onRequestClose={() => close()}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[styles.modalOverlay, isDialog && styles.dialogOverlay, overlayAnimatedStyle]}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => close()} />
          {isDialog ? (
            <Animated.View style={[styles.dialogContent, cardAnimatedStyle, { paddingBottom: Math.max(16, insets.bottom) }]}>
              <View style={styles.modalHeader}>
                {header}
                {headerExtra}
              </View>
              <View style={styles.dialogBody}>{children}</View>
            </Animated.View>
          ) : (
            <Animated.View style={[styles.modalContent, cardAnimatedStyle, { paddingBottom: Math.max(30, insets.bottom) }]}>
              <View style={[styles.navBarFill, { height: insets.bottom }]} />
              <GestureDetector gesture={panGesture}>
                <Animated.View>
                  <View style={styles.modalHeader}>
                    <View style={styles.pill} />
                    {header}
                    {headerExtra}
                  </View>
                </Animated.View>
              </GestureDetector>

              {children}
            </Animated.View>
          )}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
});

interface ExercisePickerProps {
  options: ExerciseSearchOption[];
  value: string | null;
  recentLabels?: string[];
  recentExercises?: ExerciseRef[];
  workoutName?: string;
  onSelect: (selection: ExercisePickerSelection) => void;
  onCreateNew?: (name: string) => Promise<ExercisePickerSelection | null>;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
}

export function ExercisePicker({
  options,
  value,
  recentLabels = [],
  recentExercises = [],
  workoutName,
  onSelect,
  onCreateNew,
  placeholder = 'Select exercise',
  style,
}: ExercisePickerProps) {
  const [recentsVisible, setRecentsVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const recentsSheetRef = useRef<SheetHandle>(null);
  const searchSheetRef = useRef<SheetHandle>(null);

  const handleOpen = useCallback(() => {
    setQuery('');
    setCreating(false);
    if (recentExercises.length > 0) {
      setRecentsVisible(true);
    } else {
      setSearchVisible(true);
    }
  }, [recentExercises.length]);

  const openSearch = useCallback(() => {
    setQuery('');
    setSearchVisible(true);
  }, []);

  const ranked = useMemo(
    () => rankSearchOptions(options, query, recentLabels),
    [options, query, recentLabels]
  );

  const trimmedQuery = query.trim();
  const exactMatch = trimmedQuery.length > 0 &&
    ranked.some((o) => o.label.toLowerCase() === trimmedQuery.toLowerCase());

  const selectOption = (option: ExerciseSearchOption) => {
    onSelect({ exerciseId: option.exerciseId, variationId: option.variationId, label: option.label });
    searchSheetRef.current?.close();
  };

  const selectRecent = (item: ExerciseRef) => {
    onSelect(item);
    recentsSheetRef.current?.close();
  };

  const handleOther = () => {
    recentsSheetRef.current?.close(() => {
      setRecentsVisible(false);
      openSearch();
    });
  };

  const fallbackSentinel = (): ExercisePickerSelection => ({
    exerciseId: 'under-review',
    variationId: `ur_${slugify(trimmedQuery)}`,
    label: trimmedQuery,
  });

  const handleCreate = async () => {
    if (!onCreateNew) {
      onSelect(fallbackSentinel());
      searchSheetRef.current?.close();
      return;
    }

    setCreating(true);
    try {
      const created = await onCreateNew(trimmedQuery);
      onSelect(created ?? fallbackSentinel());
      searchSheetRef.current?.close();
    } catch {
      onSelect(fallbackSentinel());
      searchSheetRef.current?.close();
    }
  };

  return (
    <>
      <TouchableOpacity style={[styles.pickerRow, style]} onPress={handleOpen}>
        <Text style={value ? styles.pickerText : styles.placeholderText} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#888" />
      </TouchableOpacity>

      <Sheet
        ref={recentsSheetRef}
        visible={recentsVisible}
        title={placeholder}
        onDismiss={() => setRecentsVisible(false)}>
        <FlatList
          style={styles.optionsList}
          data={recentExercises}
          keyExtractor={(item) => `${item.exerciseId}:${item.variationId ?? 'root'}`}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <Text style={styles.sectionHeaderText}>
              {workoutName ? `RECENT FOR ${workoutName.toUpperCase()}` : 'RECENT'}
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.optionRow, value === item.label && styles.optionRowSelected]}
              onPress={() => selectRecent(item)}>
              <Text style={[styles.optionText, value === item.label && styles.optionTextSelected]}>
                {item.label}
              </Text>
              {value === item.label && <Ionicons name="checkmark" size={20} color="#e54242" />}
            </TouchableOpacity>
          )}
          ListFooterComponent={
            <TouchableOpacity style={styles.customRow} onPress={handleOther}>
              <Ionicons name="search" size={18} color="#e54242" />
              <Text style={styles.customRowText}>Other / Search all exercises</Text>
            </TouchableOpacity>
          }
        />
      </Sheet>

      <Sheet
        ref={searchSheetRef}
        visible={searchVisible}
        title={placeholder}
        variant="dialog"
        onDismiss={() => { setSearchVisible(false); setQuery(''); setCreating(false); }}
        headerExtra={
          <TextInput
            style={styles.searchInput}
            placeholder="Search exercises"
            placeholderTextColor="#666"
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCorrect={false}
          />
        }>
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
              <TouchableOpacity style={styles.customRow} onPress={handleCreate} disabled={creating}>
                {creating ? (
                  <ActivityIndicator size="small" color="#e54242" />
                ) : (
                  <Ionicons name="add-circle-outline" size={20} color="#e54242" />
                )}
                <Text style={styles.customRowText}>
                  {creating ? 'Adding exercise…' : `Use "${trimmedQuery}" as new exercise`}
                </Text>
              </TouchableOpacity>
            ) : null
          }
        />
      </Sheet>
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
  dialogOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialogContent: {
    width: '94%',
    height: '90%',
    backgroundColor: '#1c1c1c',
    borderRadius: 24,
    overflow: 'hidden',
  },
  dialogBody: {
    flex: 1,
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
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    letterSpacing: 0.5,
    paddingHorizontal: 14,
    paddingBottom: 8,
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

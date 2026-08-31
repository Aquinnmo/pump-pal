import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { useReorderableDrag } from 'react-native-reorderable-list';

// Grip that starts a drag-reorder. Must be rendered inside a reorderable list's
// renderItem — useReorderableDrag() only works in that cell context.
export function DragHandle({ style }: { style?: StyleProp<ViewStyle> }) {
  const drag = useReorderableDrag();
  return (
    <Pressable onLongPress={drag} delayLongPress={120} hitSlop={10} style={[styles.handle, style]}>
      <Ionicons name="reorder-three" size={22} color="#888" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  handle: {
    padding: 4,
  },
});

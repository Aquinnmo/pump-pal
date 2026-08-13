import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface AnalyticsNavigationRowProps {
  title: string;
  accessibilityLabel: string;
  accessibilityHint: string;
  onPress: () => void;
  children?: ReactNode;
}

export function AnalyticsNavigationRow({
  title,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  children,
}: AnalyticsNavigationRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.copy}>
        <Text style={styles.title} selectable>
          {title}
        </Text>
        {children}
      </View>
      <Ionicons name="chevron-forward" size={21} color="#888" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  copy: { flex: 1, gap: 4 },
  title: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 21,
  },
  pressed: { opacity: 0.8 },
});

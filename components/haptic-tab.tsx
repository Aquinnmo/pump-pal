import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

// As of SDK 56 expo-router no longer renders through react-navigation, and its
// vendored copy of PlatformPressable is deprecated ("copy the component into
// your codebase"). Plain Pressable covers what the tab bar needs.
type HapticTabProps = Omit<PressableProps, 'style'> & {
  href?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function HapticTab({ onPressIn, ...props }: HapticTabProps) {
  return (
    <Pressable
      {...props}
      // Must come after the spread: the tab bar forwards an android_ripple that
      // PlatformPressable used to consume, and a bare Pressable would hand it to
      // native as a borderless ripple that the tab bar then clips. Press feedback
      // is the active tint change, plus the haptic below on iOS.
      android_ripple={null}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === 'ios') {
          // Add a soft haptic feedback when pressing down on the tabs.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onPressIn?.(ev);
      }}
    />
  );
}

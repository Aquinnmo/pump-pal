import { TimberLogoEndFace } from '@/ui/timber-logo';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const LOG_SIZE = 48;

// The fixed shuffle keeps tests deterministic while making the nine arrivals feel
// independent. Every log falls on one vertical track into a 3x3 end-face stack.
const LOG_MOTION = [
  { left: 48, top: 48, start: -152, delay: 96, duration: 520 },
  { left: 0, top: 96, start: -224, delay: 12, duration: 600 },
  { left: 96, top: 0, start: -184, delay: 184, duration: 470 },
  { left: 48, top: 0, start: -208, delay: 64, duration: 560 },
  { left: 0, top: 0, start: -176, delay: 232, duration: 440 },
  { left: 96, top: 96, start: -240, delay: 40, duration: 610 },
  { left: 0, top: 48, start: -192, delay: 144, duration: 480 },
  { left: 96, top: 48, start: -216, delay: 8, duration: 620 },
  { left: 48, top: 96, start: -168, delay: 112, duration: 500 },
] as const;

type FinishLogProps = {
  index: number;
  motion: (typeof LOG_MOTION)[number];
  reducedMotion: boolean;
};

function FinishLog({ index, motion, reducedMotion }: FinishLogProps) {
  const translateY = useSharedValue(reducedMotion ? 0 : motion.start);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: reducedMotion ? 0 : translateY.value }],
  }));

  useEffect(() => {
    if (reducedMotion) {
      translateY.value = 0;
      return;
    }

    translateY.value = motion.start;
    translateY.value = withDelay(
      motion.delay,
      withTiming(0, { duration: motion.duration }),
    );
  }, [motion, reducedMotion, translateY]);

  return (
    <Animated.View
      testID={`finish-workout-log-${index}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.log, { left: motion.left, top: motion.top }, animatedStyle]}
    >
      <TimberLogoEndFace size={LOG_SIZE} />
    </Animated.View>
  );
}

export function FinishWorkoutCelebration() {
  const reducedMotion = useReducedMotion();

  return (
    <View style={styles.container}>
      <View style={styles.logField}>
        {LOG_MOTION.map((motion, index) => (
          <FinishLog
            key={`${motion.left}-${motion.top}`}
            index={index}
            motion={motion}
            reducedMotion={reducedMotion}
          />
        ))}
        <Text accessibilityElementsHidden style={styles.check}>
          ✓
        </Text>
      </View>
      <Text accessibilityLiveRegion="polite" style={styles.label}>
        Workout complete
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logField: {
    width: LOG_SIZE * 3,
    height: LOG_SIZE * 3,
    position: 'relative',
  },
  log: {
    width: LOG_SIZE,
    height: LOG_SIZE,
    position: 'absolute',
  },
  check: {
    position: 'absolute',
    top: 48,
    left: 54,
    color: '#fff',
    fontSize: 38,
    fontWeight: '800',
    lineHeight: 48,
  },
  label: {
    marginTop: 16,
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 24 * 1.2,
  },
});

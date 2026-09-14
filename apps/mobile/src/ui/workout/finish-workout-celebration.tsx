import { TimberLogoEndFace } from '@/ui/timber-logo';
import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const LOG_SIZE = 48;

const LOG_TARGETS = [
  { x: -121, y: -38 },
  { x: -87, y: -4 },
  { x: -53, y: 30 },
  { x: -19, y: 64 },
  { x: 15, y: 30 },
  { x: 49, y: -4 },
  { x: 83, y: -38 },
  { x: 117, y: -72 },
  { x: 151, y: -106 },
] as const;

const ARRIVAL_DELAYS = [0, 35, 70, 105, 140, 175, 210, 245, 280] as const;

function shuffle<T>(items: readonly T[]) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapWith]] = [shuffled[swapWith], shuffled[index]];
  }
  return shuffled;
}

function createLogMotion(screenHeight: number) {
  const delays = shuffle(ARRIVAL_DELAYS);
  return LOG_TARGETS.map((target, index) => ({
    ...target,
    delay: delays[index],
    startY: -Math.round(screenHeight * 0.55 + Math.random() * 110),
    duration: Math.round(Math.random() * 60 + 340),
  }));
}

type FinishLogProps = {
  index: number;
  motion: ReturnType<typeof createLogMotion>[number];
  reducedMotion: boolean;
};

function FinishLog({ index, motion, reducedMotion }: FinishLogProps) {
  const translateY = useSharedValue(reducedMotion ? 0 : motion.startY);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion
      ? 1
      : interpolate(
          translateY.value,
          [motion.startY, motion.startY * 0.88, 0],
          [0, 1, 1],
          'clamp',
        ),
    transform: [{ translateY: reducedMotion ? 0 : translateY.value }],
  }));

  useEffect(() => {
    if (reducedMotion) {
      translateY.value = 0;
      return;
    }

    translateY.value = motion.startY;
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
      style={[
        styles.log,
        {
          marginLeft: motion.x - LOG_SIZE / 2,
          marginTop: motion.y - LOG_SIZE / 2,
        },
        animatedStyle,
      ]}
    >
      <TimberLogoEndFace size={LOG_SIZE} />
    </Animated.View>
  );
}

export function FinishWorkoutCelebration() {
  const reducedMotion = Boolean(useReducedMotion());
  const { height: measuredHeight } = useWindowDimensions();
  const screenHeight = measuredHeight || (typeof window !== 'undefined' ? window.innerHeight : 0);
  const motion = useMemo(() => createLogMotion(screenHeight), [screenHeight]);
  const labelOpacity = useSharedValue(reducedMotion ? 1 : 0);
  const labelStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion ? 1 : labelOpacity.value,
    transform: [{ translateY: reducedMotion ? 0 : 4 * (1 - labelOpacity.value) }],
  }));

  useEffect(() => {
    if (reducedMotion) {
      labelOpacity.value = 1;
      return;
    }

    labelOpacity.value = 0;
    labelOpacity.value = withDelay(760, withTiming(1, { duration: 180 }));
  }, [labelOpacity, reducedMotion]);

  return (
    <View testID="finish-workout-celebration" style={styles.container}>
      <View testID="finish-workout-stage" style={styles.stage}>
        {motion.map((logMotion, index) => (
          <FinishLog
            key={`${logMotion.x}-${logMotion.y}`}
            index={index}
            motion={logMotion}
            reducedMotion={reducedMotion}
          />
        ))}
      </View>
      <Animated.View testID="finish-workout-label" style={[styles.label, labelStyle]}>
        <Text accessibilityLiveRegion="polite" style={styles.labelText}>
          Workout complete
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f0f0f',
  },
  stage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  log: {
    width: LOG_SIZE,
    height: LOG_SIZE,
    position: 'absolute',
    top: '47%',
    left: '50%',
  },
  label: {
    position: 'absolute',
    bottom: 112,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  labelText: {
    color: '#888',
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.3,
    lineHeight: 15 * 1.4,
    textAlign: 'center',
  },
});

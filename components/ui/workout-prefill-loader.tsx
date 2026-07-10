import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

type WorkoutPrefillLoaderProps = {
  workoutName?: string | null;
};

type LoadingPlateProps = {
  progress: SharedValue<number>;
  reducedMotion: boolean;
  side: 'left' | 'right';
  position: number;
  height: number;
  width: number;
  color: string;
  start: number;
};

function LoadingPlate({
  progress,
  reducedMotion,
  side,
  position,
  height,
  width,
  color,
  start,
}: LoadingPlateProps) {
  const animatedStyle = useAnimatedStyle(() => {
    if (reducedMotion) {
      return { opacity: 1, transform: [{ translateX: 0 }, { scale: 1 }] };
    }

    const loadedAt = start + 0.14;
    return {
      opacity: interpolate(progress.value, [start, loadedAt, 0.88, 1], [0, 1, 1, 0], 'clamp'),
      transform: [
        {
          translateX: interpolate(
            progress.value,
            [start, loadedAt],
            [side === 'left' ? -16 : 16, 0],
            'clamp'
          ),
        },
        { scale: interpolate(progress.value, [start, loadedAt], [0.72, 1], 'clamp') },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.plate,
        {
          backgroundColor: color,
          height,
          width,
          left: position,
          top: (76 - height) / 2,
        },
        animatedStyle,
      ]}
    />
  );
}

const PLATES = [
  { left: 29, right: 152, height: 34, width: 9, color: '#b83232', start: 0.46 },
  { left: 39, right: 141, height: 44, width: 10, color: '#e54242', start: 0.27 },
  { left: 50, right: 129, height: 52, width: 11, color: '#ff8f8f', start: 0.08 },
] as const;

export function WorkoutPrefillLoader({ workoutName }: WorkoutPrefillLoaderProps) {
  const progress = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      progress.value = 0.72;
      return;
    }

    progress.value = withRepeat(
      withTiming(1, { duration: 1250, easing: Easing.inOut(Easing.quad) }),
      -1,
      false
    );
    return () => cancelAnimation(progress);
  }, [progress, reducedMotion]);

  const loadingLabel = workoutName ? `Loading ${workoutName}…` : 'Loading your workout…';

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(160)}
      style={styles.container}
      accessibilityRole="progressbar"
      accessibilityLabel={loadingLabel}
      accessibilityLiveRegion="polite">
      <View style={styles.barbell}>
        <View style={styles.bar} />
        <View style={styles.grip} />
        {PLATES.flatMap((plate) => [
          <LoadingPlate
            key={`left-${plate.left}`}
            progress={progress}
            reducedMotion={reducedMotion}
            side="left"
            position={plate.left}
            height={plate.height}
            width={plate.width}
            color={plate.color}
            start={plate.start}
          />,
          <LoadingPlate
            key={`right-${plate.right}`}
            progress={progress}
            reducedMotion={reducedMotion}
            side="right"
            position={plate.right}
            height={plate.height}
            width={plate.width}
            color={plate.color}
            start={plate.start}
          />,
        ])}
      </View>
      <Text style={styles.label}>{loadingLabel}</Text>
      <Text style={styles.subtitle}>Racking your last session</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  barbell: {
    width: 190,
    height: 76,
    position: 'relative',
    marginBottom: 8,
  },
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 35,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#69717c',
  },
  grip: {
    position: 'absolute',
    left: 70,
    top: 32,
    width: 50,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#e54242',
    backgroundColor: '#3a1e1e',
  },
  plate: {
    position: 'absolute',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  label: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  subtitle: {
    color: '#b86a6a',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});

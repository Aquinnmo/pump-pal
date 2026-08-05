import { profileRepository } from '@/db/profile-repository';
import { isSplitOption } from '@/constants/split-options';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { subscribeLiveUpdateNotificationActions } from '@/utils/live-update-notification-actions';
import { handleWorkoutAction, screenOwnsWorkoutActions } from '@/utils/wear-action-task';
import { subscribeWearActions } from '@/utils/wear-sync';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-get-random-values';
import 'react-native-reanimated';

const ONBOARDING_KEY = 'pumppal_onboarding_seen';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const [hasSplit, setHasSplit] = useState(false);
  const [checkingSplit, setCheckingSplit] = useState(true);
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((val) => {
      setOnboardingSeen(val === 'true');
    });
  }, []);

  useEffect(() => {
    if (loading) return;

    const checkSplit = async () => {
      if (!user) {
        setHasSplit(false);
        setCheckingSplit(false);
        return;
      }

      setCheckingSplit(true);
      try {
        const profile = await profileRepository.get(user.uid);
        const splitType = profile?.data.workoutSplit?.type;
        setHasSplit(isSplitOption(splitType));
      } catch {
        setHasSplit(false);
      } finally {
        setCheckingSplit(false);
      }
    };

    checkSplit();
  }, [user, loading, segments]);

  // Watch actions, for every case except "the active-workout screen is mounted" —
  // that screen subscribes itself and applies them to its own draft state.
  useEffect(() => {
    if (!user) return;
    const handleAction = (action: Parameters<typeof handleWorkoutAction>[0]) => {
      if (action.action === 'startWorkout') {
        // The watch's cached name can be stale, so re-resolve the real target. This
        // also correctly resumes a workout that is already in progress.
        router.push('/up-next');
        return;
      }
      if (screenOwnsWorkoutActions()) return;
      handleWorkoutAction(action, user.uid).catch((err) => console.warn('Workout action failed', err));
    };
    const unsubscribeWear = subscribeWearActions(handleAction);
    const unsubscribeNotification = subscribeLiveUpdateNotificationActions(handleAction);
    return () => {
      unsubscribeWear();
      unsubscribeNotification();
    };
  }, [user]);

  useEffect(() => {
    if (loading || checkingSplit || onboardingSeen === null) return;
    const inAuthGroup = segments[0] === '(auth)';
    const inSetSplit = segments[0] === 'set-split';

    if (!user && !inAuthGroup) {
      router.replace(onboardingSeen ? '/(auth)/sign-in' : '/(auth)/welcome');
    } else if (user && !hasSplit && !inSetSplit) {
      router.replace('/set-split');
    } else if (user && hasSplit && (inAuthGroup || inSetSplit)) {
      router.replace('/(tabs)');
    }
  }, [user, loading, checkingSplit, hasSplit, segments, onboardingSeen]);

  return (
    <>
      <Stack>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="set-split" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="planned-workouts" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="active-workout" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="up-next" options={{ headerShown: false }} />
        <Stack.Screen name="settings-split" options={{ headerShown: false }} />
        <Stack.Screen name="settings-injuries" options={{ headerShown: false }} />
        <Stack.Screen name="settings-account" options={{ headerShown: false }} />
        <Stack.Screen name="settings-app" options={{ headerShown: false }} />
        <Stack.Screen name="sync-status" options={{ headerShown: true }} />
        <Stack.Screen name="muscle-load" options={{ title: 'Muscle load' }} />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

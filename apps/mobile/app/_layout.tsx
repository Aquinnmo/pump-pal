import { profileRepository } from '@/data/profile-repository';
import { retryInitialSync, waitForInitialSync } from '@/data/sync-trigger';
import { AccountBootstrapDecision, decideAccountBootstrap, initialSyncOutcomeFromError, subscribeAccountDataChanged } from '@/data/initial-sync';
import { WorkoutPrefillLoader } from '@/ui/primitives/workout-prefill-loader';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { subscribeLiveUpdateNotificationActions } from '@/lib/live-update-notification-actions';
import { sweepLegacyInProgressWorkouts } from '@/lib/discard-workout';
import { handleWorkoutAction } from '@/lib/wear-action-task';
import { subscribeWearActions } from '@/lib/wear-sync';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-get-random-values';
import 'react-native-reanimated';

const ONBOARDING_KEY = 'pumppal_onboarding_seen';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const userId = user?.uid ?? null;
  const segments = useSegments();
  const [accountGate, setAccountGate] = useState<AccountBootstrapDecision>({ state: 'pending' });
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((val) => {
      setOnboardingSeen(val === 'true');
    });
  }, []);

  // Onboarding just wrote a split locally — re-decide, or the redirect below
  // bounces straight back to /set-split off the stale decision.
  useEffect(() => subscribeAccountDataChanged(() => setRetryAttempt((attempt) => attempt + 1)), []);

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      setAccountGate({ state: 'ready', source: 'remote' });
      return;
    }

    const uid = userId;
    let cancelled = false;
    setAccountGate({ state: 'pending' });

    const checkAccount = async () => {
      try {
        // Native can open a known account immediately from its UID-scoped
        // SQLite profile, even if the background pull is offline. Web's
        // repository performs this read against the API, so an error below is
        // a real hydration failure rather than an empty account.
        const cachedProfile = (await profileRepository.get(uid))?.data ?? null;
        const cachedDecision = decideAccountBootstrap(cachedProfile, null, { kind: 'auth-transition', uid });
        if (cachedDecision.state === 'ready') {
          if (!cancelled) setAccountGate(cachedDecision);
          return;
        }
        let outcome = await waitForInitialSync(uid);
        if (outcome.kind === 'auth-transition') outcome = await retryInitialSync(uid);
        if (cancelled || outcome.uid !== uid || outcome.kind === 'auth-transition') return;

        // After a successful native pull, read the local row again. On web,
        // this is the authoritative API read that just completed above.
        const hydratedProfile = outcome.kind === 'success'
          ? ((await profileRepository.get(uid))?.data ?? null)
          : null;
        if (cancelled) return;
        setAccountGate(decideAccountBootstrap(cachedProfile, hydratedProfile, outcome));
      } catch (error) {
        if (!cancelled) {
          setAccountGate(
            decideAccountBootstrap(null, null, initialSyncOutcomeFromError(uid, error))
          );
        }
      }
    };

    void checkAccount();
    return () => {
      cancelled = true;
    };
  }, [loading, retryAttempt, userId]);

  // Devices updated from a pre-rewrite build can still have an 'in_progress' row on
  // disk (see src/lib/discard-workout.ts) — nothing in the new code will ever finish or
  // discard it, so sweep it once per account per app start, right after the account
  // is confirmed open.
  const sweptUidRef = useRef<string | null>(null);
  useEffect(() => {
    if (accountGate.state !== 'ready' || !userId || sweptUidRef.current === userId) return;
    sweptUidRef.current = userId;
    sweepLegacyInProgressWorkouts(userId).catch((err) =>
      console.warn('Legacy in_progress sweep failed', err)
    );
  }, [accountGate.state, userId]);

  // Applies completeSet/uncompleteSet actions to the in-memory session, whether or
  // not the active-workout screen is mounted — both converge on the same store (see
  // src/lib/wear-action-task.ts), so there's no ownership flag to coordinate anymore.
  // finishWorkout is the one action handleWorkoutAction always no-ops on; that write
  // only happens through the active-workout screen's own Finish flow, which subscribes
  // to these same actions separately while it's mounted.
  useEffect(() => {
    if (!user) return;
    const handleAction = (action: Parameters<typeof handleWorkoutAction>[0]) => {
      if (action.action === 'startWorkout') {
        // The watch's cached name can be stale, so re-resolve the real target. This
        // also correctly resumes a workout that is already in progress.
        router.push('/up-next');
        return;
      }
      handleWorkoutAction(action).catch((err) => console.warn('Workout action failed', err));
    };
    const unsubscribeWear = subscribeWearActions(handleAction);
    const unsubscribeNotification = subscribeLiveUpdateNotificationActions(handleAction, 'root');
    return () => {
      unsubscribeWear();
      unsubscribeNotification();
    };
  }, [user]);

  useEffect(() => {
    if (loading || onboardingSeen === null || (user && accountGate.state === 'pending')) return;
    const inAuthGroup = segments[0] === '(auth)';
    const inSetSplit = segments[0] === 'set-split';
    const inSetUsername = segments[0] === 'set-username';

    if (!user && !inAuthGroup) {
      router.replace(onboardingSeen ? '/(auth)/sign-in' : '/(auth)/welcome');
    } else if (user && accountGate.state === 'onboarding' && accountGate.step === 'username' && !inSetUsername) {
      router.replace('/set-username');
    } else if (user && accountGate.state === 'onboarding' && accountGate.step === 'split' && !inSetSplit) {
      router.replace('/set-split');
    } else if (user && accountGate.state === 'ready' && (inAuthGroup || inSetSplit || inSetUsername)) {
      router.replace('/(tabs)');
    }
  }, [accountGate, user, loading, segments, onboardingSeen]);

  const gateUndecided = loading || onboardingSeen === null || (!!user && accountGate.state === 'pending');

  const retryAccountBootstrap = () => {
    if (!user) return;
    const uid = user.uid;
    setAccountGate({ state: 'pending' });
    void retryInitialSync(uid).then(() => setRetryAttempt((attempt) => attempt + 1));
  };

  return (
    <>
      <Stack>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="set-username" options={{ headerShown: false }} />
        <Stack.Screen name="set-split" options={{ headerShown: false }} />
        <Stack.Screen name="settings-username" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="planned-workouts" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="active-workout" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="up-next" options={{ headerShown: false }} />
        <Stack.Screen name="settings-split" options={{ headerShown: false }} />
        <Stack.Screen name="settings-injuries" options={{ headerShown: false }} />
        <Stack.Screen name="settings-account" options={{ headerShown: false }} />
        <Stack.Screen name="settings-app" options={{ headerShown: false }} />
        <Stack.Screen name="muscle-load" options={{ title: 'Muscle load' }} />
      </Stack>
      {gateUndecided && (
        // Overlay rather than replacing the Stack: expo-router needs it mounted
        // to run the redirect above. Opaque, so no route flashes underneath.
        <View style={styles.bootOverlay}>
          <WorkoutPrefillLoader label="Loading your account…" subtitle="Warming up" />
        </View>
      )}
      {user && accountGate.state === 'error' && (
        <View style={styles.errorOverlay} accessibilityViewIsModal>
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Could not load your account</Text>
            <Text selectable style={styles.errorMessage}>{accountGate.message}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Try loading your account again"
              activeOpacity={0.8}
              style={styles.retryButton}
              onPress={retryAccountBootstrap}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      <StatusBar style="light" />
    </>
  );
}

const styles = StyleSheet.create({
  bootOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0f0f0f',
  },
  errorOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: '#0f0f0f',
    justifyContent: 'center',
    padding: 20,
  },
  errorCard: {
    backgroundColor: '#1c1c1c',
    borderColor: '#2a2a2a',
    borderCurve: 'continuous',
    borderWidth: 1,
    borderRadius: 14,
    gap: 12,
    maxWidth: 420,
    padding: 16,
    width: '100%',
  },
  errorTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
  },
  errorMessage: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: '#e54242',
    borderCurve: 'continuous',
    borderRadius: 14,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

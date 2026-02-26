import { db } from '@/config/firebase';
import { isSplitOption } from '@/constants/split-options';
import { AuthProvider, useAuth } from '@/context/auth-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
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
        const snapshot = await getDoc(doc(db, 'users', user.uid));
        const splitType = snapshot.data()?.workoutSplit?.type;
        setHasSplit(isSplitOption(splitType));
      } catch {
        setHasSplit(false);
      } finally {
        setCheckingSplit(false);
      }
    };

    checkSplit();
  }, [user, loading, segments]);

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
      </Stack>
      <StatusBar style="light" />
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}

import { useAuth } from '@/context/auth-context';
import { resolveUpNextTarget } from '@/utils/up-next-target';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

// Landing screen for the home-screen widget's pumppal://up-next deep link, and for
// the watch's "start workout" button when the app is already running.
export default function UpNextScreen() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    // Logged out / no split yet: app/_layout.tsx redirect gating handles it.
    if (!user) return;

    let cancelled = false;
    (async () => {
      let params: { id?: string; suggestion?: string } = {};
      try {
        params = await resolveUpNextTarget(user.uid);
      } catch (err) {
        console.error(err);
      }
      if (cancelled) return;
      router.replace({ pathname: '/active-workout', params });
    })();

    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  return (
    <View style={styles.center}>
      <ActivityIndicator color="#e54242" size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f0f',
  },
});

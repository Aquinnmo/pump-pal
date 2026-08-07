import { HapticTab } from '@/components/haptic-tab';
import { TimberTabIcon } from '@/components/timber-tab-icon';
import { usePushToken } from '@/hooks/use-push-token';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

export default function TabLayout() {
  // Everything below this point is behind auth, so a token registered here is
  // always attributable to a signed-in uid.
  usePushToken();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#e54242',
        tabBarInactiveTintColor: '#555',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: '#111',
          borderTopColor: '#1e1e1e',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Logs',
          tabBarIcon: ({ color, size }) => <TimberTabIcon size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="workouts" options={{ href: null }} />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="pushup-challenge" options={{ href: null }} />
      <Tabs.Screen
        name="social"
        options={{
          title: 'Social',
          tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'About',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

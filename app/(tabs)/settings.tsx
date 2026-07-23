import { useAuth } from '@/context/auth-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function SettingsScreen() {
  const { user } = useAuth();

  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(true);
  const scrollYRef = useRef(0);
  const contentHeightRef = useRef(0);
  const containerHeightRef = useRef(0);

  const updateFades = () => {
    setShowTopFade(scrollYRef.current > 2);
    setShowBottomFade(scrollYRef.current + containerHeightRef.current < contentHeightRef.current - 2);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>About</Text>

      <View style={styles.scrollWrapper}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => {
          scrollYRef.current = e.nativeEvent.contentOffset.y;
          updateFades();
        }}
        onContentSizeChange={(_w, h) => {
          contentHeightRef.current = h;
          updateFades();
        }}
        onLayout={(e) => {
          containerHeightRef.current = e.nativeEvent.layout.height;
          updateFades();
        }}
      >

      <View style={styles.avatarContainer}>
        <Text style={styles.displayName}>{user?.displayName ?? 'Athlete'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.attributionCard}>
        <Text style={styles.attributionText}>
          This app is currently in development. Features may change and data may be used to improve the app.
        </Text>
      </View>

      <View style={{ height: 16 }} />

      <TouchableOpacity style={styles.navRow} onPress={() => router.push('/settings-split')} activeOpacity={0.8}>
        <Ionicons name="barbell-outline" size={20} color="#fff" style={styles.rowIcon} />
        <Text style={styles.navRowText}>Split</Text>
        <Ionicons name="chevron-forward" size={20} color="#888" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.navRow} onPress={() => router.push('/settings-injuries')} activeOpacity={0.8}>
        <Ionicons name="bandage-outline" size={20} color="#fff" style={styles.rowIcon} />
        <Text style={styles.navRowText}>Injuries</Text>
        <Ionicons name="chevron-forward" size={20} color="#888" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.navRow} onPress={() => router.push('/settings-account')} activeOpacity={0.8}>
        <Ionicons name="person-circle-outline" size={20} color="#fff" style={styles.rowIcon} />
        <Text style={styles.navRowText}>Account</Text>
        <Ionicons name="chevron-forward" size={20} color="#888" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.navRow} onPress={() => router.push('/settings-app')} activeOpacity={0.8}>
        <Ionicons name="cog-outline" size={20} color="#fff" style={styles.rowIcon} />
        <Text style={styles.navRowText}>App</Text>
        <Ionicons name="chevron-forward" size={20} color="#888" />
      </TouchableOpacity>

      <View style={styles.attributionCard}>
        <Text style={styles.attributionText}>
          Your workout history may be sent to 3rd parties to power AI features.
        </Text>
      </View>

      <View style={styles.attributionCard}>
        <Text style={styles.attributionText}>
          App developed by{' '}
          <Text
            style={styles.attributionLink}
            onPress={() => Linking.openURL('https://adam-montgomery.ca/foundry')}>
            Montgomery Software Foundry Inc.
          </Text>
        </Text>
      </View>

      </ScrollView>

      {showTopFade && (
        <LinearGradient
          colors={['#0f0f0f', 'transparent']}
          style={styles.topFade}
          pointerEvents="none"
        />
      )}

      {showBottomFade && (
        <LinearGradient
          colors={['transparent', '#0f0f0f']}
          style={styles.bottomFade}
          pointerEvents="none"
        />
      )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  scrollWrapper: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 32,
    zIndex: 10,
  },
  bottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 48,
    zIndex: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 32,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 36,
  },
  displayName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#888',
  },
  rowIcon: {
    marginRight: 12,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1c',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  navRowText: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
  attributionCard: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1c1c1c',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    alignItems: 'center',
  },
  attributionText: {
    fontSize: 12,
    color: '#555',
    textAlign: 'center',
  },
  attributionLink: {
    color: '#888',
    textDecorationLine: 'underline',
  },
});

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Entry point for the social features. TPC lives here as a row rather than a
// tab of its own; friends is next.
export default function SocialScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <Text style={styles.headerTitle}>Social</Text>
      </View>

      <View style={styles.content}>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.7}
          onPress={() => router.push('/(tabs)/pushup-challenge')}
        >
          <Ionicons name="flame" size={20} color="#e54242" />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>The Pushup Challenge</Text>
            <Text style={styles.cardSubtitle}>One more pushup every day. Miss a day, start over.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#555" />
        </TouchableOpacity>

        <View style={styles.card}>
          <Ionicons name="people" size={20} color="#555" />
          <View style={styles.cardText}>
            <Text style={[styles.cardTitle, styles.cardTitleMuted]}>Friends</Text>
            <Text style={styles.cardSubtitle}>Follow other lifters and compare streaks.</Text>
          </View>
          <Text style={styles.soon}>Coming soon</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    padding: 20,
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 16,
  },
  cardText: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cardTitleMuted: {
    color: '#555',
  },
  cardSubtitle: {
    color: '#888',
    fontSize: 14,
  },
  soon: {
    color: '#666',
    fontSize: 14,
  },
});

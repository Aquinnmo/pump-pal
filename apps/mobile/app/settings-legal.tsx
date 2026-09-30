import { ACCOUNT_DELETION_URL, AI_DATA_DISCLOSURE, HEALTH_DISCLAIMER, PRIVACY_POLICY_URL } from '@/constants/policies';
import { FadingScrollView } from '@/ui/primitives/fading-scroll-view';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SettingsLegalScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Legal</Text>
        <View style={{ width: 44 }} />
      </View>

      <FadingScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity
          style={styles.navRow}
          accessibilityRole="link"
          accessibilityLabel="Privacy Policy"
          onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
          activeOpacity={0.8}>
          <Ionicons name="document-text-outline" size={20} color="#fff" style={styles.rowIcon} />
          <Text style={styles.navRowText}>Privacy Policy</Text>
          <Ionicons name="chevron-forward" size={20} color="#888" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navRow}
          accessibilityRole="link"
          accessibilityLabel="Account Deletion Policy"
          onPress={() => Linking.openURL(ACCOUNT_DELETION_URL)}
          activeOpacity={0.8}>
          <Ionicons name="trash-outline" size={20} color="#fff" style={styles.rowIcon} />
          <Text style={styles.navRowText}>Account Deletion Policy</Text>
          <Ionicons name="chevron-forward" size={20} color="#888" />
        </TouchableOpacity>

        <View style={styles.notice}>
          <Text style={styles.noticeText}>{AI_DATA_DISCLOSURE}</Text>
        </View>
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{HEALTH_DISCLAIMER}</Text>
        </View>
      </FadingScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1e1e1e',
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  content: { padding: 20 },
  rowIcon: { marginRight: 12 },
  navRow: {
    flexDirection: 'row', alignItems: 'center', minHeight: 52,
    backgroundColor: '#1c1c1c', borderRadius: 10, borderCurve: 'continuous',
    borderWidth: 1, borderColor: '#2a2a2a', paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12,
  },
  navRowText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#fff' },
  notice: {
    marginTop: 16, padding: 16, backgroundColor: '#1c1c1c',
    borderRadius: 14, borderCurve: 'continuous', borderWidth: 1, borderColor: '#2a2a2a',
  },
  noticeText: { fontSize: 14, lineHeight: 21, color: '#888', textAlign: 'center' },
});

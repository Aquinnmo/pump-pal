import { getBlocks, unblockUser } from '@/data/remote/buddies';
import { FadingScrollView } from '@/ui/primitives/fading-scroll-view';
import { Ionicons } from '@expo/vector-icons';
import type { BlockedUserDTO } from '@timber/contract/api';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SettingsBlockedScreen() {
  const insets = useSafeAreaInsets();
  const [blocks, setBlocks] = useState<BlockedUserDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBlocks(await getBlocks());
      setError(null);
    } catch {
      setError('Could not load your blocked users. Tap to retry.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onUnblock(uid: string) {
    setBusyUid(uid);
    try {
      await unblockUser(uid);
      setBlocks((current) => current?.filter((b) => b.uid !== uid) ?? null);
    } catch {
      setError('Could not unblock that user. Tap to retry.');
    } finally {
      setBusyUid(null);
    }
  }

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
        <Text style={styles.headerTitle}>Blocked Users</Text>
        <View style={{ width: 44 }} />
      </View>

      <FadingScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}>
        {error ? (
          <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={load}>
            <Text style={styles.errorText}>{error}</Text>
          </TouchableOpacity>
        ) : null}

        {blocks === null && !error ? (
          <ActivityIndicator color="#e54242" style={styles.loader} />
        ) : blocks?.length === 0 ? (
          <View style={styles.card}>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>No blocked users</Text>
              <Text style={styles.cardSubtitle}>
                Block someone from their row on the Social tab. They will show up here.
              </Text>
            </View>
          </View>
        ) : (
          blocks?.map((b) => (
            <View key={b.uid} style={styles.card}>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{b.username || 'Unknown user'}</Text>
              </View>
              <TouchableOpacity
                style={styles.action}
                activeOpacity={0.8}
                disabled={busyUid === b.uid}
                onPress={() => onUnblock(b.uid)}
                accessibilityRole="button"
                accessibilityLabel={`Unblock ${b.username || 'user'}`}>
                {busyUid === b.uid ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.actionText}>Unblock</Text>
                )}
              </TouchableOpacity>
            </View>
          ))
        )}
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
  content: { padding: 20, gap: 12 },
  loader: { marginTop: 24 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1c1c1c', borderWidth: 1, borderColor: '#2a2a2a',
    borderRadius: 14, borderCurve: 'continuous', padding: 16,
  },
  cardText: { flex: 1, gap: 4 },
  cardTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cardSubtitle: { color: '#888', fontSize: 14 },
  errorText: { color: '#f87171', fontSize: 14 },
  action: {
    backgroundColor: '#e54242', borderRadius: 10, borderCurve: 'continuous',
    paddingVertical: 10, paddingHorizontal: 16, minWidth: 84, minHeight: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  actionText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});

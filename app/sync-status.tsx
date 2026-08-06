import { listUnresolvedConflicts } from '@/db/conflict-repository';
import { resolveStoredConflict } from '@/db/conflict-resolution';
import { useSyncStatus } from '@/db/use-sync-status';
import { useAuth } from '@/context/auth-context';
import { ConflictRecord } from '@/db/conflicts';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function describeConflict(conflict: ConflictRecord): string {
  const label = conflict.entityType === 'workout' ? 'workout' : conflict.entityType === 'injury' ? 'injury' : conflict.entityType === 'pushup_challenge' ? 'push-up challenge' : 'profile';
  if (conflict.serverData === null) return `The server ${label} was deleted. Your device still has a complete local copy.`;
  const local = conflict.localData as { name?: unknown };
  const server = conflict.serverData as { name?: unknown };
  const localName = typeof local.name === 'string' ? local.name : `this ${label}`;
  const serverName = typeof server.name === 'string' ? server.name : `the server ${label}`;
  return `This device has “${localName}” while the server has “${serverName}”. Choose the copy to keep.`;
}

export default function SyncStatusScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const status = useSyncStatus();
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return setConflicts([]);
    setConflicts(await listUnresolvedConflicts(user.uid));
  }, [user]);

  useEffect(() => { void load(); }, [load, status.conflictCount]);

  const resolve = (conflict: ConflictRecord, choice: 'keep-local' | 'use-server') => {
    const keepLocal = choice === 'keep-local';
    Alert.alert(
      keepLocal ? 'Keep this device’s copy?' : 'Use the server copy?',
      keepLocal
        ? `This keeps the local ${conflict.entityType === 'workout' ? 'workout' : 'copy'} and syncs it against the version you reviewed.`
        : `This replaces the local ${conflict.entityType === 'workout' ? 'workout' : 'copy'} with the server copy. The current local copy remains in this resolved conflict record.`,
      [
        { text: 'Keep Reviewing', style: 'cancel' },
        {
          text: keepLocal ? 'Keep This Device' : 'Use Server Copy',
          onPress: async () => {
            setBusyId(conflict.id);
            try {
              if (!user) return;
              await resolveStoredConflict(user.uid, conflict.id, choice);
              await load();
            } catch (error) {
              Alert.alert('Could not resolve conflict', error instanceof Error ? error.message : 'Please try again.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  const stateLabel = {
    idle: 'Up to date',
    syncing: 'Syncing',
    offline: 'Offline — changes stay on this device',
    error: 'Sync will retry',
    conflict: 'Sync needs attention',
  }[status.state];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sync</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.statusCard} accessibilityLabel={`Sync status: ${stateLabel}`}>
          <Text style={styles.eyebrow}>SYNC</Text>
          <Text style={styles.title} selectable>{stateLabel}</Text>
          {status.lastError ? <Text style={styles.detail} selectable>{status.lastError}</Text> : null}
          {status.lastSyncedAt ? <Text style={styles.detail} selectable>Last synced {new Date(status.lastSyncedAt).toLocaleString()}</Text> : null}
        </View>

        {conflicts.length === 0 ? (
          <Text style={styles.detail}>No conflicts need a choice.</Text>
        ) : conflicts.map((conflict) => (
          <View key={conflict.id} style={styles.conflictCard}>
            <Text style={styles.conflictTitle} selectable>Choose a copy to keep</Text>
            <Text style={styles.detail} selectable>{describeConflict(conflict)}</Text>
            {busyId === conflict.id ? <ActivityIndicator color="#e54242" /> : (
              <View style={styles.actions}>
                <Pressable style={styles.secondaryButton} onPress={() => resolve(conflict, 'use-server')} accessibilityLabel="Use Server Copy">
                  <Text style={styles.secondaryText}>Use Server Copy</Text>
                </Pressable>
                <Pressable style={styles.primaryButton} onPress={() => resolve(conflict, 'keep-local')} accessibilityLabel="Keep This Device">
                  <Text style={styles.primaryText}>Keep This Device</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  screen: { flex: 1, backgroundColor: '#0f0f0f' },
  content: { padding: 20, gap: 16, paddingBottom: 32 },
  statusCard: { backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', borderWidth: 1, borderRadius: 14, borderCurve: 'continuous', padding: 16, gap: 8 },
  conflictCard: { backgroundColor: '#1c1c1c', borderColor: '#2a2a2a', borderWidth: 1, borderRadius: 14, borderCurve: 'continuous', padding: 16, gap: 12 },
  eyebrow: { color: '#888', fontSize: 12, fontWeight: '700', letterSpacing: 1.4 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  conflictTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  detail: { color: '#888', fontSize: 14, lineHeight: 20, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 8 },
  primaryButton: { flex: 1, minHeight: 44, backgroundColor: '#e54242', borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  secondaryButton: { flex: 1, minHeight: 44, backgroundColor: '#151515', borderColor: '#2a2a2a', borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  secondaryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});

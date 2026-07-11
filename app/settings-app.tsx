import { Toast } from '@/components/ui/toast';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth-context';
import { Workout } from '@/types/workout';
import { toDateObj } from '@/utils/workout-conversion';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SettingsAppScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' }>({
    visible: false,
    message: '',
    type: 'success',
  });

  const handleCheckForUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      } else {
        setToast({ visible: true, message: 'App is up to date', type: 'success' });
      }
    } catch (err) {
      console.error(err);
      setToast({ visible: true, message: 'Could not check for updates', type: 'error' });
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleExportData = async () => {
    if (!user) return;
    setExporting(true);
    try {
      const [fileSystemModule, sharingModule] = await Promise.all([
        import('expo-file-system'),
        import('expo-sharing'),
      ]);

      const workoutsSnap = await getDocs(
        query(collection(db, 'workouts'), where('userId', '==', user.uid))
      );

      const rows: string[] = [
        ['Date', 'Workout', 'Notes', 'Exercise', 'Variation', 'Set', 'Reps', 'Weight (lbs)', 'Duration (sec)', 'Hold (sec)', 'Bodyweight'].join(','),
      ];

      workoutsSnap.docs.forEach((d) => {
        const w = d.data() as Workout;
        const dateMs = toDateObj(w.date).getTime();
        const dateStr = new Date(dateMs).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const name = `"${(w.name ?? '').replace(/"/g, '""')}"`;
        const notes = `"${(w.notes ?? '').replace(/"/g, '""')}"`;

        const performedExercises = w.performedExercises ?? [];
        if (performedExercises.length > 0) {
          performedExercises.forEach((pe) => {
            const exName = `"${(pe.exerciseNameSnapshot ?? '').replace(/"/g, '""')}"`;
            const variation = `"${(pe.variationNameSnapshot ?? '').replace(/"/g, '""')}"`;
            pe.sets.forEach((set) => {
              rows.push(
                [
                  dateStr,
                  name,
                  notes,
                  exName,
                  variation,
                  set.setNumber,
                  set.reps ?? '',
                  set.bodyweight ? '' : (set.weight ?? ''),
                  set.durationSeconds ?? '',
                  set.holdSeconds ?? '',
                  set.bodyweight ? 'Yes' : 'No',
                ].join(',')
              );
            });
          });
        } else {
          rows.push([dateStr, name, notes, '', '', '', '', '', '', '', ''].join(','));
        }
      });

      const csv = rows.join('\n');
      const fileName = `pump-pal-workouts-${new Date().toISOString().slice(0, 10)}.csv`;

      let fileUri = '';
      if ((fileSystemModule as any).File && (fileSystemModule as any).Paths?.cache) {
        const file = new (fileSystemModule as any).File((fileSystemModule as any).Paths.cache, fileName);
        if (file.exists) file.delete();
        file.write(csv);
        fileUri = file.uri;
      } else {
        const cacheDirectory = (fileSystemModule as any).cacheDirectory;
        if (!cacheDirectory || typeof (fileSystemModule as any).writeAsStringAsync !== 'function') {
          throw new Error('File system export APIs are unavailable in this app build.');
        }

        fileUri = `${cacheDirectory}${fileName}`;
        const encoding = (fileSystemModule as any).EncodingType?.UTF8 ?? 'utf8';
        await (fileSystemModule as any).writeAsStringAsync(fileUri, csv, { encoding });
      }

      const canShare = await (sharingModule as any).isAvailableAsync();
      if (canShare) {
        await (sharingModule as any).shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export Training Data',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        setToast({ visible: true, message: 'Sharing is not available on this device', type: 'error' });
      }
    } catch (err: any) {
      console.error(err);
      const errText = String(err?.message ?? err ?? '').toLowerCase();
      const missingNativeModule =
        errText.includes('native module') ||
        errText.includes('cannot find native module') ||
        errText.includes('cannot find module') ||
        errText.includes('unavailable in this app build');

      setToast({
        visible: true,
        message: missingNativeModule
          ? 'Export is unavailable on this app build. Update the app to use this feature.'
          : 'Could not export data',
        type: 'error',
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>App</Text>
        <View style={{ width: 24 }} />
      </View>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />

      <View style={styles.content}>
        <TouchableOpacity
          style={styles.feedbackButton}
          onPress={() => Linking.openURL('mailto:adammontcompany@gmail.com?subject=Timber Feedback')}
          activeOpacity={0.8}>
          <Ionicons name="megaphone" size={24} color="#fff" style={styles.rowIcon} />
          <Text style={styles.feedbackButtonText}>SEND FEEDBACK</Text>
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.updateButton, checkingUpdate && styles.updateButtonDisabled]}
          onPress={handleCheckForUpdate}
          disabled={checkingUpdate}
          activeOpacity={0.8}>
          {checkingUpdate ? (
            <ActivityIndicator size="small" color="#fff" style={styles.rowIcon} />
          ) : (
            <Ionicons name="cloud-download" size={20} color="#fff" style={styles.rowIcon} />
          )}
          <Text style={styles.updateButtonText}>
            {checkingUpdate ? 'Checking...' : 'Update App'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.updateButton, exporting && styles.updateButtonDisabled]}
          onPress={handleExportData}
          disabled={exporting}
          activeOpacity={0.8}>
          {exporting ? (
            <ActivityIndicator size="small" color="#fff" style={styles.rowIcon} />
          ) : (
            <Ionicons name="download" size={20} color="#fff" style={styles.rowIcon} />
          )}
          <Text style={styles.updateButtonText}>{exporting ? 'Exporting...' : 'Export Training Data'}</Text>
        </TouchableOpacity>
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
  },
  rowIcon: {
    marginRight: 12,
  },
  feedbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e54242',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 16,
    shadowColor: '#e54242',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  feedbackButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  updateButton: {
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
  updateButtonDisabled: {
    opacity: 0.6,
  },
  updateButtonText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
});

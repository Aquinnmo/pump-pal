import { Workout } from '@/components/workout-card';
import { useAuth } from '@/context/auth-context';
import { analyzeMuscles, MuscleInsights } from '@/utils/gemini-muscle-analysis';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  workouts: Workout[];
}

const MAX_DAILY_REFRESHES = 3;

interface InsightsCache {
  date: string; // 'YYYY-MM-DD'
  insights: MuscleInsights;
}

interface RefreshCache {
  date: string; // 'YYYY-MM-DD'
  count: number;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

export function MuscleInsightCards({ workouts }: Props) {
  const { user } = useAuth();
  const [insights, setInsights] = useState<MuscleInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshesLeft, setRefreshesLeft] = useState(MAX_DAILY_REFRESHES);
  const hasLoadedRef = useRef(false);

  const cacheKey = user ? `muscle_insights_${user.uid}` : null;
  const refreshCountKey = user ? `muscle_insights_refreshes_${user.uid}` : null;

  // Load today's remaining refreshes from cache
  useEffect(() => {
    if (!refreshCountKey) return;
    AsyncStorage.getItem(refreshCountKey).then((raw) => {
      if (!raw) return;
      const cached: RefreshCache = JSON.parse(raw);
      if (cached.date === todayKey()) {
        setRefreshesLeft(MAX_DAILY_REFRESHES - cached.count);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshCountKey]);

  const runAnalysis = async (force = false) => {
    if (workouts.length === 0 || !cacheKey) return;
    setLoading(true);
    setError(null);
    try {
      // Check cache first (unless forced refresh)
      if (!force) {
        const raw = await AsyncStorage.getItem(cacheKey);
        if (raw) {
          const cached: InsightsCache = JSON.parse(raw);
          if (cached.date === todayKey()) {
            setInsights(cached.insights);
            return;
          }
        }
      }

      // Not cached or manual refresh — call Gemini
      const result = await analyzeMuscles(workouts);
      setInsights(result);

      // Persist insights for today
      const payload: InsightsCache = { date: todayKey(), insights: result };
      await AsyncStorage.setItem(cacheKey, JSON.stringify(payload));
    } catch (e) {
      console.error('Gemini muscle analysis failed:', e);
      setError('Could not load AI insights. Tap to retry.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualRefresh = async () => {
    if (!refreshCountKey || refreshesLeft <= 0 || loading) return;

    // Read current count, increment, persist
    const raw = await AsyncStorage.getItem(refreshCountKey);
    let newCount = 1;
    if (raw) {
      const cached: RefreshCache = JSON.parse(raw);
      newCount = cached.date === todayKey() ? cached.count + 1 : 1;
    }
    await AsyncStorage.setItem(refreshCountKey, JSON.stringify({ date: todayKey(), count: newCount }));
    setRefreshesLeft(MAX_DAILY_REFRESHES - newCount);

    runAnalysis(true);
  };

  // Load once when workouts are available
  useEffect(() => {
    if (workouts.length > 0 && cacheKey && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      runAnalysis();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workouts.length, cacheKey]);

  if (workouts.length === 0) return null;

  return (
    <>
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={styles.headerTop}>
          <Text style={styles.sectionTitle}>AI Muscle Insights</Text>
          {insights && !loading && (
            <TouchableOpacity
              style={[styles.refreshButton, refreshesLeft <= 0 && styles.refreshButtonDisabled]}
              onPress={handleManualRefresh}
              disabled={refreshesLeft <= 0 || loading}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh" size={14} color={refreshesLeft <= 0 ? '#444' : '#e54242'} />
              <Text style={[styles.refreshButtonText, refreshesLeft <= 0 && styles.refreshButtonTextDisabled]}>
                {refreshesLeft > 0 ? `Refresh (${refreshesLeft} left)` : 'No refreshes left'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.sectionSubtitle}>Past 30 days · Powered by Gemini</Text>
      </View>

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color="#e54242" size="small" />
          <Text style={styles.loadingText}>Analyzing your workouts…</Text>
        </View>
      ) : error ? (
        <TouchableOpacity style={styles.errorCard} onPress={() => runAnalysis(true)} activeOpacity={0.7}>
          <Ionicons name="alert-circle-outline" size={20} color="#e54242" />
          <Text style={styles.errorText}>{error}</Text>
        </TouchableOpacity>
      ) : insights ? (
        <View style={styles.row}>
          {/* Over-trained card */}
          <View style={[styles.insightCard, styles.overCard]}>
            <View style={styles.cardHeader}>
              <Ionicons name="flame" size={18} color="#e54242" />
              <Text style={styles.cardTitle}>Over Trained</Text>
            </View>
            <Text style={styles.cardHint}>Muscles to train less</Text>
            {insights.overTrained.length === 0 ? (
              <Text style={styles.emptyText}>None detected</Text>
            ) : (
              insights.overTrained.map((muscle) => (
                <View key={muscle} style={styles.muscleRow}>
                  <View style={[styles.dot, styles.dotOver]} />
                  <Text style={styles.muscleName}>{muscle}</Text>
                </View>
              ))
            )}
          </View>

          {/* Under-trained card */}
          <View style={[styles.insightCard, styles.underCard]}>
            <View style={styles.cardHeader}>
              <Ionicons name="trending-up" size={18} color="#4ea8de" />
              <Text style={[styles.cardTitle, { color: '#4ea8de' }]}>Under Trained</Text>
            </View>
            <Text style={styles.cardHint}>Muscles to focus on</Text>
            {insights.underTrained.length === 0 ? (
              <Text style={styles.emptyText}>None detected</Text>
            ) : (
              insights.underTrained.map((muscle) => (
                <View key={muscle} style={styles.muscleRow}>
                  <View style={[styles.dot, styles.dotUnder]} />
                  <Text style={styles.muscleName}>{muscle}</Text>
                </View>
              ))
            )}
          </View>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    marginBottom: 10,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#555',
    marginTop: 2,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#3a1e1e',
    backgroundColor: '#1e1414',
  },
  refreshButtonDisabled: {
    borderColor: '#2a2a2a',
    backgroundColor: '#1a1a1a',
  },
  refreshButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#e54242',
  },
  refreshButtonTextDisabled: {
    color: '#444',
  },
  loadingCard: {
    backgroundColor: '#1c1c1c',
    borderRadius: 14,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 16,
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
  },
  errorCard: {
    backgroundColor: '#1c1c1c',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#3a2a2a',
    marginBottom: 16,
  },
  errorText: {
    color: '#e54242',
    fontSize: 14,
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  insightCard: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  overCard: {
    backgroundColor: '#1e1414',
    borderColor: '#3a1e1e',
  },
  underCard: {
    backgroundColor: '#121820',
    borderColor: '#1a2e40',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#e54242',
  },
  cardHint: {
    fontSize: 11,
    color: '#555',
    marginBottom: 12,
  },
  muscleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotOver: {
    backgroundColor: '#e54242',
  },
  dotUnder: {
    backgroundColor: '#4ea8de',
  },
  muscleName: {
    fontSize: 13,
    color: '#ddd',
    fontWeight: '500',
    flexShrink: 1,
  },
  emptyText: {
    color: '#555',
    fontSize: 13,
    fontStyle: 'italic',
  },
});

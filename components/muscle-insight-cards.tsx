import { Workout } from '@/components/workout-card';
import { analyzeMuscles, MuscleInsights } from '@/utils/gemini-muscle-analysis';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  workouts: Workout[];
}

export function MuscleInsightCards({ workouts }: Props) {
  const [insights, setInsights] = useState<MuscleInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track last workout count used for analysis to avoid unnecessary re-fetches
  const lastAnalyzedCountRef = useRef<number>(-1);

  const runAnalysis = async () => {
    if (workouts.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const result = await analyzeMuscles(workouts);
      setInsights(result);
      lastAnalyzedCountRef.current = workouts.length;
    } catch (e) {
      console.error('Gemini muscle analysis failed:', e);
      setError('Could not load AI insights. Tap to retry.');
    } finally {
      setLoading(false);
    }
  };

  // Run once when workouts first load, and when the count changes
  useEffect(() => {
    if (workouts.length > 0 && lastAnalyzedCountRef.current !== workouts.length) {
      runAnalysis();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workouts.length]);

  if (workouts.length === 0) return null;

  return (
    <>
      {/* Header row */}
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>AI Muscle Insights</Text>
        <Text style={styles.sectionSubtitle}>Past 30 days · Powered by Gemini</Text>
      </View>

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color="#e54242" size="small" />
          <Text style={styles.loadingText}>Analyzing your workouts…</Text>
        </View>
      ) : error ? (
        <TouchableOpacity style={styles.errorCard} onPress={runAnalysis} activeOpacity={0.7}>
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
            <Text style={styles.cardHint}>Muscles needing more rest</Text>
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

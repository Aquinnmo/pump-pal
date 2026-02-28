import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    LayoutChangeEvent,
    PanResponder,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

interface ChallengeDay {
  date: string;       // YYYY-MM-DD
  dayNumber: number;  // 1-indexed day in the challenge
  completedAt: string; // ISO timestamp
}

interface ChallengeData {
  startDate: string;
  days: ChallengeDay[];
  longestStreak: number;
}

const NODE_DOT = 30;
const RED = '#e54242';
const GREY = '#555';
const DARK_BG = '#111';
const CARD_BG = '#1a1a1a';
const SWIPE_TRACK_H = 56;
const SWIPE_THUMB = 48;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Build the list of nodes to render.
 * Returns every day from startDate up to today, annotated with completion info.
 */
function buildTimeline(data: ChallengeData | null): Array<{
  date: string;
  dayNumber: number;
  completed: boolean;
  completedAt: string | null;
  isToday: boolean;
}> {
  if (!data) return [];

  const completionMap = new Map<string, ChallengeDay>();
  for (const day of data.days) {
    completionMap.set(day.date, day);
  }

  const today = toDateKey(new Date());
  const nodes: Array<{
    date: string;
    dayNumber: number;
    completed: boolean;
    completedAt: string | null;
    isToday: boolean;
  }> = [];

  const cursor = new Date(data.startDate + 'T00:00:00');
  const todayDate = new Date(today + 'T00:00:00');
  let dayNum = 1;

  while (cursor <= todayDate) {
    const key = toDateKey(cursor);
    const entry = completionMap.get(key);
    nodes.push({
      date: key,
      dayNumber: dayNum,
      completed: !!entry,
      completedAt: entry?.completedAt ?? null,
      isToday: key === today,
    });
    dayNum++;
    cursor.setDate(cursor.getDate() + 1);
  }

  return nodes;
}

/**
 * Determine if the streak is still alive.
 * The streak is alive if every day before today has been completed.
 * (Today can be incomplete — it's the current day.)
 */
function isStreakAlive(nodes: ReturnType<typeof buildTimeline>): boolean {
  for (const n of nodes) {
    if (n.isToday) continue;
    if (!n.completed) return false;
  }
  return true;
}

/**
 * Compute current consecutive streak length (from day 1).
 */
function currentStreakLength(data: ChallengeData | null): number {
  if (!data) return 0;
  const sorted = [...data.days].sort((a, b) => a.date.localeCompare(b.date));
  let streak = 0;
  const cursor = new Date(data.startDate + 'T00:00:00');
  for (let i = 0; i < sorted.length; i++) {
    const key = toDateKey(cursor);
    if (sorted[i].date === key) {
      streak++;
      cursor.setDate(cursor.getDate() + 1);
    } else {
      break;
    }
  }
  return streak;
}

/* ─── Swipe-to-complete slider ─── */
function SwipeToComplete({
  label,
  onComplete,
  disabled,
}: {
  label: string;
  onComplete: () => void;
  disabled?: boolean;
}) {
  const trackWidth = SCREEN_WIDTH - 40; // 20px margin each side
  const maxX = trackWidth - SWIPE_THUMB - 8; // 4px padding each side
  const pan = useRef(new Animated.Value(0)).current;
  const triggered = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderMove: (_, gs) => {
        const x = Math.max(0, Math.min(gs.dx, maxX));
        pan.setValue(x);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx >= maxX * 0.85 && !triggered.current) {
          triggered.current = true;
          Animated.spring(pan, {
            toValue: maxX,
            useNativeDriver: false,
          }).start(() => onComplete());
        } else {
          Animated.spring(pan, {
            toValue: 0,
            useNativeDriver: false,
          }).start();
        }
      },
    }),
  ).current;

  // Interpolate label opacity — fades as thumb slides
  const labelOpacity = pan.interpolate({
    inputRange: [0, maxX * 0.5],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={[swipeStyles.track, { width: trackWidth }]}> 
      <Animated.Text style={[swipeStyles.label, { opacity: labelOpacity }]}>
        {label}
      </Animated.Text>
      <Animated.View
        style={[swipeStyles.thumb, { transform: [{ translateX: pan }] }]}
        {...panResponder.panHandlers}
      >
        <Ionicons name="chevron-forward" size={22} color="#fff" />
      </Animated.View>
    </View>
  );
}

/* ─── Completed state slider ─── */
function SwipeComplete({ label }: { label: string }) {
  const trackWidth = SCREEN_WIDTH - 40;
  const maxX = trackWidth - SWIPE_THUMB - 8;

  return (
    <View style={[swipeStyles.track, { width: trackWidth }]}>
      <Text style={swipeStyles.labelDone}>{label}</Text>
      <View style={[swipeStyles.thumbDone, { marginLeft: maxX }]}>
        <Ionicons name="checkmark" size={22} color="#fff" />
      </View>
    </View>
  );
}

export default function PushupChallengeScreen() {
  const { user } = useAuth();
  const [data, setData] = useState<ChallengeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const [scrollViewH, setScrollViewH] = useState(0);
  const [todayNodeY, setTodayNodeY] = useState<number | null>(null);
  const scrolledRef = useRef(false);
  const fillAnim = useRef(new Animated.Value(0)).current;
  const [animatingCompletion, setAnimatingCompletion] = useState(false);

  const onScrollLayout = (e: LayoutChangeEvent) => {
    setScrollViewH(e.nativeEvent.layout.height);
  };

  // Scroll to center today's node when both positions are known
  useEffect(() => {
    if (todayNodeY !== null && scrollViewH > 0 && !scrolledRef.current) {
      scrolledRef.current = true;
      const target = todayNodeY - scrollViewH / 2;
      scrollRef.current?.scrollTo({ y: Math.max(0, target), animated: false });
    }
  }, [todayNodeY, scrollViewH]);

  // Reset scroll flag when challenge data changes
  useEffect(() => {
    scrolledRef.current = false;
    setTodayNodeY(null);
  }, [data?.startDate]);

  const docRef = user ? doc(db, 'users', user.uid, 'pushup-challenge', 'data') : null;

  const load = useCallback(async () => {
    if (!docRef) return;
    setLoading(true);
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        setData(snap.data() as ChallengeData);
      } else {
        setData(null);
      }
    } catch (e) {
      console.error('Failed to load pushup challenge', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const startChallenge = async () => {
    if (!docRef) return;
    const today = toDateKey(new Date());
    const prev = data?.longestStreak ?? 0;
    const newData: ChallengeData = { startDate: today, days: [], longestStreak: prev };
    await setDoc(docRef, newData);
    setData(newData);
  };

  const completeTodayPushups = async () => {
    if (!docRef || !data) return;
    setSaving(true);
    try {
      const today = toDateKey(new Date());
      const alreadyDone = data.days.some((d) => d.date === today);
      if (alreadyDone) return;

      const dayNumber =
        Math.floor(
          (new Date(today + 'T00:00:00').getTime() - new Date(data.startDate + 'T00:00:00').getTime()) /
            (1000 * 60 * 60 * 24),
        ) + 1;

      const newDays = [
        ...data.days,
        { date: today, dayNumber, completedAt: new Date().toISOString() },
      ];
      const newStreak = currentStreakLength({ ...data, days: newDays });
      const updated: ChallengeData = {
        ...data,
        days: newDays,
        longestStreak: Math.max(data.longestStreak ?? 0, newStreak),
      };

      // Run fill animation and Firebase save concurrently
      fillAnim.setValue(0);
      setAnimatingCompletion(true);

      await Promise.all([
        new Promise<void>((resolve) => {
          Animated.timing(fillAnim, {
            toValue: 1,
            duration: 1400,
            useNativeDriver: false,
          }).start(() => resolve());
        }),
        setDoc(docRef, updated).catch((e) => console.error('Failed to save pushup completion', e)),
      ]);

      setData(updated);
      setAnimatingCompletion(false);

      // Scroll today into center with smooth animation
      if (todayNodeY !== null && scrollViewH > 0) {
        const target = todayNodeY - scrollViewH / 2;
        scrollRef.current?.scrollTo({ y: Math.max(0, target), animated: true });
      }
    } finally {
      setSaving(false);
    }
  };

  const resetChallenge = async () => {
    if (!docRef) return;
    const today = toDateKey(new Date());
    const prev = data?.longestStreak ?? 0;
    const newData: ChallengeData = { startDate: today, days: [], longestStreak: prev };
    await setDoc(docRef, newData);
    setData(newData);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={RED} size="large" />
      </View>
    );
  }

  // No challenge started yet
  if (!data) {
    return (
      <View style={styles.center}>
        <Ionicons name="flame-outline" size={64} color={RED} />
        <Text style={styles.emptyTitle}>The Pushup Challenge</Text>
        <Text style={styles.emptySubtitle}>
          Day 1 → 1 pushup{'\n'}Day 2 → 2 pushups{'\n'}Keep the streak alive!
        </Text>
        <TouchableOpacity style={styles.startBtn} onPress={startChallenge}>
          <Text style={styles.startBtnText}>Start Challenge</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const nodes = buildTimeline(data);
  const streakAlive = isStreakAlive(nodes);
  const todayNode = nodes.find((n) => n.isToday);
  const todayIndex = nodes.findIndex((n) => n.isToday);
  const todayCompleted = todayNode?.completed ?? false;
  const streakBroken = !streakAlive;
  const longest = data.longestStreak ?? 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>The Pushup Challenge</Text>
        <View style={styles.headerRight}>
          {longest > 0 && (
            <View style={styles.streakBadge}>
              <Ionicons name="flame" size={14} color={RED} />
              <Text style={styles.streakBadgeText}>{longest}</Text>
            </View>
          )}
          {streakBroken && (
            <TouchableOpacity onPress={resetChallenge}>
              <Text style={styles.resetText}>Restart</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {streakBroken ? (
        <View style={styles.streakBrokenBanner}>
          <Ionicons name="close-circle" size={20} color={RED} />
          <Text style={styles.streakBrokenText}>
            Streak broken — you missed a day. Restart to try again.
          </Text>
        </View>
      ) : null}

      {/* Timeline — today centred, past days above */}
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.timeline,
          { paddingTop: Math.max(scrollViewH / 2 - NODE_DOT / 2, 20) },
        ]}
        showsVerticalScrollIndicator={false}
        onLayout={onScrollLayout}
      >
        {nodes.map((node, i) => {
          const dotColor = node.completed ? RED : GREY;
          const nextCompleted = i < nodes.length - 1 && nodes[i + 1].completed;
          const hasConnector = i < nodes.length - 1;
          const connectorColor = node.completed && nextCompleted ? RED : GREY;

          // Animated colors during completion
          const isAnimConnector = animatingCompletion && hasConnector && i === todayIndex - 1;
          const isAnimDot = animatingCompletion && node.isToday;
          const animConnectorColor = isAnimConnector
            ? fillAnim.interpolate({ inputRange: [0, 0.65], outputRange: [GREY, RED], extrapolate: 'clamp' })
            : connectorColor;
          const animDotColor = isAnimDot
            ? fillAnim.interpolate({ inputRange: [0.65, 1], outputRange: [GREY, RED], extrapolate: 'clamp' })
            : dotColor;

          return (
            <View
              key={node.date}
              style={[styles.nodeRow, i > 0 && styles.nodeRowOverlap]}
              onLayout={node.isToday ? (e) => {
                setTodayNodeY(e.nativeEvent.layout.y + NODE_DOT / 2);
              } : undefined}
            >
              {/* Left track: dot at top, connector stretches to fill row height */}
              <View style={styles.nodeTrack}>
                <Animated.View style={[styles.dot, { backgroundColor: animDotColor }]} />
                {hasConnector && (
                  <Animated.View style={[styles.connector, { backgroundColor: animConnectorColor }]} />
                )}
              </View>

              {/* Info beside node */}
              <View style={styles.nodeInfo}>
                <Text style={styles.nodeDate}>
                  {formatDate(node.date)}
                </Text>
                <Text style={styles.nodeLabel}>
                  Day {node.dayNumber}
                </Text>
                {node.completedAt && (
                  <Text style={styles.nodeTimestamp}>{formatTime(node.completedAt)}</Text>
                )}
                {node.isToday && !node.completed && !streakBroken && (
                  <Text style={styles.nodePending}>Incomplete</Text>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Bottom slider area */}
      {!streakBroken && todayNode && (
        <View style={styles.swipeWrapper}>
          {todayCompleted ? (
            <SwipeComplete
              label="Today's pushups done!"
            />
          ) : saving ? (
            <ActivityIndicator color={RED} size="small" />
          ) : (
            <SwipeToComplete
              label={`I did ${todayNode.dayNumber} pushup${todayNode.dayNumber > 1 ? 's' : ''} today`}
              onComplete={completeTodayPushups}
              disabled={saving}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: DARK_BG,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  streakBadgeText: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '600',
  },
  resetText: {
    color: RED,
    fontSize: 14,
    fontWeight: '600',
  },

  // Empty state
  emptyTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 16,
  },
  emptySubtitle: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  startBtn: {
    marginTop: 24,
    backgroundColor: RED,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 10,
  },
  startBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Swipe area
  swipeWrapper: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 8,
    alignItems: 'center',
  },

  // Banners
  streakBrokenBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: CARD_BG,
    borderRadius: 10,
  },
  streakBrokenText: {
    color: '#ccc',
    fontSize: 13,
    flex: 1,
  },

  // Timeline
  scrollView: {
    flex: 1,
  },
  timeline: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  nodeRowOverlap: {
    marginTop: -(NODE_DOT / 2),
  },
  nodeTrack: {
    width: NODE_DOT,
    alignItems: 'center',
  },
  connector: {
    flex: 1,
    width: 8,
    borderRadius: 4,
    marginTop: -(NODE_DOT / 2),
  },
  dot: {
    width: NODE_DOT,
    height: NODE_DOT,
    borderRadius: NODE_DOT / 2,
    zIndex: 2,
  },
  nodeInfo: {
    flex: 1,
    gap: 4,
    paddingLeft: 20,
    paddingBottom: 72,
  },
  nodeDate: {
    color: '#fff',
    fontSize: 21,
    fontWeight: '700',
  },
  nodeLabel: {
    color: '#fff',
    fontSize: 21,
  },
  nodeTimestamp: {
    color: '#fff',
    fontSize: 21,
  },
  nodePending: {
    color: '#fff',
    fontSize: 21,
    fontStyle: 'italic',
  },
});

const swipeStyles = StyleSheet.create({
  track: {
    height: SWIPE_TRACK_H,
    borderRadius: SWIPE_TRACK_H / 2,
    backgroundColor: CARD_BG,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  label: {
    position: 'absolute',
    width: '100%',
    textAlign: 'center',
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  thumb: {
    width: SWIPE_THUMB,
    height: SWIPE_THUMB,
    borderRadius: SWIPE_THUMB / 2,
    backgroundColor: RED,
    justifyContent: 'center',
    alignItems: 'center',
  },
  labelDone: {
    position: 'absolute',
    width: '100%',
    textAlign: 'center',
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  thumbDone: {
    width: SWIPE_THUMB,
    height: SWIPE_THUMB,
    borderRadius: SWIPE_THUMB / 2,
    backgroundColor: RED,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

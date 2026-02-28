import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth-context';
import { getDailyName } from '@/utils/daily-name';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
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
  loading,
}: {
  label: string;
  onComplete: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const trackWidth = SCREEN_WIDTH - 40; // 20px margin each side
  const maxX = trackWidth - SWIPE_THUMB - 8; // 4px padding each side
  const pan = useRef(new Animated.Value(0)).current;
  const triggered = useRef(false);
  const disabledRef = useRef(disabled);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onMoveShouldSetPanResponder: () => !disabledRef.current,
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
      {loading ? (
        <ActivityIndicator
          color={RED}
          size="small"
          style={swipeStyles.labelSpinner}
        />
      ) : (
        <Animated.Text style={[swipeStyles.label, { opacity: labelOpacity }]}>
          {label}
        </Animated.Text>
      )}
      <Animated.View
        style={[swipeStyles.thumb, { transform: [{ translateX: pan }] }]}
        {...panResponder.panHandlers}
      >
        <Ionicons name="chevron-forward" size={22} color="#fff" />
      </Animated.View>
    </View>
  );
}

/* ─── Completed state slider with left-swipe undo ─── */
function SwipeComplete({ label, onUndo }: { label: string; onUndo: () => void }) {
  const trackWidth = SCREEN_WIDTH - 40;
  const maxX = trackWidth - SWIPE_THUMB - 8;
  const pan = useRef(new Animated.Value(maxX)).current;
  const triggered = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gs) => {
        // Only allow dragging left from the right end
        const x = Math.max(0, Math.min(maxX + gs.dx, maxX));
        pan.setValue(x);
      },
      onPanResponderRelease: (_, gs) => {
        const currentX = maxX + gs.dx;
        if (currentX <= maxX * 0.15 && !triggered.current) {
          triggered.current = true;
          Animated.spring(pan, {
            toValue: 0,
            useNativeDriver: false,
          }).start(() => onUndo());
        } else {
          triggered.current = false;
          Animated.spring(pan, {
            toValue: maxX,
            useNativeDriver: false,
          }).start();
        }
      },
    }),
  ).current;

  // Label fades out as thumb slides left
  const labelOpacity = pan.interpolate({
    inputRange: [maxX * 0.5, maxX],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={[swipeStyles.track, { width: trackWidth }]}>
      <Animated.Text style={[swipeStyles.labelDone, { opacity: labelOpacity }]}>{label}</Animated.Text>
      <Animated.View
        style={[swipeStyles.thumbDone, { transform: [{ translateX: pan }] }]}
        {...panResponder.panHandlers}
      >
        <Ionicons name="chevron-back" size={22} color="#fff" />
      </Animated.View>
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
  const [scrollTrigger, setScrollTrigger] = useState(0);
  const needsScrollRef = useRef(true);
  const fillAnim = useRef(new Animated.Value(0)).current;
  const burstAnim = useRef(new Animated.Value(0)).current;
  const [animatingCompletion, setAnimatingCompletion] = useState(false);
  const [connectorH, setConnectorH] = useState(0);
  const undoAnim = useRef(new Animated.Value(0)).current;
  const [undoingToday, setUndoingToday] = useState(false);
  const [dailyName, setDailyName] = useState<string | null>(null);

  // Ember particle animation values (connector fire)
  const emberData = useRef(
    [
      { offsetY: new Animated.Value(0), opacity: new Animated.Value(0), offsetX: -9, size: 3,   color: '#ffdd44', delay: 0,   dur: 520, yTarget: -22 },
      { offsetY: new Animated.Value(0), opacity: new Animated.Value(0), offsetX: 7,  size: 4,   color: '#ffaa00', delay: 110, dur: 620, yTarget: -30 },
      { offsetY: new Animated.Value(0), opacity: new Animated.Value(0), offsetX: -3, size: 3.5, color: '#ff6600', delay: 200, dur: 460, yTarget: -18 },
      { offsetY: new Animated.Value(0), opacity: new Animated.Value(0), offsetX: 11, size: 3,   color: '#ff4400', delay: 70,  dur: 560, yTarget: -26 },
      { offsetY: new Animated.Value(0), opacity: new Animated.Value(0), offsetX: -11,size: 4.5, color: '#ffcc00', delay: 160, dur: 500, yTarget: -24 },
      { offsetY: new Animated.Value(0), opacity: new Animated.Value(0), offsetX: 3,  size: 3,   color: '#ff8800', delay: 260, dur: 490, yTarget: -28 },
    ]
  ).current;

  // Flame burst particles that radiate from the dot when it ignites
  // Layer 1: core flash (hot white/yellow, fast, close)
  // Layer 2: inner flames (orange/red, medium distance)
  // Layer 3: outer embers (red/dark, far, slow fade)
  // Layer 4: trailing sparks (tiny, fast, long distance)
  const burstFlames = useRef(
    [
      // Core flash — bright, close, fast
      { angle: 0,    dist: 14, size: 12, color: '#ffffcc', delay: 0,  layer: 'core' },
      { angle: 60,   dist: 16, size: 11, color: '#ffeeaa', delay: 0,  layer: 'core' },
      { angle: 120,  dist: 14, size: 13, color: '#fff5bb', delay: 0,  layer: 'core' },
      { angle: 180,  dist: 15, size: 12, color: '#ffffdd', delay: 0,  layer: 'core' },
      { angle: 240,  dist: 14, size: 11, color: '#ffeecc', delay: 0,  layer: 'core' },
      { angle: 300,  dist: 16, size: 12, color: '#fff8bb', delay: 0,  layer: 'core' },
      // Inner flames — hot orange, medium
      { angle: 15,   dist: 36, size: 14, color: '#ff6600', delay: 20,  layer: 'inner' },
      { angle: 55,   dist: 32, size: 12, color: '#ff8800', delay: 35,  layer: 'inner' },
      { angle: 95,   dist: 38, size: 15, color: '#ff5500', delay: 10,  layer: 'inner' },
      { angle: 140,  dist: 34, size: 13, color: '#ffaa00', delay: 40,  layer: 'inner' },
      { angle: 185,  dist: 36, size: 14, color: '#ff7700', delay: 25,  layer: 'inner' },
      { angle: 230,  dist: 33, size: 12, color: '#ff9900', delay: 45,  layer: 'inner' },
      { angle: 275,  dist: 40, size: 16, color: '#ff4400', delay: 15,  layer: 'inner' },
      { angle: 320,  dist: 34, size: 13, color: '#ff6600', delay: 30,  layer: 'inner' },
      // Outer embers — darker, larger range
      { angle: 30,   dist: 52, size: 10, color: '#cc3300', delay: 50,  layer: 'outer' },
      { angle: 75,   dist: 56, size: 11, color: '#ff4400', delay: 60,  layer: 'outer' },
      { angle: 110,  dist: 48, size: 9,  color: '#dd3300', delay: 55,  layer: 'outer' },
      { angle: 155,  dist: 54, size: 10, color: '#ee4400', delay: 70,  layer: 'outer' },
      { angle: 200,  dist: 50, size: 11, color: '#cc2200', delay: 65,  layer: 'outer' },
      { angle: 250,  dist: 58, size: 10, color: '#ff3300', delay: 45,  layer: 'outer' },
      { angle: 290,  dist: 52, size: 12, color: '#dd4400', delay: 75,  layer: 'outer' },
      { angle: 340,  dist: 50, size: 9,  color: '#ee3300', delay: 55,  layer: 'outer' },
      // Trailing sparks — tiny, fast, long
      { angle: 10,   dist: 68, size: 4,  color: '#ffcc00', delay: 30,  layer: 'spark' },
      { angle: 50,   dist: 72, size: 3,  color: '#ffdd44', delay: 40,  layer: 'spark' },
      { angle: 100,  dist: 65, size: 4,  color: '#ffaa00', delay: 25,  layer: 'spark' },
      { angle: 145,  dist: 70, size: 3,  color: '#ffbb00', delay: 50,  layer: 'spark' },
      { angle: 190,  dist: 66, size: 4,  color: '#ffcc44', delay: 35,  layer: 'spark' },
      { angle: 235,  dist: 74, size: 3,  color: '#ffdd00', delay: 60,  layer: 'spark' },
      { angle: 285,  dist: 68, size: 4,  color: '#ffaa44', delay: 20,  layer: 'spark' },
      { angle: 330,  dist: 72, size: 3,  color: '#ffcc00', delay: 45,  layer: 'spark' },
    ]
  ).current;

  const onScrollLayout = (e: LayoutChangeEvent) => {
    setScrollViewH(e.nativeEvent.layout.height);
  };

  // When content size changes (or is first measured), scroll to bottom if needed
  const onContentSizeChange = useCallback((_w: number, h: number) => {
    if (needsScrollRef.current && h > 0) {
      needsScrollRef.current = false;
      scrollRef.current?.scrollToEnd({ animated: false });
    }
  }, []);

  // Re-arm the scroll-to-bottom flag whenever the screen is focused
  useEffect(() => {
    if (scrollTrigger > 0) {
      needsScrollRef.current = true;
    }
  }, [scrollTrigger]);

  // Ember particle animation loop
  useEffect(() => {
    if (!animatingCompletion) return;

    emberData.forEach((ember) => {
      const loop = () => {
        ember.offsetY.setValue(0);
        ember.opacity.setValue(0);
        Animated.sequence([
          Animated.delay(ember.delay),
          Animated.parallel([
            Animated.timing(ember.offsetY, {
              toValue: ember.yTarget,
              duration: ember.dur,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
            Animated.sequence([
              Animated.timing(ember.opacity, {
                toValue: 0.95,
                duration: 70,
                useNativeDriver: false,
              }),
              Animated.timing(ember.opacity, {
                toValue: 0,
                duration: ember.dur - 70,
                useNativeDriver: false,
              }),
            ]),
          ]),
        ]).start(({ finished }) => {
          if (finished) loop();
        });
      };
      loop();
    });

    return () => {
      emberData.forEach((e) => {
        e.offsetY.stopAnimation();
        e.opacity.stopAnimation();
      });
    };
  }, [animatingCompletion]);

  // Reset when challenge restarts (new startDate)
  useEffect(() => {
    setTodayNodeY(null);
  }, [data?.startDate]);

  const docRef = user ? doc(db, 'users', user.uid, 'pushup-challenge', 'data') : null;

  const load = useCallback(async () => {
    if (!docRef) return;
    setLoading(true);
    try {
      const [snap, name] = await Promise.all([getDoc(docRef), getDailyName()]);
      if (snap.exists()) {
        setData(snap.data() as ChallengeData);
      } else {
        setData(null);
      }
      setDailyName(name);
    } catch (e) {
      console.error('Failed to load pushup challenge', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      setScrollTrigger((v) => v + 1);
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

      // Scroll today's node to center before the animation fires so
      // the user sees it in position before the fire starts.
      if (todayNodeY !== null && scrollViewH > 0) {
        const target = todayNodeY - scrollViewH / 2;
        scrollRef.current?.scrollTo({ y: Math.max(0, target), animated: true });
      }

      // Run fill animation and Firebase save concurrently
      fillAnim.setValue(0);
      setAnimatingCompletion(true);

      // With Easing.out(Easing.cubic) over 2000ms, fillAnim reaches 0.55
      // (connector fully burned, dot ignites) at t where 1-(1-t)^3 = 0.55 → t ≈ 0.234 → ~468ms
      const BURST_DELAY_MS = 468;
      burstAnim.setValue(0);

      await Promise.all([
        new Promise<void>((resolve) => {
          Animated.timing(fillAnim, {
            toValue: 1,
            duration: 2000,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }).start(() => resolve());
        }),
        new Promise<void>((resolve) => {
          Animated.sequence([
            Animated.delay(BURST_DELAY_MS),
            Animated.timing(burstAnim, {
              toValue: 1,
              duration: 900,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
          ]).start(() => resolve());
        }),
        setDoc(docRef, updated).catch((e) => console.error('Failed to save pushup completion', e)),
      ]);

      setData(updated);
      setAnimatingCompletion(false);
    } finally {
      setSaving(false);
    }
  };

  const undoTodayPushups = async () => {
    if (!docRef || !data) return;
    setSaving(true);
    try {
      const today = toDateKey(new Date());
      const newDays = data.days.filter((d) => d.date !== today);
      const updated: ChallengeData = {
        ...data,
        days: newDays,
      };

      // Save first, then update the swipe bar/state so the UI reflects the undone state.
      await setDoc(docRef, updated).catch((e) => console.error('Failed to undo pushup completion', e));
      setData(updated);

      // Wait a frame so the swipe bar update is applied in the UI, then run the fade animation.
      await new Promise((res) => requestAnimationFrame(res));

      undoAnim.setValue(0);
      setUndoingToday(true);
      await new Promise<void>((resolve) => {
        Animated.timing(undoAnim, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }).start(() => resolve());
      });
    } catch (e) {
      console.error('Failed to undo pushup completion', e);
    } finally {
      setUndoingToday(false);
      undoAnim.setValue(0);
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
      <View style={styles.timelineWrapper}>
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.timeline,
            {
              paddingTop: Math.max(scrollViewH / 2 - NODE_DOT / 2, 20),
              // nodeInfo paddingBottom (72) + half the dot height (NODE_DOT/2=15) are
              // already below the last dot's center. Subtract so the bottom of
              // scroll content lands the present day's dot at vertical center.
              paddingBottom: Math.max(scrollViewH / 2 - NODE_DOT / 2 - 72 - NODE_DOT / 2, 0),
            },
          ]}
          showsVerticalScrollIndicator={false}
          onLayout={onScrollLayout}
          onContentSizeChange={onContentSizeChange}
        >
        {nodes.map((node, i) => {
          const dotColor = node.completed ? RED : GREY;
          const nextCompleted = i < nodes.length - 1 && nodes[i + 1].completed;
          const hasConnector = i < nodes.length - 1;
          const connectorColor = node.completed && nextCompleted ? RED : GREY;

          // Animated fire during completion
          const isAnimConnector = animatingCompletion && hasConnector && i === todayIndex - 1;
          const isAnimDot = animatingCompletion && node.isToday;
          const isUndoDot = undoingToday && node.isToday;
          const isUndoConnector = undoingToday && hasConnector && i === todayIndex - 1;

          // Dot fire color: invisible during connector burn, snap to red when burst starts
          const animDotColor = isAnimDot
            ? fillAnim.interpolate({
                inputRange: [0, 0.54, 0.55, 1],
                outputRange: ['transparent', 'transparent', RED, RED],
                extrapolate: 'clamp',
              })
            : isUndoDot
            ? undoAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [RED, GREY],
                extrapolate: 'clamp',
              })
            : dotColor;

          // Burn-front Y position on the connector (0 → connectorH)
          const burnFrontY = fillAnim.interpolate({
            inputRange: [0, 0.55],
            outputRange: [0, Math.max(connectorH, 1)],
            extrapolate: 'clamp',
          });

          return (
            <View
              key={node.date}
              style={[styles.nodeRow, i > 0 && styles.nodeRowOverlap]}
              onLayout={node.isToday ? (e) => {
                setTodayNodeY(e.nativeEvent.layout.y + NODE_DOT / 2);
              } : undefined}
            >
              {/* Left track: dot at top, connector stretches to fill row height */}
              <View style={[styles.nodeTrack, { overflow: 'visible' }]}>
                {/* ── Epic flame burst (behind dot) ── */}
                {isAnimDot && burstFlames.map((flame, fi) => {
                  const rad = (flame.angle * Math.PI) / 180;
                  const dx = Math.cos(rad) * flame.dist;
                  const dy = Math.sin(rad) * flame.dist;
                  const d = flame.delay / 900;

                  // Layer-specific timing
                  const isCore = flame.layer === 'core';
                  const isSpark = flame.layer === 'spark';
                  const isOuter = flame.layer === 'outer';

                  const peakOpacity = isCore ? 1 : isSpark ? 0.85 : 0.95;
                  const fadeEnd = isCore ? 0.35 : isSpark ? 0.95 : isOuter ? 0.85 : 0.7;
                  const scaleMax = isCore ? 2.0 : isSpark ? 1.0 : isOuter ? 1.5 : 1.8;
                  const heightMult = isCore ? 1.2 : isSpark ? 2.5 : isOuter ? 1.8 : 1.6;

                  return (
                    <Animated.View
                      key={fi}
                      style={{
                        position: 'absolute',
                        width: flame.size,
                        height: flame.size * heightMult,
                        borderRadius: flame.size / 2,
                        backgroundColor: flame.color,
                        left: NODE_DOT / 2 - flame.size / 2,
                        top: NODE_DOT / 2 - (flame.size * heightMult) / 2,
                        zIndex: isCore ? 5 : isSpark ? 2 : 3,
                        opacity: burstAnim.interpolate({
                          inputRange: [
                            Math.max(d - 0.01, 0),
                            Math.min(d + 0.06, 0.15),
                            Math.min(d + fadeEnd, 1),
                            1,
                          ],
                          outputRange: [0, peakOpacity, 0, 0],
                          extrapolate: 'clamp',
                        }),
                        transform: [
                          {
                            translateX: burstAnim.interpolate({
                              inputRange: [d, Math.min(d + 0.5, 1), 1],
                              outputRange: [0, dx * 0.85, dx],
                              extrapolate: 'clamp',
                            }),
                          },
                          {
                            translateY: burstAnim.interpolate({
                              inputRange: [d, Math.min(d + 0.5, 1), 1],
                              outputRange: [0, dy * 0.85, dy],
                              extrapolate: 'clamp',
                            }),
                          },
                          {
                            scale: burstAnim.interpolate({
                              inputRange: [
                                d,
                                Math.min(d + 0.12, 0.25),
                                Math.min(d + 0.4, 0.65),
                                1,
                              ],
                              outputRange: [0.1, scaleMax, scaleMax * 0.6, 0],
                              extrapolate: 'clamp',
                            }),
                          },
                          { rotate: `${flame.angle + 90}deg` },
                        ],
                      }}
                    />
                  );
                })}

                {/* ── Hot core flash ── */}
                {isAnimDot && (
                  <Animated.View
                    style={{
                      position: 'absolute',
                      width: NODE_DOT + 12,
                      height: NODE_DOT + 12,
                      borderRadius: (NODE_DOT + 12) / 2,
                      top: -6,
                      left: -6,
                      backgroundColor: '#fff8dd',
                      zIndex: 6,
                      opacity: burstAnim.interpolate({
                        inputRange: [0, 0.05, 0.18, 0.45],
                        outputRange: [0, 0.95, 0.4, 0],
                        extrapolate: 'clamp',
                      }),
                      transform: [{
                        scale: burstAnim.interpolate({
                          inputRange: [0, 0.08, 0.3],
                          outputRange: [0.2, 1.8, 0.6],
                          extrapolate: 'clamp',
                        }),
                      }],
                    }}
                  />
                )}

                {/* ── Mid-range heat glow ── */}
                {isAnimDot && (
                  <Animated.View
                    style={{
                      position: 'absolute',
                      width: NODE_DOT + 50,
                      height: NODE_DOT + 50,
                      borderRadius: (NODE_DOT + 50) / 2,
                      top: -25,
                      left: -25,
                      backgroundColor: 'rgba(255, 100, 0, 0.35)',
                      zIndex: 1,
                      opacity: burstAnim.interpolate({
                        inputRange: [0, 0.08, 0.35, 0.7],
                        outputRange: [0, 0.85, 0.35, 0],
                        extrapolate: 'clamp',
                      }),
                      transform: [{
                        scale: burstAnim.interpolate({
                          inputRange: [0, 0.15, 0.6, 1],
                          outputRange: [0.2, 1.8, 1.3, 0.8],
                          extrapolate: 'clamp',
                        }),
                      }],
                    }}
                  />
                )}

                {/* ── Outer shockwave ring ── */}
                {isAnimDot && (
                  <Animated.View
                    style={{
                      position: 'absolute',
                      width: NODE_DOT + 70,
                      height: NODE_DOT + 70,
                      borderRadius: (NODE_DOT + 70) / 2,
                      top: -35,
                      left: -35,
                      backgroundColor: 'transparent',
                      borderWidth: 2,
                      borderColor: '#ff660055',
                      zIndex: 0,
                      opacity: burstAnim.interpolate({
                        inputRange: [0.02, 0.12, 0.5, 0.8],
                        outputRange: [0, 0.7, 0.2, 0],
                        extrapolate: 'clamp',
                      }),
                      transform: [{
                        scale: burstAnim.interpolate({
                          inputRange: [0.02, 0.35, 0.8],
                          outputRange: [0.3, 1.8, 2.2],
                          extrapolate: 'clamp',
                        }),
                      }],
                    }}
                  />
                )}

                {/* ── Dot ── */}
                <Animated.View style={[styles.dot, { backgroundColor: animDotColor }]} />

                {/* ── Connector ── */}
                {hasConnector && (
                  isAnimConnector ? (
                    <View
                      style={[styles.connector, { backgroundColor: GREY, overflow: 'visible' }]}
                      onLayout={(e) => setConnectorH(e.nativeEvent.layout.height)}
                    >
                      {/* Fire fill that grows top→bottom */}
                      {connectorH > 0 && (
                        <Animated.View
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: burnFrontY,
                            overflow: 'hidden',
                          }}
                        >
                          {/* Solid burned (red) area */}
                          <View style={{ flex: 1, backgroundColor: RED }} />
                          {/* Fire gradient at burning edge */}
                          <LinearGradient
                            colors={[RED, '#ff3300', '#ff6600', '#ffaa00', '#ffdd44'] as any}
                            locations={[0, 0.25, 0.5, 0.8, 1]}
                            start={{ x: 0.5, y: 0 }}
                            end={{ x: 0.5, y: 1 }}
                            style={{ height: 32 }}
                          />
                        </Animated.View>
                      )}

                      {/* Burning-front glow */}
                      {connectorH > 0 && (
                        <Animated.View
                          style={{
                            position: 'absolute',
                            left: -14,
                            right: -14,
                            height: 28,
                            top: -14,
                            borderRadius: 14,
                            backgroundColor: 'rgba(255, 136, 0, 0.35)',
                            transform: [{ translateY: burnFrontY }],
                            opacity: fillAnim.interpolate({
                              inputRange: [0, 0.04, 0.48, 0.55],
                              outputRange: [0, 0.85, 0.85, 0],
                              extrapolate: 'clamp',
                            }),
                          }}
                        />
                      )}

                      {/* Ember particles */}
                      {connectorH > 0 && emberData.map((ember, idx) => (
                        <Animated.View
                          key={idx}
                          style={{
                            position: 'absolute',
                            width: ember.size,
                            height: ember.size,
                            borderRadius: ember.size / 2,
                            backgroundColor: ember.color,
                            left: 4 - ember.size / 2 + ember.offsetX,
                            top: -ember.size / 2,
                            opacity: Animated.multiply(
                              ember.opacity,
                              fillAnim.interpolate({
                                inputRange: [0, 0.04, 0.48, 0.55],
                                outputRange: [0, 1, 1, 0],
                                extrapolate: 'clamp',
                              }),
                            ),
                            transform: [{
                              translateY: Animated.add(burnFrontY, ember.offsetY),
                            }],
                          }}
                        />
                      ))}
                    </View>
                  ) : isUndoConnector ? (
                    <Animated.View
                      style={[styles.connector, {
                        backgroundColor: undoAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [RED, GREY],
                          extrapolate: 'clamp',
                        }),
                      }]}
                    />
                  ) : (
                    <Animated.View style={[styles.connector, { backgroundColor: connectorColor }]} />
                  )
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

        {/* Top fade */}
        <LinearGradient
          colors={[DARK_BG, 'transparent'] as any}
          style={styles.fadeTop}
          pointerEvents="none"
        />
        {/* Bottom fade */}
        <LinearGradient
          colors={['transparent', DARK_BG] as any}
          style={styles.fadeBottom}
          pointerEvents="none"
        />
      </View>

      {/* Bottom slider area */}
      {!streakBroken && todayNode && (
        <View style={styles.swipeWrapper}>
          {todayCompleted ? (
            <SwipeComplete
              label={`Swipe left if you lied${dailyName ? ` (${dailyName}...)` : '...'}`}
              onUndo={undoTodayPushups}
            />
          ) : (
            <SwipeToComplete
              label={`I did ${todayNode.dayNumber} pushup${todayNode.dayNumber > 1 ? 's' : ''} today`}
              onComplete={completeTodayPushups}
              disabled={saving}
              loading={saving}
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
  timelineWrapper: {
    flex: 1,
    position: 'relative',
  },
  scrollView: {
    flex: 1,
  },
  fadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    pointerEvents: 'none',
  },
  fadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    pointerEvents: 'none',
  },
  timeline: {
    paddingHorizontal: 24,
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
  labelSpinner: {
    position: 'absolute',
    width: '100%',
    alignSelf: 'center',
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

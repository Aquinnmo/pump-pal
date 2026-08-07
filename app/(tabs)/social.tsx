import { FadingScrollView } from '@/components/ui/fading-scroll-view';
import {
  acceptBuddyRequest,
  chopBuddy,
  getBuddies,
  searchUsers,
  sendBuddyRequest,
} from '@/repositories/remote/buddies';
import type { BuddyDTO, BuddyRequestDTO, BuddySearchResult } from '@/shared/api-contract';
import { toDateKey } from '@/utils/date-key';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Social: find people, buddy up, and chop the ones who haven't trained today.
 *
 * Nothing here reads Firestore directly — `firestore.rules` denies every
 * cross-user read, so the whole screen is backed by `/api/buddies` (see
 * repositories/remote/buddies.ts).
 */

const CHOP_COOLDOWN_MS = 5 * 60 * 1000;
const SEARCH_DEBOUNCE_MS = 300;

function cooldownRemaining(lastChoppedAt: string | null, now: number): number {
  if (!lastChoppedAt) return 0;
  return Math.max(0, CHOP_COOLDOWN_MS - (now - Date.parse(lastChoppedAt)));
}

function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function SocialScreen() {
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BuddySearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [buddies, setBuddies] = useState<BuddyDTO[]>([]);
  const [requests, setRequests] = useState<BuddyRequestDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const today = toDateKey(new Date());
  const trimmed = query.trim();
  const isSearching = trimmed.length > 0;

  const load = useCallback(async () => {
    try {
      const data = await getBuddies(toDateKey(new Date()));
      setBuddies(data.buddies);
      setRequests(data.requests);
      setError(null);
    } catch {
      setError('Could not load your buddies. Tap to retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Only tick while something is actually counting down.
  const anyCooldown = buddies.some((b) => cooldownRemaining(b.lastChoppedAt, now) > 0);
  useEffect(() => {
    if (!anyCooldown) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyCooldown]);

  const searchSeq = useRef(0);
  useEffect(() => {
    if (!trimmed) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      try {
        const found = await searchUsers(trimmed);
        // Ignore a slow response that lost the race to a newer keystroke.
        if (seq === searchSeq.current) setResults(found);
      } catch {
        if (seq === searchSeq.current) setResults([]);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);

  async function onBuddyUp(uid: string) {
    setBusyUid(uid);
    try {
      await sendBuddyRequest(uid);
      setResults((rs) => rs.map((r) => (r.uid === uid ? { ...r, state: 'outgoing' } : r)));
    } catch {
      setError('Could not send that request. Tap to retry.');
    } finally {
      setBusyUid(null);
    }
  }

  async function onAccept(uid: string) {
    setBusyUid(uid);
    try {
      await acceptBuddyRequest(uid);
      setResults((rs) => rs.map((r) => (r.uid === uid ? { ...r, state: 'buddies' } : r)));
      await load();
    } catch {
      setError('Could not accept that request. Tap to retry.');
    } finally {
      setBusyUid(null);
    }
  }

  async function onChop(uid: string) {
    setBusyUid(uid);
    // Optimistic: the button flips to cooling-down immediately, and the
    // reconcile below corrects it if the server disagreed.
    const stamp = new Date().toISOString();
    setBuddies((bs) => bs.map((b) => (b.uid === uid ? { ...b, lastChoppedAt: stamp } : b)));
    setNow(Date.now());
    try {
      await chopBuddy(uid, today);
    } catch (e) {
      const code = (e as { code?: string }).code;
      // 'already_worked_out' means they trained since this list loaded — the
      // happy path, not a failure. Reload so the row says so.
      if (code !== 'already_worked_out' && code !== 'chop_cooldown') {
        setError('Could not land that chop. Tap to retry.');
      }
      await load();
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.fixedHeader, { paddingTop: Math.max(insets.top + 18, 36) }]}>
        <View style={styles.headerContent}>
          <Text style={styles.pageTitle}>Social</Text>
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by username"
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search for people by username"
          />
        </View>
      </View>

      <FadingScrollView contentContainerStyle={styles.content}>
        {error && (
          <TouchableOpacity style={styles.errorRow} activeOpacity={0.7} onPress={load}>
            <Text style={styles.errorText}>{error}</Text>
          </TouchableOpacity>
        )}

        {isSearching ? (
          <SearchResults
            results={results}
            searching={searching}
            busyUid={busyUid}
            onBuddyUp={onBuddyUp}
            onAccept={onAccept}
          />
        ) : (
          <>
            {requests
              .filter((r) => r.direction === 'incoming')
              .map((r) => (
                <View key={r.uid} style={styles.card}>
                  <Ionicons name="person-add" size={20} color="#e54242" />
                  <View style={styles.cardText}>
                    <Text style={styles.cardTitle}>{r.username}</Text>
                    <Text style={styles.cardSubtitle}>Wants to be your buddy.</Text>
                  </View>
                  <ActionButton
                    label="Accept"
                    busy={busyUid === r.uid}
                    onPress={() => onAccept(r.uid)}
                  />
                </View>
              ))}

            {loading ? (
              <ActivityIndicator color="#e54242" style={styles.loader} />
            ) : buddies.length === 0 ? (
              <View style={styles.card}>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>No buddies yet</Text>
                  <Text style={styles.cardSubtitle}>
                    Search a username above to buddy up. You will see their streaks here, and you
                    can chop them on a day they have not trained.
                  </Text>
                </View>
              </View>
            ) : (
              buddies.map((b) => (
                <BuddyRow
                  key={b.uid}
                  buddy={b}
                  now={now}
                  busy={busyUid === b.uid}
                  onChop={() => onChop(b.uid)}
                />
              ))
            )}

            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => router.push('/(tabs)/pushup-challenge')}
            >
              <Ionicons name="flame" size={20} color="#e54242" />
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>The Pushup Challenge</Text>
                <Text style={styles.cardSubtitle}>
                  One more pushup every day. Miss a day, start over.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#666" />
            </TouchableOpacity>
          </>
        )}
      </FadingScrollView>
    </View>
  );
}

function SearchResults({
  results,
  searching,
  busyUid,
  onBuddyUp,
  onAccept,
}: {
  results: BuddySearchResult[];
  searching: boolean;
  busyUid: string | null;
  onBuddyUp: (uid: string) => void;
  onAccept: (uid: string) => void;
}) {
  if (searching && results.length === 0) {
    return <ActivityIndicator color="#e54242" style={styles.loader} />;
  }
  if (results.length === 0) {
    return (
      <View style={styles.card}>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>No one by that name</Text>
          <Text style={styles.cardSubtitle}>Usernames are exact — check the spelling.</Text>
        </View>
      </View>
    );
  }

  return (
    <>
      {results.map((r) => (
        <View key={r.uid} style={styles.card}>
          <Ionicons name="person" size={20} color="#666" />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{r.username}</Text>
          </View>
          {r.state === 'none' && (
            <ActionButton
              label="Buddy up"
              busy={busyUid === r.uid}
              onPress={() => onBuddyUp(r.uid)}
            />
          )}
          {r.state === 'incoming' && (
            <ActionButton label="Accept" busy={busyUid === r.uid} onPress={() => onAccept(r.uid)} />
          )}
          {r.state === 'outgoing' && <Text style={styles.stateLabel}>Requested</Text>}
          {r.state === 'buddies' && <Text style={styles.stateLabel}>Buddies</Text>}
        </View>
      ))}
    </>
  );
}

function BuddyRow({
  buddy,
  now,
  busy,
  onChop,
}: {
  buddy: BuddyDTO;
  now: number;
  busy: boolean;
  onChop: () => void;
}) {
  const remaining = cooldownRemaining(buddy.lastChoppedAt, now);

  return (
    <View style={styles.card}>
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{buddy.username}</Text>
        <Text style={styles.cardSubtitle}>
          {buddy.currentStreak > 0
            ? `${buddy.currentStreak} day streak · best ${buddy.longestStreak}`
            : `No streak running · best ${buddy.longestStreak}`}
        </Text>
      </View>

      {buddy.workedOutToday ? (
        // The positive terminal state, not a blocked action: they did the thing.
        <View style={styles.doneBadge}>
          <Ionicons name="checkmark" size={14} color="#4ade80" />
          <Text style={styles.doneText}>Trained</Text>
        </View>
      ) : remaining > 0 ? (
        <Text style={styles.stateLabel}>{formatCountdown(remaining)}</Text>
      ) : (
        <ActionButton label="Chop" busy={busy} onPress={onChop} />
      )}
    </View>
  );
}

function ActionButton({
  label,
  busy,
  onPress,
}: {
  label: string;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.action}
      activeOpacity={0.8}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {busy ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <Text style={styles.actionText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  fixedHeader: {
    width: '100%',
    backgroundColor: '#0f0f0f',
    paddingBottom: 8,
  },
  headerContent: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 14,
  },
  pageTitle: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  search: {
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 10,
    borderCurve: 'continuous',
    paddingVertical: 12,
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 15,
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
  cardSubtitle: {
    color: '#888',
    fontSize: 14,
  },
  action: {
    backgroundColor: '#e54242',
    borderRadius: 10,
    borderCurve: 'continuous',
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 84,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  stateLabel: {
    color: '#666',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  doneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(74, 222, 128, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.24)',
    borderRadius: 10,
    borderCurve: 'continuous',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  doneText: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '700',
  },
  loader: {
    marginTop: 24,
  },
  errorRow: {
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 16,
  },
  errorText: {
    color: '#f87171',
    fontSize: 14,
  },
});

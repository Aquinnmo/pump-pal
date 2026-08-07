import { TimberAuthShell, TimberBrand, timberAuthStyles } from '@/components/timber-auth-shell';
import { TimberLogo } from '@/components/timber-logo';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

const ONBOARDING_KEY = 'pumppal_onboarding_seen';

interface Slide {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  detail: string;
}

const SLIDES: Slide[] = [
  {
    id: '1',
    icon: 'barbell-outline',
    title: 'Welcome to Timber',
    subtitle: 'Timber is named for logging your workouts.',
    detail: 'Log every lift, then watch your strength and consistency grow over time.',
  },
  {
    id: '2',
    icon: 'clipboard-outline',
    title: 'Log the work',
    subtitle: 'Capture exercises, sets, reps, and notes while you train.',
    detail: 'Each completed session adds another ring to your workout history.',
  },
  {
    id: '3',
    icon: 'calendar-outline',
    title: 'Plan it. Then log it.',
    subtitle: 'Queue a workout when it helps, or start one when you are ready.',
    detail: 'Set your usual split so Timber starts from your training routine.',
  },
  {
    id: '4',
    icon: 'analytics-outline',
    title: 'See what you’ve grown',
    subtitle: 'Review workout analytics and AI Muscle Insights from your real history.',
    detail: 'Take on TPC when you want a daily challenge with a little extra burn.',
  },
];

export default function WelcomeScreen() {
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList<Slide>>(null);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setActiveIndex(index);
  };

  const goToSignIn = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.replace('/(auth)/sign-in');
  };

  const handleNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
      return;
    }
    goToSignIn();
  };

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <TimberAuthShell>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <View style={styles.brandSlot}>
            <TimberBrand title="Timber" compact />
          </View>
          <TouchableOpacity
            accessibilityLabel="Skip welcome and sign in"
            style={styles.skip}
            onPress={goToSignIn}
            activeOpacity={0.7}>
            <Text style={styles.skipText}>Skip</Text>
            <Ionicons name="arrow-forward" size={15} color="#c9a567" />
          </TouchableOpacity>
        </View>

        <FlatList
          ref={flatListRef}
          data={SLIDES}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <View style={[styles.slide, { width }]}>
              <View style={styles.iconFrame}>
                {item.id === '1' ? (
                  <TimberLogo size={104} />
                ) : (
                  <Ionicons name={item.icon} size={50} color="#e54242" />
                )}
              </View>
              <Text style={styles.slideNumber}>0{item.id} / 0{SLIDES.length}</Text>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.subtitle}>{item.subtitle}</Text>
              <Text style={styles.detail}>{item.detail}</Text>
            </View>
          )}
        />

        <View style={styles.footer}>
          <View style={styles.dots} accessibilityLabel={`Welcome screen ${activeIndex + 1} of ${SLIDES.length}`}>
            {SLIDES.map((slide, index) => (
              <View key={slide.id} style={[styles.dot, index === activeIndex && styles.dotActive]} />
            ))}
          </View>
          <TouchableOpacity
            accessibilityLabel={isLast ? 'Get started with Timber' : 'Next welcome screen'}
            style={[timberAuthStyles.primaryButton, styles.button]}
            onPress={handleNext}
            activeOpacity={0.8}>
            <Text style={timberAuthStyles.primaryButtonText}>{isLast ? 'Get Started' : 'Next'}</Text>
            <Ionicons name={isLast ? 'arrow-forward-circle-outline' : 'chevron-forward'} size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </TimberAuthShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  brandSlot: {
    flex: 1,
  },
  skip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    paddingLeft: 16,
  },
  skipText: {
    color: '#c9a567',
    fontSize: 14,
    fontWeight: '700',
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  // Bark fill + sapwood border kept deliberately — same arrival marker as the
  // logo frame in components/timber-auth-shell.tsx.
  iconFrame: {
    width: 128,
    height: 128,
    borderRadius: 24,
    backgroundColor: 'rgba(74, 51, 36, 0.28)',
    borderWidth: 1,
    borderColor: '#6e4a30',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  slideNumber: {
    color: '#c9a567',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: -0.8,
    marginBottom: 16,
  },
  // Hierarchy between subtitle and detail comes from size and weight, not a
  // second grey — the palette has one secondary text colour.
  subtitle: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    lineHeight: 21,
    fontWeight: '600',
  },
  detail: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 16,
    maxWidth: 330,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 16,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#2a2a2a',
  },
  dotActive: {
    width: 24,
    backgroundColor: '#c9a567',
  },
  // Only the row layout is local; fill, radius and the sanctioned accent shadow
  // come from timberAuthStyles.primaryButton.
  button: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
});

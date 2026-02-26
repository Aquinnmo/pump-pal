import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';

const ONBOARDING_KEY = 'pumppal_onboarding_seen';

interface Slide {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}

const SLIDES: Slide[] = [
  {
    id: '1',
    icon: 'barbell-outline',
    title: 'Welcome to Pump Pal',
    subtitle:
      'Your personal gym companion built to help you train smarter, stay consistent, and reach your goals.',
  },
  {
    id: '2',
    icon: 'journal-outline',
    title: 'Log Every Session',
    subtitle:
      'Record your workouts as you go. Track sets, reps, and exercises to build a complete training history.',
  },
  {
    id: '3',
    icon: 'sparkles-outline',
    title: 'AI-Powered Insights',
    subtitle:
      'Get personalized muscle analysis and workout suggestions powered by AI based on your actual history.',
  },
  {
    id: '4',
    icon: 'trophy-outline',
    title: 'Your Split, Your Way',
    subtitle:
      'Choose from popular training splits like PPL or Bro Split — or define a fully custom routine that fits your life.',
  },
];

export default function WelcomeScreen() {
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    setActiveIndex(index);
  };

  const goToSignIn = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.replace('/(auth)/sign-in');
  };

  const handleNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    } else {
      goToSignIn();
    }
  };

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.skip} onPress={goToSignIn} activeOpacity={0.7}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

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
            <View style={styles.iconCircle}>
              <Ionicons name={item.icon} size={52} color="#e54242" />
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.subtitle}>{item.subtitle}</Text>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
          ))}
        </View>

        <TouchableOpacity style={styles.button} onPress={handleNext} activeOpacity={0.85}>
          <Text style={styles.buttonText}>{isLast ? 'Get Started' : 'Next'}</Text>
          <Ionicons
            name={isLast ? 'arrow-forward-circle-outline' : 'chevron-forward'}
            size={20}
            color="#fff"
            style={styles.buttonIcon}
          />
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
  skip: {
    position: 'absolute',
    top: 58,
    right: 24,
    zIndex: 10,
  },
  skipText: {
    color: '#555',
    fontSize: 15,
    fontWeight: '600',
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingBottom: 120,
  },
  iconCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 24,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#333',
  },
  dotActive: {
    backgroundColor: '#e54242',
    width: 22,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e54242',
    borderRadius: 14,
    paddingVertical: 16,
    width: '100%',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonIcon: {
    marginLeft: 8,
  },
});

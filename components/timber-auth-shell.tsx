import { TimberLogo } from '@/components/timber-logo';
import { LinearGradient } from 'expo-linear-gradient';
import { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type TimberAuthShellProps = PropsWithChildren<{
  contentStyle?: StyleProp<ViewStyle>;
}>;

type TimberBrandProps = {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  compact?: boolean;
};

export function TimberAuthShell({ children, contentStyle }: TimberAuthShellProps) {
  return (
    <LinearGradient colors={['#18120f', '#0f0f0f', '#0f0f0f']} style={styles.background}>
      <View pointerEvents="none" style={styles.ambient}>
        <View style={[styles.ring, styles.ringLarge]} />
        <View style={[styles.ring, styles.ringMedium]} />
        <View style={[styles.ring, styles.ringSmall]} />
      </View>
      <SafeAreaView style={[styles.safeArea, contentStyle]}>{children}</SafeAreaView>
    </LinearGradient>
  );
}

export function TimberBrand({ eyebrow, title = 'Timber', subtitle, compact = false }: TimberBrandProps) {
  return (
    <View style={[styles.brand, compact && styles.brandCompact]}>
      <View style={[styles.logoWrap, compact && styles.logoWrapCompact]}>
        <TimberLogo size={compact ? 42 : 74} />
      </View>
      <View style={compact ? styles.brandCopyCompact : undefined}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={[styles.brandTitle, compact && styles.brandTitleCompact]}>{title}</Text>
        {subtitle ? <Text style={[styles.brandSubtitle, compact && styles.brandSubtitleCompact]}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

export const timberAuthStyles = StyleSheet.create({
  field: {
    backgroundColor: '#181716',
    borderWidth: 1,
    borderColor: '#4a3324',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    color: '#fff',
  },
  primaryButton: {
    backgroundColor: '#e54242',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#e54242',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#291919',
    borderWidth: 1,
    borderColor: '#69302b',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
});

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  ambient: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(201, 165, 103, 0.12)',
  },
  ringLarge: {
    width: 520,
    height: 520,
    right: -280,
    top: -180,
  },
  ringMedium: {
    width: 380,
    height: 380,
    right: -210,
    top: -110,
    borderColor: 'rgba(229, 66, 66, 0.12)',
  },
  ringSmall: {
    width: 240,
    height: 240,
    left: -150,
    bottom: -120,
    borderColor: 'rgba(74, 51, 36, 0.72)',
  },
  brand: {
    alignItems: 'center',
  },
  brandCompact: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoWrap: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(74, 51, 36, 0.28)',
    borderWidth: 1,
    borderColor: '#6e4a30',
    marginBottom: 14,
  },
  logoWrapCompact: {
    width: 56,
    height: 56,
    borderRadius: 18,
    marginBottom: 0,
    marginRight: 12,
  },
  brandCopyCompact: {
    flexShrink: 1,
  },
  eyebrow: {
    color: '#c9a567',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 4,
  },
  brandTitle: {
    color: '#fff',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -1.2,
    textAlign: 'center',
  },
  brandTitleCompact: {
    color: '#c9a567',
    fontSize: 25,
    textAlign: 'left',
  },
  brandSubtitle: {
    color: '#aaa',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 7,
  },
  brandSubtitleCompact: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'left',
    marginTop: 2,
  },
});

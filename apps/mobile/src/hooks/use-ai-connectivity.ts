import { useNetInfo } from '@react-native-community/netinfo';
import { Platform } from 'react-native';

/** Native AI controls are read-only while offline; cached content stays visible. */
export function useAIGenerationAvailable(): boolean {
  const netInfo = useNetInfo();
  if (Platform.OS === 'web') return true;
  return netInfo.isConnected !== false && netInfo.isInternetReachable !== false;
}

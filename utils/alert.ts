import { Alert, Platform } from 'react-native';

/**
 * Cross-platform alert — uses window.alert on web, Alert.alert on native.
 */
export function showAlert(title: string, message?: string) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

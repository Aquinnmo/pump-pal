import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApps, initializeApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyC2amOPLWL-vGZSuTNM6b3xF7Cf_oUthGI',
  authDomain: 'pumppal-c9199.firebaseapp.com',
  projectId: 'pumppal-c9199',
  storageBucket: 'pumppal-c9199.firebasestorage.app',
  messagingSenderId: '631531267876',
  appId: '1:631531267876:web:4eb8a206669081112cb5b1',
  measurementId: 'G-LFKWZVCXMV',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = (() => {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(app);
  }
})();

export const db = getFirestore(app);

export default app;

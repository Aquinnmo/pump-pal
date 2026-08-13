import { auth } from '@/config/firebase';
import { configureSyncTrigger, startSyncTriggers, stopSyncTriggers } from '@/data/sync-trigger';
import { connectGoogleAccount as linkGoogleAccount, signInWithGoogle as googleSignIn, signOutGoogle } from '@/lib/google-sign-in';
import { hasGoogleProvider } from '@/lib/google-account-link';
import { loadCatalog } from '@/lib/exercise-catalog';
import {
    User,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
} from 'firebase/auth';
import React, { createContext, useContext, useEffect, useState } from 'react';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  googleConnection: 'connected' | 'disconnected' | 'connecting';
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  /** Resolves false when the user dismissed the Google picker. */
  signInWithGoogle: () => Promise<boolean>;
  /** Resolves false when the Google picker or popup was dismissed. */
  connectGoogleAccount: () => Promise<boolean>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleConnection, setGoogleConnection] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');

  useEffect(() => {
    // Sign-in/bootstrap and sign-out triggers for the native sync engine
    // (bead pump-pal-bkp.7) — a no-op on web (src/data/sync-trigger.web.ts).
    // configureSyncTrigger reads the uid from this same callback rather than
    // src/data/sync-trigger.ts importing Firebase itself.
    configureSyncTrigger(() => ({
      uid: auth.currentUser?.uid ?? null,
      currentUid: auth.currentUser?.uid ?? null,
    }));
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setGoogleConnection(firebaseUser && hasGoogleProvider(firebaseUser.providerData) ? 'connected' : 'disconnected');
      setLoading(false);
      if (firebaseUser) {
        startSyncTriggers();
        // Start the global catalog fetch at authenticated startup rather than
        // waiting for a picker or analytics surface to mount. loadCatalog
        // coalesces this with any concurrent consumer and handles offline
        // fallbacks internally, so it is deliberately non-blocking here.
        void loadCatalog(firebaseUser.uid);
      } else {
        stopSyncTriggers();
      }
    });
    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName });
  };

  const signInWithGoogle = () => googleSignIn();

  const connectGoogleAccount = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('You must be signed in to connect Google.');
    if (hasGoogleProvider(currentUser.providerData)) {
      setGoogleConnection('connected');
      return true;
    }

    setGoogleConnection('connecting');
    try {
      const connected = await linkGoogleAccount(currentUser);
      setGoogleConnection(
        connected && hasGoogleProvider(auth.currentUser?.providerData ?? []) ? 'connected' : 'disconnected'
      );
      return connected;
    } catch (error) {
      // A web mismatch is explicitly unlinked before this point. If that
      // rollback could not complete, reflect the actual provider state rather
      // than presenting a false disconnected status.
      setGoogleConnection(hasGoogleProvider(auth.currentUser?.providerData ?? []) ? 'connected' : 'disconnected');
      throw error;
    }
  };

  const logOut = async () => {
    // Clears the cached Google account first, so the next Google sign-in shows
    // the picker instead of silently reusing the last one.
    await signOutGoogle();
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, googleConnection, signIn, signUp, signInWithGoogle, connectGoogleAccount, logOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

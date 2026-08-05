import { auth } from '@/config/firebase';
import { configureSyncTrigger, startSyncTriggers, stopSyncTriggers } from '@/db/sync-trigger';
import { signInWithGoogle as googleSignIn, signOutGoogle } from '@/utils/google-sign-in';
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
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  /** Resolves false when the user dismissed the Google picker. */
  signInWithGoogle: () => Promise<boolean>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Sign-in/bootstrap and sign-out triggers for the native sync engine
    // (bead pump-pal-bkp.7) — a no-op on web (db/sync-trigger.web.ts).
    // configureSyncTrigger reads the uid from this same callback rather than
    // db/sync-trigger.ts importing Firebase itself.
    configureSyncTrigger(() => ({
      uid: auth.currentUser?.uid ?? null,
      currentUid: auth.currentUser?.uid ?? null,
    }));
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      if (firebaseUser) {
        startSyncTriggers();
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

  const logOut = async () => {
    // Clears the cached Google account first, so the next Google sign-in shows
    // the picker instead of silently reusing the last one.
    await signOutGoogle();
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signInWithGoogle, logOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

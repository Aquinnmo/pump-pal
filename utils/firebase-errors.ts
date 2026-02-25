const FIREBASE_ERROR_MAP: Record<string, string> = {
  'auth/invalid-email': 'Invalid email address.',
  'auth/invalid-credential': 'Invalid credentials. Please try again.',
  'auth/user-not-found': 'Invalid credentials. Please try again.',
  'auth/wrong-password': 'Invalid credentials. Please try again.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/user-disabled': 'This account has been disabled. Please contact support.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/network-request-failed': 'Network error. Please check your connection.',
  'auth/requires-recent-login': 'Please sign out and sign in again to continue.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled.',
};

export function getFriendlyAuthError(err: any): string {
  const code = err?.code as string | undefined;
  if (code && FIREBASE_ERROR_MAP[code]) {
    return FIREBASE_ERROR_MAP[code];
  }
  return 'Internal error. Please try again later.';
}

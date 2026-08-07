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
  'auth/account-exists-with-different-credential':
    'This email already has a Timber password. Sign in with your password, then connect Google from Account Settings.',
  'auth/credential-already-in-use':
    'This Google account is already linked to a different Timber account. Sign in to that account instead.',
  'auth/provider-already-linked': 'Google is already connected to this account.',
  'auth/google-email-mismatch': 'The selected Google email does not match this Timber account.',
  'auth/google-link-user-changed': 'Your signed-in account changed while Google was connecting. Try again.',
  // @react-native-google-signin status codes — same `code` field, so they map here.
  // Android rejects with the *numeric* GMS status code stringified
  // (RNGoogleSigninModule.java: `String.valueOf(CommonStatusCodes.DEVELOPER_ERROR)`),
  // not the constant's name, so key on the number. PLAY_SERVICES_NOT_AVAILABLE is
  // the module's own literal string and is the exception.
  '10': 'Google sign-in is not configured for this build.', // DEVELOPER_ERROR
  '4': 'Sign-in was cancelled.', // SIGN_IN_REQUIRED
  '12501': 'Sign-in was cancelled.', // SIGN_IN_CANCELLED
  '7': 'Network error. Please check your connection.', // NETWORK_ERROR
  DEVELOPER_ERROR: 'Google sign-in is not configured for this build.',
  PLAY_SERVICES_NOT_AVAILABLE: 'Google Play services are unavailable or out of date.',
  SIGN_IN_REQUIRED: 'Sign-in was cancelled.',
};

export function getFriendlyAuthError(err: any): string {
  const code = err?.code as string | undefined;
  if (code && FIREBASE_ERROR_MAP[code]) {
    return FIREBASE_ERROR_MAP[code];
  }
  return 'Internal error. Please try again later.';
}

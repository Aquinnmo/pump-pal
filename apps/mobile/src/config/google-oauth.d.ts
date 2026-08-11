export function parseGoogleOAuthClientId(value: string | undefined, variableName: string): string | undefined;

// Deliberately wider than NodeJS.ProcessEnv: client code must hand in the two
// values as a plain object built from literal `process.env.EXPO_PUBLIC_*` reads,
// because only those get inlined by Metro (see src/lib/google-sign-in.ts).
export function getGoogleOAuthConfig(environment?: Record<string, string | undefined>): {
  webClientId: string | undefined;
  iosClientId: string | undefined;
};

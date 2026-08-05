export function parseGoogleOAuthClientId(value: string | undefined, variableName: string): string | undefined;

export function getGoogleOAuthConfig(environment?: NodeJS.ProcessEnv): {
  webClientId: string | undefined;
  iosClientId: string | undefined;
};

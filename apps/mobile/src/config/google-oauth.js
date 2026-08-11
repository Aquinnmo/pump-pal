/**
 * Google OAuth client IDs are public identifiers, but they are not Firebase
 * App IDs. Keep this parser dependency-free because Expo evaluates it from
 * app.config.js before it loads the TypeScript bundle.
 */
const GOOGLE_OAUTH_CLIENT_ID = /^\d+-[a-z0-9][a-z0-9-]*\.apps\.googleusercontent\.com$/i;

/**
 * @param {string | undefined} value
 * @param {string} variableName
 * @returns {string | undefined}
 */
function parseGoogleOAuthClientId(value, variableName) {
  if (value === undefined || value === '') return undefined;

  if (value.trim() !== value) {
    throw new Error(
      `${variableName} must contain only a Google OAuth client ID; remove whitespace or inline comments.`,
    );
  }

  if (!GOOGLE_OAUTH_CLIENT_ID.test(value)) {
    throw new Error(
      `${variableName} must be a Google OAuth client ID ending in apps.googleusercontent.com. ` +
        'Firebase App IDs (for example, 1:…:web:…) are not OAuth client IDs.',
    );
  }

  return value;
}

/**
 * Missing values are intentional for static web export. Present values must
 * always be validated so bad Preview configuration fails at configuration
 * time instead of producing a generic native Google sign-in error later.
 *
 * @param {NodeJS.ProcessEnv} environment
 */
function getGoogleOAuthConfig(environment = process.env) {
  return {
    webClientId: parseGoogleOAuthClientId(
      environment.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
    ),
    iosClientId: parseGoogleOAuthClientId(
      environment.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
    ),
  };
}

module.exports = {
  getGoogleOAuthConfig,
  parseGoogleOAuthClientId,
};

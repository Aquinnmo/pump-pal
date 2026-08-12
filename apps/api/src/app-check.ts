import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

const JWKS = createRemoteJWKSet(new URL('https://firebaseappcheck.googleapis.com/v1/jwks'));

export type AppCheckBindings = {
  FIREBASE_PROJECT_NUMBER?: string;
  APP_CHECK_ALLOWED_APP_IDS?: string;
  /** monitor accepts missing/invalid tokens but records verification; enforce rejects them. */
  APP_CHECK_MODE?: 'monitor' | 'enforce';
};

export type AppCheckResult = { verified: boolean; appId?: string; reason?: string };

function config(env: AppCheckBindings) {
  const projectNumber = env.FIREBASE_PROJECT_NUMBER;
  const appIds = (env.APP_CHECK_ALLOWED_APP_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  if (!projectNumber || appIds.length === 0) throw new Error('App Check requires FIREBASE_PROJECT_NUMBER and APP_CHECK_ALLOWED_APP_IDS.');
  return { projectNumber, appIds: new Set(appIds) };
}

/** Full custom-backend verification per Firebase's App Check JWT requirements. */
export function createAppCheckVerifier(jwks: JWTVerifyGetKey = JWKS) {
  return async (token: string | undefined, env: AppCheckBindings): Promise<AppCheckResult> => {
    if (!token) return { verified: false, reason: 'missing' };
    try {
      const { projectNumber, appIds } = config(env);
      const { payload, protectedHeader } = await jwtVerify(token, jwks, {
      issuer: `https://firebaseappcheck.googleapis.com/${projectNumber}`,
      audience: `projects/${projectNumber}`,
      algorithms: ['RS256'],
      });
      if (protectedHeader.typ !== 'JWT') return { verified: false, reason: 'wrong_type' };
      if (typeof payload.sub !== 'string' || !appIds.has(payload.sub)) return { verified: false, reason: 'wrong_app' };
      return { verified: true, appId: payload.sub };
    } catch {
      return { verified: false, reason: 'invalid' };
    }
  };
}

export const verifyAppCheckToken = createAppCheckVerifier();

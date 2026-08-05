// Pinned to jose 5.x on purpose: v6 is ESM-only, and Vercel compiles these
// functions to CommonJS, so v6 fails at runtime with ERR_REQUIRE_ESM.
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Verifies the caller's Firebase ID token and returns their uid, using `jose`
 * against Google's public signing keys instead of the Admin SDK's
 * `verifyIdToken`. Same tokens, same Google signing keys, zero client change.
 *
 * `jwtVerify` checks signature, `exp`, `nbf`, `iss`, `aud`, and `alg` — the
 * same set `verifyIdToken(token, false)` checks.
 *
 * ponytail: no revocation check. `verifyIdToken(token, true)` used to ask
 * Firebase whether the session was revoked; jose verifies locally and cannot.
 * A signed-out or disabled account keeps working until its current token
 * expires (<=1h). Upgrade path: one Firebase Auth REST lookup
 * (accounts:lookup) per request if that ceiling ever matters.
 */
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

export async function requireUid(authorization: string | undefined): Promise<string> {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) throw Object.assign(new Error('Missing bearer token'), { status: 401 });

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('Missing FIREBASE_PROJECT_ID');

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      // SECURITY: pinned. Without this a JWT library can be tricked into
      // accepting `alg: none` or an HMAC forged with the public key.
      algorithms: ['RS256'],
    });

    if (!payload.sub) throw new Error('Token missing sub');
    return payload.sub;
  } catch {
    throw Object.assign(new Error('Invalid or expired session'), { status: 401 });
  }
}

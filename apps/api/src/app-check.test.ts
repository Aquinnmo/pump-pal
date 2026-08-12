import assert from 'node:assert/strict';
import { SignJWT, generateKeyPair } from 'jose';
import { createAppCheckVerifier } from './app-check.js';

const env = { FIREBASE_PROJECT_NUMBER: '123', APP_CHECK_ALLOWED_APP_IDS: '1:123:web:allowed' } as const;

async function token(privateKey: Parameters<SignJWT['sign']>[0], overrides: Record<string, unknown> = {}) {
  return new SignJWT({ sub: '1:123:web:allowed', ...overrides })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer('https://firebaseappcheck.googleapis.com/123')
    .setAudience('projects/123')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
}

async function main() {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const verify = createAppCheckVerifier(async () => publicKey);
  assert.deepEqual(await verify(undefined, env), { verified: false, reason: 'missing' });
  assert.deepEqual(await verify(await token(privateKey), env), { verified: true, appId: '1:123:web:allowed' });
  assert.equal((await verify(await token(privateKey, { sub: 'wrong-app' }), env)).reason, 'wrong_app');
  const wrongAudience = new SignJWT({ sub: '1:123:web:allowed' }).setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer('https://firebaseappcheck.googleapis.com/123').setAudience('projects/999').setExpirationTime('1h').sign(privateKey);
  assert.equal((await verify(await wrongAudience, env)).reason, 'invalid');
  const expired = new SignJWT({ sub: '1:123:web:allowed' }).setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer('https://firebaseappcheck.googleapis.com/123').setAudience('projects/123').setExpirationTime('0s').sign(privateKey);
  assert.equal((await verify(await expired, env)).reason, 'invalid');
  const other = await generateKeyPair('RS256');
  assert.equal((await verify(await token(other.privateKey), env)).reason, 'invalid');
  console.log('app-check: verification assertions passed');
}
void main();

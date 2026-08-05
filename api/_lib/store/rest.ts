import { importPKCS8, SignJWT } from 'jose';

/**
 * Firestore over plain HTTPS, replacing the Admin SDK's Firestore client.
 * The Admin SDK pulls in `@google-cloud/firestore` -> `google-gax` ->
 * `@grpc/grpc-js` (16MB), which dominates cold start for what this function
 * actually does: a couple of single-document reads and writes.
 *
 * Auth: an OAuth2 JWT-bearer grant signed with the SAME service-account env
 * vars already set in Vercel (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL /
 * FIREBASE_PRIVATE_KEY) — no new secret, no new service account. This
 * credential STILL BYPASSES firestore.rules, exactly like the Admin SDK did:
 * that's a property of the service account, not the SDK. `firestore.rules`
 * needs no change.
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
/**
 * The PEM survives a round trip through JSON and a dashboard textarea, which
 * mangles it three ways: literal "\n" instead of newlines, the JSON string's
 * own surrounding quotes pasted along with the value, and stray whitespace.
 * `importPKCS8` requires the header at index 0 exactly, so any one of those
 * fails with a message that names none of them.
 */
const PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  .trim()
  .replace(/^["']|["']$/g, '')
  .trim();

const DOCUMENTS_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Cached in module scope for its full 1h life, minus a 60s safety margin.
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  if (!PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
    throw new Error(
      'Missing Firebase service-account credentials (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)'
    );
  }

  if (!PRIVATE_KEY.startsWith('-----BEGIN PRIVATE KEY-----')) {
    // Never log the key itself. The first 30 chars are the PEM header at worst,
    // and are the only part that says which of the mangling modes happened.
    throw new Error(
      'FIREBASE_PRIVATE_KEY is not a PKCS#8 PEM. It must begin with ' +
        `"-----BEGIN PRIVATE KEY-----" but begins with ${JSON.stringify(
          PRIVATE_KEY.slice(0, 30)
        )}. Paste the private_key value from the service-account JSON without ` +
        'its surrounding quotes; "BEGIN RSA PRIVATE KEY" means PKCS#1, convert ' +
        'with: openssl pkcs8 -topk8 -nocrypt -in old.pem'
    );
  }

  const key = await importPKCS8(PRIVATE_KEY, 'RS256');
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/datastore' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(CLIENT_EMAIL)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to obtain Firestore access token: ${res.status} ${await res.text()}`);
  }

  // expires_in is SECONDS.
  const { access_token, expires_in } = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = { token: access_token, expiresAt: Date.now() + (expires_in - 60) * 1000 };
  return access_token;
}

// ------------------------------------------------------------- value codec
//
// Small typed-value codec for the only two shapes this code touches: aiUsage
// (a map of a string + a number) and name (a string). NOTE integerValue is a
// STRING in the REST wire format.

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

function encodeValue(value: unknown): FirestoreValue {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return { integerValue: String(Math.trunc(value)) };
  if (value && typeof value === 'object') return { mapValue: { fields: encodeFields(value as Record<string, unknown>) } };
  throw new Error(`Unsupported Firestore value: ${JSON.stringify(value)}`);
}

function decodeValue(value: FirestoreValue): string | number | Record<string, unknown> {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields ?? {});
  throw new Error(`Unsupported Firestore value: ${JSON.stringify(value)}`);
}

export function encodeFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, encodeValue(v)]));
}

export function decodeFields(
  fields: Record<string, FirestoreValue>
): Record<string, string | number | Record<string, unknown>> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));
}

// -------------------------------------------------------------- get / commit

export interface FirestoreDoc {
  fields: Record<string, string | number | Record<string, unknown>>;
  updateTime: string;
}

/** Reads a document by path (e.g. `users/{uid}`). Returns `undefined` for a missing doc rather than throwing. */
export async function getDoc(path: string, fieldPaths?: string[]): Promise<FirestoreDoc | undefined> {
  const token = await getAccessToken();
  const query = fieldPaths?.length
    ? `?${fieldPaths.map((f) => `mask.fieldPaths=${encodeURIComponent(f)}`).join('&')}`
    : '';

  const res = await fetch(`${DOCUMENTS_URL}/${path}${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`Firestore getDoc(${path}) failed: ${res.status} ${await res.text()}`);

  const body = (await res.json()) as { fields?: Record<string, FirestoreValue>; updateTime: string };
  return { fields: decodeFields(body.fields ?? {}), updateTime: body.updateTime };
}

export interface FirestoreWrite {
  path: string;
  fields: Record<string, unknown>;
  /**
   * FOOTGUN: every write must carry this. Without it `:commit` REPLACES the
   * whole document instead of merging, wiping every sibling field on
   * `users/{uid}`.
   */
  updateMask: string[];
  /** Optimistic-concurrency precondition: an updateTime from a prior getDoc, or `{ exists: false }` for a first-writer-wins create. */
  currentDocument?: { updateTime?: string } | { exists: boolean };
}

/** Throws a 409-tagged error when a `currentDocument` precondition doesn't hold. */
export async function commit(writes: FirestoreWrite[]): Promise<void> {
  const token = await getAccessToken();

  const res = await fetch(`${DOCUMENTS_URL}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      writes: writes.map((w) => ({
        update: {
          name: `projects/${PROJECT_ID}/databases/(default)/documents/${w.path}`,
          fields: encodeFields(w.fields),
        },
        updateMask: { fieldPaths: w.updateMask },
        ...(w.currentDocument ? { currentDocument: w.currentDocument } : {}),
      })),
    }),
  });

  if (res.status === 409) {
    throw Object.assign(new Error('Firestore write precondition failed'), { status: 409 });
  }
  if (!res.ok) {
    throw new Error(`Firestore commit failed: ${res.status} ${await res.text()}`);
  }
}

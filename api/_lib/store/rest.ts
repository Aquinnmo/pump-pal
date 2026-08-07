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
// Typed-value codec covering every shape the domain routes need: strings,
// integers/doubles, booleans, null, nested maps, arrays, and timestamps.
// NOTE integerValue is a STRING in the REST wire format; timestampValue is
// an RFC3339 string (which is exactly the ISO-8601 UTC shape the wire
// contract already uses, so decode passes it through unchanged as a string —
// callers that need it typed as a Date-ish value convert at the route).

export type FirestoreValue =
  | { nullValue: null }
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

/** Marks a JS Date/ISO-string as a Firestore `timestampValue` write instead of a plain string. */
export class FirestoreTimestamp {
  constructor(public iso: string) {}
}
export function ts(iso: string): FirestoreTimestamp {
  return new FirestoreTimestamp(iso);
}

function encodeValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof FirestoreTimestamp) return { timestampValue: value.iso };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value as Record<string, unknown>) } };
  throw new Error(`Unsupported Firestore value: ${JSON.stringify(value)}`);
}

export type DecodedValue = string | number | boolean | null | DecodedValue[] | { [k: string]: DecodedValue };

function decodeValue(value: FirestoreValue): DecodedValue {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields ?? {});
  throw new Error(`Unsupported Firestore value: ${JSON.stringify(value)}`);
}

export function encodeFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, encodeValue(v)]));
}

export function decodeFields(fields: Record<string, FirestoreValue>): Record<string, DecodedValue> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));
}

// -------------------------------------------------------------- get / commit

export interface FirestoreDoc {
  /** Doc path relative to the documents root, e.g. `workouts/abc123`. */
  path: string;
  fields: Record<string, DecodedValue>;
  updateTime: string;
}

function docPath(name: string): string {
  // name is the fully qualified `projects/.../documents/{path}`; keep only {path}.
  return name.split('/documents/')[1] ?? name;
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

  const body = (await res.json()) as { name: string; fields?: Record<string, FirestoreValue>; updateTime: string };
  return { path: docPath(body.name), fields: decodeFields(body.fields ?? {}), updateTime: body.updateTime };
}

export interface FirestoreWrite {
  path: string;
  /** Omit (or set `delete: true`) to delete instead of writing fields. */
  fields?: Record<string, unknown>;
  /**
   * FOOTGUN: every non-delete write must carry this. Without it `:commit`
   * REPLACES the whole document instead of merging, wiping every sibling
   * field on the doc.
   */
  updateMask?: string[];
  delete?: boolean;
  /** Optimistic-concurrency precondition: an updateTime from a prior getDoc, or `{ exists: false }` for a first-writer-wins create. */
  currentDocument?: { updateTime?: string } | { exists: boolean };
}

export interface CommitResult {
  /** Absent for delete writes. */
  updateTime?: string;
}

/** Throws a 409-tagged error when any write's `currentDocument` precondition doesn't hold. All writes in one call commit atomically. */
export async function commit(writes: FirestoreWrite[]): Promise<CommitResult[]> {
  const token = await getAccessToken();

  const res = await fetch(`${DOCUMENTS_URL}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      writes: writes.map((w) => ({
        ...(w.delete
          ? { delete: `projects/${PROJECT_ID}/databases/(default)/documents/${w.path}` }
          : {
              update: {
                name: `projects/${PROJECT_ID}/databases/(default)/documents/${w.path}`,
                fields: encodeFields(w.fields ?? {}),
              },
              updateMask: { fieldPaths: w.updateMask ?? [] },
            }),
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

  const body = (await res.json()) as { writeResults?: { updateTime?: string }[] };
  return writes.map((_, i) => ({ updateTime: body.writeResults?.[i]?.updateTime }));
}

/** Convenience wrapper for a single-document delete. 404 (already gone) is treated as success. */
export async function deleteDoc(path: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`${DOCUMENTS_URL}/${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Firestore deleteDoc(${path}) failed: ${res.status} ${await res.text()}`);
  }
}

// ------------------------------------------------------------------- query

export type QueryFilter = { field: string; op: 'EQUAL' | 'GREATER_THAN_OR_EQUAL' | 'LESS_THAN_OR_EQUAL'; value: unknown };

export interface RunQueryOptions {
  collectionId: string;
  /** Query root, e.g. `''` for a top-level collection or `users/{uid}` for a subcollection. Defaults to the documents root. */
  parentPath?: string;
  where?: QueryFilter[];
  orderBy?: { field: string; direction?: 'ASCENDING' | 'DESCENDING' }[];
  limit?: number;
  /** Cursor: field values matching `orderBy`, exclusive (start AFTER this row). */
  startAfter?: unknown[];
}

/**
 * Runs a structured query and returns matching documents (empty array, not
 * undefined, when nothing matches). Bounded by `limit` — callers must pass
 * one; there is no unbounded "get everything" query on this adapter.
 */
export async function runQuery(opts: RunQueryOptions): Promise<FirestoreDoc[]> {
  const token = await getAccessToken();

  const structuredQuery: Record<string, unknown> = {
    from: [{ collectionId: opts.collectionId }],
  };
  if (opts.where?.length) {
    const filters = opts.where.map((f) => ({
      fieldFilter: { field: { fieldPath: f.field }, op: f.op, value: encodeValue(f.value) },
    }));
    structuredQuery.where =
      filters.length === 1 ? filters[0] : { compositeFilter: { op: 'AND', filters } };
  }
  if (opts.orderBy?.length) {
    structuredQuery.orderBy = opts.orderBy.map((o) => ({
      field: { fieldPath: o.field },
      direction: o.direction ?? 'ASCENDING',
    }));
  }
  if (opts.limit) structuredQuery.limit = opts.limit;
  if (opts.startAfter?.length) {
    structuredQuery.startAt = { values: opts.startAfter.map(encodeValue), before: false };
  }

  const parent = opts.parentPath ? `${DOCUMENTS_URL}/${opts.parentPath}` : DOCUMENTS_URL;
  const res = await fetch(`${parent}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
  });

  if (!res.ok) throw new Error(`Firestore runQuery(${opts.collectionId}) failed: ${res.status} ${await res.text()}`);

  const body = (await res.json()) as { document?: { name: string; fields?: Record<string, FirestoreValue>; updateTime: string } }[];
  return body
    .filter((row): row is { document: NonNullable<(typeof body)[number]['document']> } => !!row.document)
    .map((row) => ({
      path: docPath(row.document.name),
      fields: decodeFields(row.document.fields ?? {}),
      updateTime: row.document.updateTime,
    }));
}

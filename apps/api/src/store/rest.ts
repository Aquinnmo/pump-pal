import { importPKCS8, SignJWT } from 'jose';
import {
  decodeFirestoreDocument,
  encodeFirestoreFields,
  encodeFirestoreValue,
  type DecodedFirestoreValue,
  type FirestoreRestDocument,
} from '@timber/contract/firestore';
import { runtimeEnv } from '../runtime-env.js';

export {
  decodeFirestoreFields as decodeFields,
  encodeFirestoreFields as encodeFields,
  firestoreTimestamp as ts,
  type DecodedFirestoreValue as DecodedValue,
  type FirestoreValue,
} from '@timber/contract/firestore';

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

/**
 * The PEM survives a round trip through JSON and a dashboard textarea, which
 * mangles it three ways: literal "\n" instead of newlines, the JSON string's
 * own surrounding quotes pasted along with the value, and stray whitespace.
 * `importPKCS8` requires the header at index 0 exactly, so any one of those
 * fails with a message that names none of them.
 */
function config() {
  const projectId = runtimeEnv('FIREBASE_PROJECT_ID');
  const clientEmail = runtimeEnv('FIREBASE_CLIENT_EMAIL');
  const privateKey = runtimeEnv('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n')
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase service-account credentials (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)');
  }
  return {
    projectId,
    clientEmail,
    privateKey,
    documentsUrl: `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`,
  };
}

// Cached in module scope for its full 1h life, minus a 60s safety margin.
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  const { clientEmail, privateKey } = config();

  if (!privateKey.startsWith('-----BEGIN PRIVATE KEY-----')) {
    // Never log the key itself. The first 30 chars are the PEM header at worst,
    // and are the only part that says which of the mangling modes happened.
    throw new Error(
      'FIREBASE_PRIVATE_KEY is not a PKCS#8 PEM. It must begin with ' +
        `"-----BEGIN PRIVATE KEY-----" but begins with ${JSON.stringify(
          privateKey.slice(0, 30)
        )}. Paste the private_key value from the service-account JSON without ` +
        'its surrounding quotes; "BEGIN RSA PRIVATE KEY" means PKCS#1, convert ' +
        'with: openssl pkcs8 -topk8 -nocrypt -in old.pem'
    );
  }

  const key = await importPKCS8(privateKey, 'RS256');
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/datastore' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(clientEmail)
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

const encodeValue = encodeFirestoreValue;

// -------------------------------------------------------------- get / commit

export interface FirestoreDoc {
  /** Doc path relative to the documents root, e.g. `workouts/abc123`. */
  path: string;
  fields: Record<string, DecodedFirestoreValue>;
  updateTime: string;
}

/** Reads a document by path (e.g. `users/{uid}`). Returns `undefined` for a missing doc rather than throwing. */
export async function getDoc(path: string, fieldPaths?: string[]): Promise<FirestoreDoc | undefined> {
  const token = await getAccessToken();
  const { documentsUrl } = config();
  const query = fieldPaths?.length
    ? `?${fieldPaths.map((f) => `mask.fieldPaths=${encodeURIComponent(f)}`).join('&')}`
    : '';

  const res = await fetch(`${documentsUrl}/${path}${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`Firestore getDoc(${path}) failed: ${res.status} ${await res.text()}`);

  const body = (await res.json()) as FirestoreRestDocument;
  const document = decodeFirestoreDocument(body);
  return { path: document.path, fields: document.fields, updateTime: document.version };
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
  const { projectId, documentsUrl } = config();

  const res = await fetch(`${documentsUrl}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      writes: writes.map((w) => ({
        ...(w.delete
          ? { delete: `projects/${projectId}/databases/(default)/documents/${w.path}` }
          : {
              update: {
                name: `projects/${projectId}/databases/(default)/documents/${w.path}`,
                fields: encodeFirestoreFields(w.fields ?? {}),
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
  const { documentsUrl } = config();
  const res = await fetch(`${documentsUrl}/${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Firestore deleteDoc(${path}) failed: ${res.status} ${await res.text()}`);
  }
}

// ------------------------------------------------------------------- query

export type QueryFilter = {
  field: string;
  op: 'EQUAL' | 'GREATER_THAN_OR_EQUAL' | 'LESS_THAN_OR_EQUAL' | 'ARRAY_CONTAINS';
  value: unknown;
};

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
  const { documentsUrl } = config();

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

  const parent = opts.parentPath ? `${documentsUrl}/${opts.parentPath}` : documentsUrl;
  const res = await fetch(`${parent}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
  });

  if (!res.ok) throw new Error(`Firestore runQuery(${opts.collectionId}) failed: ${res.status} ${await res.text()}`);

  const body = (await res.json()) as { document?: FirestoreRestDocument }[];
  return body
    .filter((row): row is { document: FirestoreRestDocument } => !!row.document)
    .map((row) => {
      const document = decodeFirestoreDocument(row.document);
      return { path: document.path, fields: document.fields, updateTime: document.version };
    });
}

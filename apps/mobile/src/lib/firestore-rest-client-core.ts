import {
  decodeFirestoreDocument,
  encodeFirestoreFields,
  encodeFirestoreValue,
  firestoreDocumentReference,
  type DecodedFirestoreDocument,
  type FirestoreRestDocument,
} from '@timber/contract/firestore';

export class FirestoreAuthError extends Error {
  constructor(message = 'You must be signed in.', public readonly status?: number) {
    super(message);
    this.name = 'FirestoreAuthError';
  }
}

export class FirestorePermissionError extends Error {
  constructor(message = 'You do not have permission to perform this action.', public readonly status = 403) {
    super(message);
    this.name = 'FirestorePermissionError';
  }
}

export class FirestoreValidationError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'FirestoreValidationError';
  }
}

export class FirestoreNotFoundError extends Error {
  constructor(message = 'Document not found.') {
    super(message);
    this.name = 'FirestoreNotFoundError';
  }
}

export class FirestoreConflictError extends Error {
  constructor(message = 'Firestore document was modified by another device.') {
    super(message);
    this.name = 'FirestoreConflictError';
  }
}

export class FirestoreRateLimitError extends Error {
  constructor(public readonly retryAfterMs: number | null) {
    super('Firestore rate limited this request.');
    this.name = 'FirestoreRateLimitError';
  }
}

/** Network errors and 5xx responses are safe for the sync engine to back off and retry. */
export class FirestoreNetworkError extends Error {
  constructor(message: string, public readonly status?: number, cause?: unknown) {
    super(message, { cause });
    this.name = 'FirestoreNetworkError';
  }
}

export type FirestoreFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

export type FirestoreRequestLog = {
  method: string;
  url: string;
  status?: number;
  retried?: boolean;
  error?: string;
};

export type FirestoreClientDeps = {
  projectId: string;
  fetchImpl: FirestoreFetch;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  /** Optional while App Check is being rolled out; when supplied, a token becomes X-Firebase-AppCheck. */
  getAppCheckToken?: () => Promise<string | null>;
  documentsUrl?: string;
  log?: (entry: FirestoreRequestLog) => void;
};

export type FirestoreWrite = {
  path: string;
  fields?: Record<string, unknown>;
  updateMask?: string[];
  delete?: boolean;
  currentDocument?: { updateTime?: string } | { exists: boolean };
};

export type FirestoreQuery = {
  collectionId: string;
  parentPath?: string;
  where?: { field: string; op: 'EQUAL' | 'GREATER_THAN_OR_EQUAL' | 'LESS_THAN_OR_EQUAL' | 'ARRAY_CONTAINS'; value: unknown }[];
  orderBy?: { field: string; direction?: 'ASCENDING' | 'DESCENDING' }[];
  /** Direct client queries are intentionally bounded. Rules enforce the same maximum. */
  limit: number;
  startAfter?: unknown[];
};

export type FirestoreCommitResult = { version?: string };

function documentsUrl(deps: FirestoreClientDeps): string {
  return deps.documentsUrl ?? `https://firestore.googleapis.com/v1/projects/${deps.projectId}/databases/(default)/documents`;
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? Math.max(0, seconds * 1_000) : null;
}

function ensureBoundedQuery(query: FirestoreQuery): void {
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 200) {
    throw new FirestoreValidationError('Firestore queries require a limit from 1 to 200.');
  }
}

function ensureWriteMask(write: FirestoreWrite): void {
  if (!write.delete && (!write.updateMask || write.updateMask.length === 0)) {
    throw new FirestoreValidationError('Firestore writes require an explicit updateMask.');
  }
}

function documentName(deps: FirestoreClientDeps, path: string): string {
  return `projects/${deps.projectId}/databases/(default)/documents/${path}`;
}

async function request(
  deps: FirestoreClientDeps,
  method: string,
  url: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<unknown> {
  let retried = false;
  let status: number | undefined;
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const idToken = await deps.getIdToken(attempt === 1);
      if (!idToken) throw new FirestoreAuthError();
      const appCheckToken = await deps.getAppCheckToken?.();
      const { fetchImpl } = deps;
      let response: Awaited<ReturnType<FirestoreFetch>>;
      try {
        response = await fetchImpl(url, {
          method,
          headers: {
            Authorization: `Bearer ${idToken}`,
            ...(appCheckToken ? { 'X-Firebase-AppCheck': appCheckToken } : {}),
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal,
        });
      } catch (cause) {
        if (signal?.aborted) {
          const error = new Error('Request was cancelled.');
          error.name = 'AbortError';
          throw error;
        }
        throw new FirestoreNetworkError('Could not reach Firestore.', undefined, cause);
      }
      status = response.status;
      if (response.status === 401 && attempt === 0) {
        retried = true;
        continue;
      }
      if (response.status === 401) throw new FirestoreAuthError('Session expired — please sign in again.', 401);
      if (response.status === 403) throw new FirestorePermissionError();
      if (response.status === 404) throw new FirestoreNotFoundError();
      if (response.status === 409) throw new FirestoreConflictError();
      if (response.status === 429) throw new FirestoreRateLimitError(parseRetryAfter(response.headers.get('Retry-After')));
      if (response.status >= 500) throw new FirestoreNetworkError(`Firestore failed with ${response.status}.`, response.status);
      if (!response.ok) {
        // Firestore's body names the real cause — a missing composite index arrives here with
        // the console URL that creates it. Only read on the failure path.
        const failure = (await response.json().catch(() => undefined)) as { error?: { message?: unknown } } | undefined;
        const detail = typeof failure?.error?.message === 'string' ? ` ${failure.error.message}` : '';
        throw new FirestoreValidationError(`Firestore rejected this request (${response.status}).${detail}`, response.status);
      }
      deps.log?.({ method, url, status, retried: retried || undefined });
      return response.json().catch(() => undefined);
    }
    throw new FirestoreAuthError('Session expired — please sign in again.', 401);
  } catch (error) {
    const { name, message } = error as Error;
    deps.log?.({ method, url, status, retried: retried || undefined, error: message ? `${name}: ${message}` : name });
    throw error;
  }
}

export function createFirestoreRestClient(deps: FirestoreClientDeps) {
  const root = documentsUrl(deps);
  return {
    documentReference(path: string) {
      return firestoreDocumentReference(documentName(deps, path));
    },
    async getDocument(path: string, fieldPaths?: string[], signal?: AbortSignal): Promise<DecodedFirestoreDocument | undefined> {
      const query = fieldPaths?.length
        ? `?${fieldPaths.map((field) => `mask.fieldPaths=${encodeURIComponent(field)}`).join('&')}`
        : '';
      try {
        const body = (await request(deps, 'GET', `${root}/${path}${query}`, undefined, signal)) as FirestoreRestDocument;
        return decodeFirestoreDocument(body);
      } catch (error) {
        if (error instanceof FirestoreNotFoundError) return undefined;
        throw error;
      }
    },

    async commit(writes: FirestoreWrite[], signal?: AbortSignal): Promise<FirestoreCommitResult[]> {
      if (writes.length === 0) throw new FirestoreValidationError('Firestore commit requires at least one write.');
      writes.forEach(ensureWriteMask);
      const body = (await request(
        deps,
        'POST',
        `${root}:commit`,
        {
          writes: writes.map((write) => ({
            ...(write.delete
              ? { delete: documentName(deps, write.path) }
              : {
                  update: { name: documentName(deps, write.path), fields: encodeFirestoreFields(write.fields ?? {}) },
                  updateMask: { fieldPaths: write.updateMask },
                }),
            ...(write.currentDocument ? { currentDocument: write.currentDocument } : {}),
          })),
        },
        signal
      )) as { writeResults?: { updateTime?: string }[] };
      return writes.map((_, index) => ({ version: body.writeResults?.[index]?.updateTime }));
    },

    async runQuery(query: FirestoreQuery, signal?: AbortSignal): Promise<DecodedFirestoreDocument[]> {
      ensureBoundedQuery(query);
      const structuredQuery: Record<string, unknown> = { from: [{ collectionId: query.collectionId }], limit: query.limit };
      if (query.where?.length) {
        const filters = query.where.map((filter) => ({
          fieldFilter: { field: { fieldPath: filter.field }, op: filter.op, value: encodeFirestoreValue(filter.value) },
        }));
        structuredQuery.where = filters.length === 1 ? filters[0] : { compositeFilter: { op: 'AND', filters } };
      }
      if (query.orderBy?.length) {
        structuredQuery.orderBy = query.orderBy.map((order) => ({ field: { fieldPath: order.field }, direction: order.direction ?? 'ASCENDING' }));
      }
      if (query.startAfter?.length) {
        structuredQuery.startAt = { values: query.startAfter.map(encodeFirestoreValue), before: false };
      }
      const parent = query.parentPath ? `${root}/${query.parentPath}` : root;
      const body = (await request(deps, 'POST', `${parent}:runQuery`, { structuredQuery }, signal)) as { document?: FirestoreRestDocument }[];
      return body.filter((row): row is { document: FirestoreRestDocument } => !!row.document).map((row) => decodeFirestoreDocument(row.document));
    },
  };
}

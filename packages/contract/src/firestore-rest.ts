import { z } from 'zod';

/**
 * The small Firestore REST wire surface shared by direct clients and the
 * privileged Worker. This intentionally has no Firebase runtime dependency.
 */

export type FirestoreValue =
  | { nullValue: null }
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { timestampValue: string }
  | { referenceValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

export type DecodedFirestoreValue =
  | string
  | number
  | boolean
  | null
  | DecodedFirestoreValue[]
  | { [key: string]: DecodedFirestoreValue };

/** Marks an ISO timestamp for Firestore's timestamp wire type. */
export class FirestoreTimestamp {
  constructor(public readonly iso: string) {}
}

export function firestoreTimestamp(iso: string): FirestoreTimestamp {
  return new FirestoreTimestamp(iso);
}

/** Marks a full Firestore document name for cursor values such as __name__. */
export class FirestoreDocumentReference {
  constructor(public readonly name: string) {}
}

export function firestoreDocumentReference(name: string): FirestoreDocumentReference {
  return new FirestoreDocumentReference(name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function encodeFirestoreValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof FirestoreTimestamp) return { timestampValue: value.iso };
  if (value instanceof FirestoreDocumentReference) return { referenceValue: value.name };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Firestore numbers must be finite');
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  if (isRecord(value)) return { mapValue: { fields: encodeFirestoreFields(value) } };
  throw new Error(`Unsupported Firestore value: ${String(value)}`);
}

export function decodeFirestoreValue(value: FirestoreValue): DecodedFirestoreValue {
  if (!isRecord(value)) throw new Error('Malformed Firestore value');
  if ('nullValue' in value && value.nullValue === null) return null;
  if ('stringValue' in value && typeof value.stringValue === 'string') return value.stringValue;
  if ('timestampValue' in value && typeof value.timestampValue === 'string') return value.timestampValue;
  if ('referenceValue' in value && typeof value.referenceValue === 'string') return value.referenceValue;
  if ('integerValue' in value && typeof value.integerValue === 'string') {
    const number = Number(value.integerValue);
    if (!Number.isSafeInteger(number)) throw new Error(`Malformed Firestore integer: ${value.integerValue}`);
    return number;
  }
  if ('doubleValue' in value && typeof value.doubleValue === 'number' && Number.isFinite(value.doubleValue)) return value.doubleValue;
  if ('booleanValue' in value && typeof value.booleanValue === 'boolean') return value.booleanValue;
  if ('arrayValue' in value && isRecord(value.arrayValue)) {
    const values = value.arrayValue.values;
    if (values !== undefined && !Array.isArray(values)) throw new Error('Malformed Firestore array');
    return (values ?? []).map((entry) => decodeFirestoreValue(entry as FirestoreValue));
  }
  if ('mapValue' in value && isRecord(value.mapValue)) {
    const fields = value.mapValue.fields;
    if (fields !== undefined && !isRecord(fields)) throw new Error('Malformed Firestore map');
    return decodeFirestoreFields((fields ?? {}) as Record<string, FirestoreValue>);
  }
  throw new Error(`Unsupported Firestore value: ${JSON.stringify(value)}`);
}

export function encodeFirestoreFields(fields: Record<string, unknown>): Record<string, FirestoreValue> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encodeFirestoreValue(value)]));
}

export function decodeFirestoreFields(fields: Record<string, FirestoreValue>): Record<string, DecodedFirestoreValue> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]));
}

const segment = z.string().min(1).max(1_500).regex(/^[^/]+$/, 'Firestore path segments cannot contain /');

function pathSegment(value: string): string {
  return segment.parse(value);
}

/** Canonical paths only. Callers must not concatenate unvalidated path segments. */
export const firestorePaths = {
  user: (uid: string) => `users/${pathSegment(uid)}`,
  injury: (uid: string, injuryId: string) => `users/${pathSegment(uid)}/injuries/${pathSegment(injuryId)}`,
  pushupChallenge: (uid: string) => `users/${pathSegment(uid)}/pushup-challenge/data`,
  privateAiUsage: (uid: string) => `users/${pathSegment(uid)}/private/aiUsage`,
  privateNotifications: (uid: string) => `users/${pathSegment(uid)}/private/notifications`,
  workout: (workoutId: string) => `workouts/${pathSegment(workoutId)}`,
  exercise: (exerciseId: string) => `exercises/${pathSegment(exerciseId)}`,
  catalogMeta: () => 'exerciseCatalogMeta/current',
  dailyName: (date: string) => `random/${pathSegment(date)}`,
} as const;

export interface FirestoreRestDocument {
  /** Fully-qualified REST name or path relative to the documents root. */
  name: string;
  fields?: Record<string, FirestoreValue>;
  updateTime: string;
}

export interface DecodedFirestoreDocument {
  path: string;
  fields: Record<string, DecodedFirestoreValue>;
  /** Opaque Firestore updateTime. It is never synthesized for a missing doc. */
  version: string;
}

export function firestoreDocumentPath(name: string): string {
  const marker = '/documents/';
  const index = name.indexOf(marker);
  return index === -1 ? name : name.slice(index + marker.length);
}

/** Parses a present Firestore REST document. Missing documents stay `undefined` at the transport layer. */
export function decodeFirestoreDocument(document: FirestoreRestDocument): DecodedFirestoreDocument {
  const version = z.string().min(1).parse(document.updateTime);
  const path = z.string().min(1).parse(firestoreDocumentPath(document.name));
  return { path, fields: decodeFirestoreFields(document.fields ?? {}), version };
}

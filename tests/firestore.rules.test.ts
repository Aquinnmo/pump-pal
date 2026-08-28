import assert from 'node:assert/strict';
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, limit, query, setDoc, Timestamp, where, collection } from 'firebase/firestore';
import fs from 'node:fs';

const rules = fs.readFileSync('firestore.rules', 'utf8');
const now = Timestamp.fromDate(new Date('2026-08-12T12:00:00Z'));
let env: RulesTestEnvironment;

const split = { type: 'Full Body', custom: null, updatedAt: now };
const injury = { id: 'inj-1', bodyPart: 'shoulder', severity: 'mild', status: 'ongoing', onsetDate: now, createdAt: now, updatedAt: now };
const workout = { userId: 'owner', name: 'Push', performedExercises: [], schemaVersion: 2, createdAt: now, updatedAt: now };

async function seed(path: string, data: unknown) {
  await env.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), path), data));
}

async function main() {
  env = await initializeTestEnvironment({ projectId: 'timber-rules-test', firestore: { rules } });
  await seed('users/owner', { workoutSplit: split, username: 'server-only', usernameLower: 'server-only' });
  await seed('users/legacy-invalid-split', {
    workoutSplit: { type: 'Not a split', custom: null, updatedAt: now },
    username: 'legacy',
  });
  await seed('users/owner/injuries/inj-1', injury);
  await seed('users/owner/private/aiUsage', { date: '2026-08-12', count: 1 });
  await seed('users/owner/private/notifications', { expoPushToken: 'ExponentPushToken[token]', updatedAt: now });
  await seed('users/owner/pushup-challenge/data', { startDate: '2026-08-01', days: [], longestStreak: 0 });
  await seed('workouts/w1', workout);
  await seed('workouts/w2', { ...workout, userId: 'other' });
  await seed('exercises/approved', { status: 'approved' });
  await seed('exercises/pending', { status: 'pending_review' });
  await seed('exerciseCatalogMeta/current', { version: 1, exerciseCount: 1 });
  await seed('random/2026-08-12', { name: 'Test challenge' });

  const owner = env.authenticatedContext('owner').firestore();
  const other = env.authenticatedContext('other').firestore();
  const legacyOwner = env.authenticatedContext('legacy-invalid-split').firestore();
  const anonymous = env.unauthenticatedContext().firestore();

  await assertFails(getDoc(doc(anonymous, 'users/owner')));
  await assertSucceeds(getDoc(doc(owner, 'users/owner')));
  await assertFails(getDoc(doc(other, 'users/owner')));
  await assertFails(getDocs(query(collection(owner, 'users'), limit(20))));
  await assertFails(setDoc(doc(owner, 'users/create-with-server-fields'), { workoutSplit: split, username: 'server-only' }));
  await assertFails(setDoc(doc(legacyOwner, 'users/legacy-invalid-split'), { aiEnabled: true }, { merge: true }));
  await assertFails(setDoc(doc(owner, 'users/owner'), { ...split, username: 'nope' }));
  await assertSucceeds(setDoc(doc(owner, 'users/owner'), { workoutSplit: split }, { merge: true }));
  // aiEnabled is the AI opt-in. Owner-writable on its own — a merge that touches
  // no workoutSplit must still pass — but only as a real boolean.
  await assertSucceeds(setDoc(doc(owner, 'users/owner'), { aiEnabled: true }, { merge: true }));
  await assertSucceeds(setDoc(doc(owner, 'users/owner'), { aiEnabled: false }, { merge: true }));
  await assertFails(setDoc(doc(owner, 'users/owner'), { aiEnabled: 'yes' }, { merge: true }));
  await assertFails(setDoc(doc(other, 'users/owner'), { aiEnabled: true }, { merge: true }));
  await assertSucceeds(setDoc(doc(owner, 'users/owner'), { socialEnabled: false }, { merge: true }));
  await assertSucceeds(setDoc(doc(owner, 'users/owner'), { socialEnabled: true }, { merge: true }));
  await assertFails(setDoc(doc(owner, 'users/owner'), { socialEnabled: 'no' }, { merge: true }));
  await assertFails(setDoc(doc(other, 'users/owner'), { socialEnabled: false }, { merge: true }));
  await assertFails(deleteDoc(doc(owner, 'users/owner')));

  await assertSucceeds(getDocs(query(collection(owner, 'users/owner/injuries'), limit(20))));
  await assertSucceeds(getDocs(query(collection(owner, 'users/owner/injuries'), limit(200))));
  await assertFails(getDocs(query(collection(owner, 'users/owner/injuries'), limit(201))));
  await assertFails(getDocs(query(collection(other, 'users/owner/injuries'), limit(20))));
  await assertFails(setDoc(doc(owner, 'users/owner/injuries/inj-2'), { ...injury, id: 'wrong-id' }));
  await assertFails(setDoc(doc(owner, 'users/owner/injuries/inj-2'), { id: 'inj-2', bodyPart: 'shoulder', severity: 'mild' }));
  await assertFails(setDoc(doc(owner, 'users/owner/injuries/inj-1'), { ...injury, createdAt: Timestamp.now() }));
  await assertSucceeds(deleteDoc(doc(owner, 'users/owner/injuries/inj-1')));

  await assertSucceeds(getDoc(doc(owner, 'users/owner/private/aiUsage')));
  await assertFails(setDoc(doc(owner, 'users/owner/private/aiUsage'), { date: '2026-08-12', count: 0 }));
  await assertFails(getDoc(doc(owner, 'users/owner/private/notifications')));
  await assertSucceeds(setDoc(doc(owner, 'users/owner/private/notifications'), { expoPushToken: 'ExponentPushToken[next]', updatedAt: now }));
  await assertSucceeds(deleteDoc(doc(owner, 'users/owner/private/notifications')));

  await assertSucceeds(getDoc(doc(owner, 'users/owner/pushup-challenge/data')));
  await assertFails(getDoc(doc(other, 'users/owner/pushup-challenge/data')));
  await assertSucceeds(setDoc(doc(owner, 'users/owner/pushup-challenge/data'), { startDate: '2026-08-01', days: [], longestStreak: 0 }));
  await assertFails(setDoc(doc(owner, 'users/owner/pushup-challenge/data'), { startDate: 'nope', days: [], longestStreak: 0 }));

  await assertSucceeds(getDocs(query(collection(owner, 'workouts'), where('userId', '==', 'owner'), limit(20))));
  await assertSucceeds(getDocs(query(collection(owner, 'workouts'), where('userId', '==', 'owner'), limit(1))));
  await assertSucceeds(getDocs(query(collection(owner, 'workouts'), where('userId', '==', 'owner'), limit(200))));
  await assertFails(getDocs(query(collection(owner, 'workouts'), where('userId', '==', 'other'), limit(20))));
  await assertFails(getDocs(query(collection(owner, 'workouts'), limit(20))));
  await assertFails(getDocs(query(collection(owner, 'workouts'), where('userId', '==', 'owner'), limit(201))));
  await assertFails(setDoc(doc(owner, 'workouts/w-invalid-schema'), { ...workout, schemaVersion: 1 }));
  await assertFails(setDoc(doc(owner, 'workouts/w-unknown-field'), { ...workout, unknownField: true }));
  await assertFails(setDoc(doc(owner, 'workouts/w1'), { ...workout, userId: 'other' }));
  await assertFails(setDoc(doc(other, 'workouts/w3'), workout));
  await assertSucceeds(setDoc(doc(owner, 'workouts/w3'), workout));
  await assertSucceeds(deleteDoc(doc(owner, 'workouts/w1')));

  await assertSucceeds(getDocs(query(collection(owner, 'exercises'), where('status', '==', 'approved'), limit(20))));
  await assertFails(getDocs(query(collection(owner, 'exercises'), limit(20))));
  await assertFails(getDoc(doc(owner, 'exercises/pending')));
  await assertSucceeds(getDoc(doc(owner, 'exerciseCatalogMeta/current')));
  await assertFails(getDoc(doc(anonymous, 'exerciseCatalogMeta/current')));
  await assertFails(setDoc(doc(owner, 'exerciseCatalogMeta/current'), { version: 2, exerciseCount: 2 }));
  await assertSucceeds(getDoc(doc(owner, 'random/2026-08-12')));
  await assertFails(getDoc(doc(anonymous, 'random/2026-08-12')));
  await assertFails(setDoc(doc(owner, 'random/2026-08-12'), { name: 'Overwrite attempt' }));
  await assertFails(getDoc(doc(owner, 'usernames/server-only')));
  await assertFails(getDoc(doc(owner, 'friendships/owner_other')));
  await assertFails(getDoc(doc(owner, 'users/owner/workouts/legacy')));

  await env.cleanup();
  console.log('firestore-rules: all assertions passed');
}

void main().catch(async (error) => { await env?.cleanup(); throw error; });

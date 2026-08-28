import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mock } from 'bun:test';

type Profile = { data?: { workoutSplit?: { type?: string; custom?: string | null } } } | null;

let currentProfile: Profile = null;
let generated: string[] = [];
let generateCalls: string[] = [];
let generationError: unknown = null;

// Both dependencies are seams of this resolver. Mocking them before the
// dynamic import keeps these tests deterministic and avoids a network/Firebase
// request while still exercising loadSplitNames itself.
mock.module(new URL('../data/profile-repository.web.ts', import.meta.url).pathname, () => ({
  profileRepository: { get: async () => currentProfile },
}));
mock.module('@/lib/workout-suggestions', () => ({
  generateSplitWorkoutNames: async (description: string) => {
    generateCalls.push(description);
    if (generationError) throw generationError;
    return generated;
  },
}));

const { loadSplitNames } = await import('./split-names');

function profile(type: string, custom: string | null = null): Profile {
  return { data: { workoutSplit: { type, custom } } };
}

await AsyncStorage.clear();

// Presets are constant lookups; an absent profile and an unknown split resolve
// to the empty list rather than attempting AI generation.
currentProfile = profile('Push / Pull / Legs');
assert.deepEqual(await loadSplitNames('uid-1'), ['Push', 'Pull', 'Legs']);
currentProfile = profile('Other');
assert.deepEqual(await loadSplitNames('uid-1'), []);
currentProfile = null;
assert.deepEqual(await loadSplitNames('uid-1'), []);

// A malformed cached payload is swallowed. For Other the fallback is the
// constant empty array, and a cache hit must not invoke the AI generator.
{
  const description = 'Custom Split';
  const key = 'pumppal_split_names_v2_custom_split';
  await AsyncStorage.setItem(key, '{not-json');
  generated = ['Should not be requested'];
  generateCalls = [];
  generationError = null;
  currentProfile = profile('Other', description);

  assert.deepEqual(await loadSplitNames('uid-1'), []);
  assert.deepEqual(generateCalls, []);
}

// The v2 key intentionally truncates the normalized description to 60
// characters. Distinct descriptions sharing that prefix therefore collide;
// pin the current cache behavior so a refactor cannot silently change it.
{
  const prefix = 'A'.repeat(60);
  const first = `${prefix} first plan`;
  const second = `${prefix} second plan`;
  await AsyncStorage.clear();
  generated = ['First day', 'Second day'];
  generateCalls = [];
  generationError = null;

  currentProfile = profile('Other', first);
  assert.deepEqual(await loadSplitNames('uid-1'), generated);

  generated = ['Different day'];
  currentProfile = profile('Other', second);
  assert.deepEqual(
    await loadSplitNames('uid-1'),
    ['First day', 'Second day'],
    'descriptions with the same first 60 normalized characters share the cache entry',
  );
  assert.deepEqual(generateCalls, [first]);
}

// A generation failure leaves the caller usable with Other's empty fallback.
{
  await AsyncStorage.clear();
  currentProfile = profile('Other', 'offline custom split');
  generated = [];
  generateCalls = [];
  generationError = new Error('offline');
  assert.deepEqual(await loadSplitNames('uid-1'), []);
  assert.deepEqual(generateCalls, ['offline custom split']);
}

console.log('split-names: all assertions passed');

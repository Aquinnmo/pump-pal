import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNormalizeAutoFill, setNormalizeAutoFill } from './use-normalize-autofill';

// Missing key means on.
assert.equal(await getNormalizeAutoFill(), true);

// A toggle updates the in-memory value and persists.
await setNormalizeAutoFill(false);
assert.equal(await getNormalizeAutoFill(), false);
assert.equal(await AsyncStorage.getItem('pumppal_normalize_autofill'), 'false');

await setNormalizeAutoFill(true);
assert.equal(await getNormalizeAutoFill(), true);

console.log('use-normalize-autofill: all assertions passed');

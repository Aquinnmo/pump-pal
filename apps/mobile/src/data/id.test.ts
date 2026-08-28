import assert from 'node:assert/strict';
import { randomId } from './id';

const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

try {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { randomUUID: () => 'uuid-from-platform', getRandomValues: () => { throw new Error('not expected'); } },
  });
  assert.equal(randomId(), 'uuid-from-platform', 'platform UUIDs are used without adding a prefix');
  assert.equal(randomId('workout'), 'workout_uuid-from-platform', 'prefixes are separated from UUIDs');

  const bytes = new Uint8Array(16);
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      getRandomValues(target: Uint8Array) {
        target.set(bytes.map((_value, index) => index));
        return target;
      },
    },
  });
  assert.equal(
    randomId('draft'),
    'draft_000102030405060708090a0b0c0d0e0f',
    'the getRandomValues path produces a stable 16-byte hexadecimal id'
  );
} finally {
  if (originalDescriptor) Object.defineProperty(globalThis, 'crypto', originalDescriptor);
  else delete (globalThis as { crypto?: unknown }).crypto;
}

console.log('src/data/id.test.ts: all assertions passed');

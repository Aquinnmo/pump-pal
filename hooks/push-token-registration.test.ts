import assert from 'node:assert/strict';
import { persistPushToken, pushTokenCacheKey } from './push-token-registration.js';

assert.notEqual(pushTokenCacheKey('user-a'), pushTokenCacheKey('user-b'));

async function run() {
  {
    const registered: string[] = [];
    const cached = new Map([[pushTokenCacheKey('user-a'), 'token-a']]);
    const changed = await persistPushToken('user-a', 'token-a', {
      getCachedToken: async (key) => cached.get(key) ?? null,
      setCachedToken: async (key, token) => void cached.set(key, token),
      registerToken: async (token) => void registered.push(token),
    });

    assert.equal(changed, false);
    assert.deepEqual(registered, []);
  }

  {
    const registered: string[] = [];
    const cached = new Map([[pushTokenCacheKey('user-a'), 'shared-device-token']]);
    const changed = await persistPushToken('user-b', 'shared-device-token', {
      getCachedToken: async (key) => cached.get(key) ?? null,
      setCachedToken: async (key, token) => void cached.set(key, token),
      registerToken: async (token) => void registered.push(token),
    });

    assert.equal(changed, true);
    assert.deepEqual(registered, ['shared-device-token']);
    assert.equal(cached.get(pushTokenCacheKey('user-b')), 'shared-device-token');
  }

  {
    const cached = new Map<string, string>();
    await assert.rejects(
      persistPushToken('user-a', 'token-a', {
        getCachedToken: async (key) => cached.get(key) ?? null,
        setCachedToken: async (key, token) => void cached.set(key, token),
        registerToken: async () => {
          throw new Error('profile write failed');
        },
      }),
      /profile write failed/
    );
    assert.equal(cached.size, 0, 'a failed profile write must not poison the local cache');
  }

  console.log('push-token-registration: all assertions passed');
}

run();

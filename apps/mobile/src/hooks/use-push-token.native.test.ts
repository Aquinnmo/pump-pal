import assert from 'node:assert/strict';
import { it, mock } from 'bun:test';

const auth = { currentUser: null as { uid: string } | null };
const patched: string[] = [];

// Tests resolve `.web` siblings first (see tests/setup.ts), so mock that file.
mock.module(new URL('../config/firebase.web.ts', import.meta.url).pathname, () => ({ auth }));
mock.module(new URL('../data/remote/profile.ts', import.meta.url).pathname, () => ({
  patchProfile: async ({ expoPushToken }: { expoPushToken: string }) => {
    patched.push(`${auth.currentUser?.uid}:${expoPushToken}`);
    return {};
  },
}));

// expo-constants is a setup-level stub; give it the EAS projectId register() needs.
const Constants = (await import('expo-constants')).default;
Constants.expoConfig!.extra = { eas: { projectId: 'p' } };

const { register } = await import('./use-push-token.native');

it('registers the same device token again when the signed-in account changes', async () => {
  await register();
  assert.deepEqual(patched, []);

  auth.currentUser = { uid: 'a' };
  await register();
  await register();
  auth.currentUser = { uid: 'b' };
  await register();

  assert.deepEqual(patched, ['a:test-push-token', 'b:test-push-token']);
});

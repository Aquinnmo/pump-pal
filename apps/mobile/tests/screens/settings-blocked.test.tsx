import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, mock } from 'bun:test';
import type { ReactNode } from 'react';

let blocks: Array<{ uid: string; username: string }> = [];
let loadError: Error | null = null;
const unblockCalls: string[] = [];
let backCalls = 0;

mock.module(new URL('../../src/data/remote/buddies.ts', import.meta.url).pathname, () => ({
  getBlocks: async () => {
    if (loadError) throw loadError;
    return blocks;
  },
  unblockUser: async (uid: string) => { unblockCalls.push(uid); },
}));
mock.module(new URL('../../src/ui/primitives/fading-scroll-view.tsx', import.meta.url).pathname, () => ({
  FadingScrollView: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
mock.module('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span aria-label={`${name} icon`} />,
}));
mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
const { router: testRouter } = await import('expo-router') as unknown as { router: { back: () => void } };
const { default: SettingsBlockedScreen } = await import('../../app/settings-blocked');

beforeEach(() => {
  blocks = [];
  loadError = null;
  unblockCalls.length = 0;
  backCalls = 0;
  testRouter.back = () => { backCalls += 1; };
});
afterEach(cleanup);

describe('SettingsBlockedScreen', () => {
  it('explains the empty state', async () => {
    render(<SettingsBlockedScreen />);
    await waitFor(() => assert.ok(screen.getByText('No blocked users', { exact: true })));
  });

  it('lists blocked users and unblocks one', async () => {
    blocks = [{ uid: 'u1', username: 'sam' }, { uid: 'u2', username: '' }];
    render(<SettingsBlockedScreen />);
    await waitFor(() => assert.ok(screen.getByText('sam', { exact: true })));
    assert.ok(screen.getByText('Unknown user', { exact: true }));

    fireEvent.click(screen.getByRole('button', { name: 'Unblock sam' }));
    await waitFor(() => assert.deepEqual(unblockCalls, ['u1']));
    await waitFor(() => assert.equal(screen.queryByText('sam', { exact: true }), null));
  });

  it('retries a failed load', async () => {
    loadError = new Error('offline');
    render(<SettingsBlockedScreen />);
    await waitFor(() => assert.ok(screen.getByText('Could not load your blocked users. Tap to retry.', { exact: true })));

    loadError = null;
    fireEvent.click(screen.getByText('Could not load your blocked users. Tap to retry.', { exact: true }));
    await waitFor(() => assert.ok(screen.getByText('No blocked users', { exact: true })));
  });

  it('goes back through the normal control', async () => {
    render(<SettingsBlockedScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    assert.equal(backCalls, 1);
  });
});

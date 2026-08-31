import assert from 'node:assert/strict';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, mock } from 'bun:test';
import type { ChallengeData } from '@/types/pushup-challenge';

const user = { uid: 'pushup-controller-test-user' };
let storedData: ChallengeData | null = null;
const upserts: ChallengeData[] = [];
const syncCalls: string[] = [];

mock.module('@/context/auth-context', () => ({
  useAuth: () => ({ user, loading: false }),
}));
mock.module(new URL('../models/pushup-repository.web.ts', import.meta.url).pathname, () => ({
  pushupRepository: {
    get: async () => storedData ? { id: 'pushup_challenge', data: storedData } : null,
    upsert: async (_uid: string, data: ChallengeData) => {
      upserts.push(data);
      storedData = data;
    },
  },
}));
mock.module(new URL('../models/sync-trigger.web.ts', import.meta.url).pathname, () => ({
  triggerSyncAfterWrite: () => syncCalls.push('trigger-sync'),
}));

const RealDate = Date;

function freezeNow(iso: string): void {
  const milliseconds = RealDate.parse(iso);
  class FrozenDate extends RealDate {
    constructor(value?: string | number | Date) {
      if (value === undefined) super(milliseconds);
      else if (value instanceof RealDate) super(value.getTime());
      else super(value);
    }

    static now(): number {
      return milliseconds;
    }
  }

  globalThis.Date = FrozenDate as unknown as DateConstructor;
}

beforeEach(() => {
  freezeNow('2026-08-12T16:00:00.000Z');
  storedData = {
    startDate: '2026-08-10',
    days: [{ date: '2026-08-10', dayNumber: 1, completedAt: '2026-08-10T16:00:00.000Z' }],
    longestStreak: 1,
  };
  upserts.length = 0;
  syncCalls.length = 0;
});

describe('usePushupChallenge', () => {
  it('completes today once and treats a second completion as already done', async () => {
    const { usePushupChallenge } = await import('./use-pushup-challenge');
    const rendered = renderHook(() => usePushupChallenge());
    await waitFor(() => assert.deepEqual(rendered.result.current.data, storedData));

    let firstResult: 'already-done' | 'completed' = 'already-done';
    await act(async () => {
      firstResult = await rendered.result.current.completeToday();
    });
    assert.equal(firstResult, 'completed');
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0]?.days.at(-1)?.date, '2026-08-12');
    assert.deepEqual(syncCalls, ['trigger-sync']);

    let secondResult: 'already-done' | 'completed' = 'completed';
    await act(async () => {
      secondResult = await rendered.result.current.completeToday();
    });
    assert.equal(secondResult, 'already-done');
    assert.equal(upserts.length, 1);

    rendered.unmount();
  });
});

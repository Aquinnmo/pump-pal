import assert from 'node:assert/strict';
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { TEMPORARY_AI_DAILY_LIMIT } from '@timber/contract/ai';
import { decodeFirestoreFields, encodeFirestoreFields } from '@timber/contract/firestore';
import { decodeFields, encodeFields } from './rest.js';

type UsageDoc = { fields: { date: string; count: number }; updateTime: string };

let getDocMock: (path: string, fieldPaths?: string[]) => Promise<UsageDoc | undefined> = async () => undefined;
let commitMock: (writes: unknown[]) => Promise<unknown[]> = async () => [];

mock.module('./rest.js', () => ({
  getDoc: (...args: Parameters<typeof getDocMock>) => getDocMock(...args),
  commit: (...args: Parameters<typeof commitMock>) => commitMock(...args),
  decodeFields: decodeFirestoreFields,
  encodeFields: encodeFirestoreFields,
}));

const quota = await import('./quota.js');

// Fixed dates so the test never depends on the wall clock.
const TODAY = '2026-08-03';
const YESTERDAY = '2026-08-02';
const FUTURE = '2026-08-04';
const LIMIT = TEMPORARY_AI_DAILY_LIMIT;

// No record yet: first call of the user's life.
assert.deepEqual(quota.nextUsage(undefined, TODAY), { date: TODAY, count: 1 });

// Within the same day the counter walks up to the limit.
assert.deepEqual(quota.nextUsage({ date: TODAY, count: LIMIT - 1 }, TODAY), { date: TODAY, count: LIMIT });

// At the limit, the claim is refused.
assert.equal(quota.nextUsage({ date: TODAY, count: LIMIT }, TODAY), null);

// Defensive: a counter above the limit (manual edit, changed limit) stays refused.
assert.equal(quota.nextUsage({ date: TODAY, count: 99 }, TODAY), null);

// A stale record rolls over instead of blocking — this is what makes the quota
// reset daily without a scheduled job.
assert.deepEqual(quota.nextUsage({ date: YESTERDAY, count: LIMIT }, TODAY), { date: TODAY, count: 1 });

// Rollover is equality-based, so a future-dated record also starts today's
// counter from one rather than carrying its count forward.
assert.deepEqual(quota.nextUsage({ date: FUTURE, count: LIMIT }, TODAY), { date: TODAY, count: 1 });

// quotaStatus is what GET /api/ai/quota serves — the client renders `remaining`
// rather than deriving it from a bundled limit, so these two must agree with
// nextUsage or the button and the enforcement disagree.

// No record: a full quota, and the limit travels with it.
assert.deepEqual(quota.quotaStatus(undefined, TODAY), { remaining: LIMIT, limit: LIMIT, date: TODAY });

// Today's record is subtracted.
assert.equal(quota.quotaStatus({ date: TODAY, count: 2 }, TODAY).remaining, LIMIT - 2);

// Same rollover as nextUsage: yesterday's record reads as a full quota.
assert.equal(quota.quotaStatus({ date: YESTERDAY, count: LIMIT }, TODAY).remaining, LIMIT);
assert.equal(quota.quotaStatus({ date: FUTURE, count: LIMIT }, TODAY).remaining, LIMIT);

// At the limit, zero — and nextUsage refuses at exactly the same point.
assert.equal(quota.quotaStatus({ date: TODAY, count: LIMIT }, TODAY).remaining, 0);
assert.equal(quota.nextUsage({ date: TODAY, count: LIMIT }, TODAY), null);

// Never negative: a lowered limit must not render as "-3 left".
assert.equal(quota.quotaStatus({ date: TODAY, count: 99 }, TODAY, 10).remaining, 0);

// todayUTC is UTC, not local: 00:30 UTC belongs to that UTC day regardless of
// the server's timezone.
assert.equal(quota.todayUTC(new Date('2026-08-03T00:30:00Z')), '2026-08-03');
assert.equal(quota.todayUTC(new Date('2026-08-03T23:59:59Z')), '2026-08-03');

// Firestore REST value codec: round-trip the two shapes this code touches.
// integerValue is a STRING on the wire — encodeFields must produce that, and
// decodeFields must turn it back into a JS number.
const encodedUsage = encodeFields({ aiUsage: { date: TODAY, count: 2 } });
assert.deepEqual(encodedUsage, {
  aiUsage: {
    mapValue: {
      fields: {
        date: { stringValue: TODAY },
        count: { integerValue: '2' },
      },
    },
  },
});
assert.deepEqual(decodeFields(encodedUsage), { aiUsage: { date: TODAY, count: 2 } });

const encodedName = encodeFields({ name: 'Aldric' });
assert.deepEqual(encodedName, { name: { stringValue: 'Aldric' } });
assert.deepEqual(decodeFields(encodedName), { name: 'Aldric' });

// AI opt-in fails closed: only a literal `true` enables it. A missing doc, a
// missing field, and every truthy near-miss all mean "this user did not agree
// to have their workout history sent to a provider".
assert.equal(quota.isAIEnabledField(true), true);
for (const value of [undefined, null, false, 'true', 1, {}, []]) {
  assert.equal(quota.isAIEnabledField(value), false, `aiEnabled=${JSON.stringify(value) ?? 'undefined'} must not enable AI`);
}

describe('quota store write behavior', () => {
  beforeEach(() => {
    getDocMock = async () => undefined;
    commitMock = async () => [];
  });

  it('commits a quota claim before resolving to the caller', async () => {
    const today = quota.todayUTC();
    const sequence: string[] = [];
    let committedWrites: unknown[] = [];

    getDocMock = async () => {
      sequence.push('read');
      return { fields: { date: today, count: 0 }, updateTime: 'v1' };
    };
    commitMock = async (writes) => {
      sequence.push('commit');
      committedWrites = writes;
      return [{ updateTime: 'v2' }];
    };

    const remaining = await quota.consumeQuota('uid-1');

    expect(sequence).toEqual(['read', 'commit']);
    expect(remaining).toBe(LIMIT - 1);
    expect(committedWrites).toEqual([
      {
        path: 'users/uid-1/private/aiUsage',
        fields: { date: today, count: 1 },
        updateMask: ['date', 'count'],
        currentDocument: { updateTime: 'v1' },
      },
    ]);
  });

  it('retries a conflicting claim twice and succeeds on the third attempt', async () => {
    const today = quota.todayUTC();
    let reads = 0;
    let commits = 0;
    const committedCounts: number[] = [];
    const committedVersions: string[] = [];

    getDocMock = async () => {
      const count = reads++;
      return { fields: { date: today, count }, updateTime: `v${count + 1}` };
    };
    commitMock = async (writes) => {
      const write = writes[0] as { fields: { count: number }; currentDocument: { updateTime: string } };
      committedCounts.push(write.fields.count);
      committedVersions.push(write.currentDocument.updateTime);
      commits += 1;
      if (commits < 3) throw Object.assign(new Error('conflict'), { status: 409 });
      return [];
    };

    const remaining = await quota.consumeQuota('uid-1');

    expect(remaining).toBe(LIMIT - 3);
    expect(reads).toBe(3);
    expect(commits).toBe(3);
    expect(committedCounts).toEqual([1, 2, 3]);
    expect(committedVersions).toEqual(['v1', 'v2', 'v3']);
  });

  it('throws the final 409 after exactly three conflicting attempts', async () => {
    const today = quota.todayUTC();
    let reads = 0;
    let commits = 0;

    getDocMock = async () => ({ fields: { date: today, count: reads++ }, updateTime: `v${reads}` });
    commitMock = async () => {
      commits += 1;
      throw Object.assign(new Error('conflict'), { status: 409 });
    };

    await assert.rejects(() => quota.consumeQuota('uid-1'), (error: unknown) => (error as { status?: number }).status === 409);
    expect(reads).toBe(3);
    expect(commits).toBe(3);
  });

  it('throws a 429 at the cap without attempting a commit', async () => {
    const today = quota.todayUTC();
    let commits = 0;

    getDocMock = async () => ({ fields: { date: today, count: LIMIT }, updateTime: 'v1' });
    commitMock = async () => {
      commits += 1;
      return [];
    };

    await assert.rejects(
      () => quota.consumeQuota('uid-1'),
      (error: unknown) => (error as { status?: number }).status === 429
    );
    expect(commits).toBe(0);
  });

  it('refunds one claim while the stored date is still today', async () => {
    const today = quota.todayUTC();
    let committedWrites: unknown[] = [];

    getDocMock = async () => ({ fields: { date: today, count: 2 }, updateTime: 'v1' });
    commitMock = async (writes) => {
      committedWrites = writes;
      return [];
    };

    await quota.refundQuota('uid-1');

    expect(committedWrites).toEqual([
      {
        path: 'users/uid-1/private/aiUsage',
        fields: { date: today, count: 1 },
        updateMask: ['date', 'count'],
        currentDocument: { updateTime: 'v1' },
      },
    ]);
  });

  it('does not refund a record from another UTC date', async () => {
    let commits = 0;

    getDocMock = async () => ({ fields: { date: '2000-01-01', count: 2 }, updateTime: 'v1' });
    commitMock = async () => {
      commits += 1;
      return [];
    };

    await quota.refundQuota('uid-1');

    expect(commits).toBe(0);
  });

  it('swallows read and commit errors while refunding', async () => {
    const originalConsoleError = console.error;
    console.error = () => undefined;

    try {
      getDocMock = async () => {
        throw new Error('read failed');
      };
      await quota.refundQuota('uid-1');

      const today = quota.todayUTC();
      getDocMock = async () => ({ fields: { date: today, count: 2 }, updateTime: 'v1' });
      commitMock = async () => {
        throw new Error('write failed');
      };
      await quota.refundQuota('uid-1');
    } finally {
      console.error = originalConsoleError;
    }
  });
});

console.log('quota: all assertions passed');

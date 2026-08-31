import assert from 'node:assert/strict';
import { describe, it } from 'bun:test';
import type { ChallengeData } from '@/types/pushup-challenge';
import { buildTimeline, currentStreakLength, isStreakAlive } from './pushup-timeline';

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

function challenge(overrides: Partial<ChallengeData> = {}): ChallengeData {
  return {
    startDate: '2026-08-10',
    days: [],
    longestStreak: 0,
    ...overrides,
  };
}

describe('pushup timeline', () => {
  it('spans startDate through today and marks completions', () => {
    freezeNow('2026-08-12T16:00:00.000Z');
    const nodes = buildTimeline(challenge({
      days: [{ date: '2026-08-10', dayNumber: 1, completedAt: '2026-08-10T16:00:00.000Z' }],
    }));

    assert.deepEqual(nodes.map(({ date, dayNumber, completed, isToday }) => ({ date, dayNumber, completed, isToday })), [
      { date: '2026-08-10', dayNumber: 1, completed: true, isToday: false },
      { date: '2026-08-11', dayNumber: 2, completed: false, isToday: false },
      { date: '2026-08-12', dayNumber: 3, completed: false, isToday: true },
    ]);
    assert.equal(isStreakAlive(nodes), false);
  });

  it('detects a broken streak and counts only consecutive days from day one', () => {
    freezeNow('2026-08-13T16:00:00.000Z');
    const data = challenge({
      days: [
        { date: '2026-08-10', dayNumber: 1, completedAt: '2026-08-10T16:00:00.000Z' },
        { date: '2026-08-12', dayNumber: 3, completedAt: '2026-08-12T16:00:00.000Z' },
      ],
    });

    assert.equal(isStreakAlive(buildTimeline(data)), false);
    assert.equal(currentStreakLength(data), 1);
  });
});

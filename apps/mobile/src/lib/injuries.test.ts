import assert from 'node:assert/strict';
import { injuryRepository } from '@/data/injury-repository';
import { workoutRepository } from '@/data/workout-repository';
import type { StoredRecord } from '@/data/remote-types';
import type { Injury } from '@/types/user';
import type { Workout } from '@/types/workout';
// Keep the native source explicit at runtime: the mobile test preload maps
// extensionless relative imports to the web sibling first.
const nativeInjuries = await import(new URL('./injuries.ts', import.meta.url).href);
import { injuryCoversDate as webInjuryCoversDate } from './injuries.web';

const RealDate = Date;

function injury(overrides: Partial<Injury> = {}): Injury {
  return {
    id: 'injury-1',
    bodyPart: 'shoulder',
    severity: 'moderate',
    status: 'ongoing',
    onsetDate: '2026-01-10T00:00:00.000Z',
    resolvedDate: '2026-01-20T00:00:00.000Z',
    createdAt: '2026-01-10T00:00:00.000Z',
    updatedAt: '2026-01-10T00:00:00.000Z',
    ...overrides,
  };
}

function workout(id: string, date?: string, injuries?: string[]): Workout {
  return {
    id,
    userId: 'user-1',
    name: 'Test workout',
    ...(date === undefined ? {} : { date }),
    performedExercises: [],
    schemaVersion: 2,
    ...(injuries === undefined ? {} : { injuries }),
  };
}

function record<T>(id: string, data: T): StoredRecord<T> {
  return {
    id,
    data,
    syncState: 'synced',
    serverVersion: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    deleted: false,
  };
}

function withFrozenNow<T>(iso: string, fn: () => T): T {
  const frozenMilliseconds = RealDate.parse(iso);
  class FrozenDate extends RealDate {
    constructor(value?: string | number | Date) {
      if (value === undefined) super(frozenMilliseconds);
      else if (value instanceof RealDate) super(value.getTime());
      else super(value);
    }

    static now(): number {
      return frozenMilliseconds;
    }
  }

  const globals = globalThis as typeof globalThis & { Date: DateConstructor };
  const previousDate = globals.Date;
  globals.Date = FrozenDate as unknown as DateConstructor;
  try {
    return fn();
  } finally {
    globals.Date = previousDate;
  }
}

type InjuryCoverFn = (injury: Injury, date: Date) => boolean;

const injuryCoverers: [string, InjuryCoverFn][] = [
  ['native', (candidate, date) => nativeInjuries.injuryCoversDate(candidate, date)],
  ['web', webInjuryCoversDate],
];

function assertInjuryCoverage(
  candidate: Injury,
  date: Date,
  expected: boolean,
  label: string,
): void {
  for (const [platform, coversDate] of injuryCoverers) {
    assert.equal(coversDate(candidate, date), expected, `${platform}: ${label}`);
  }
}

function testInclusiveWindowsAndInvalidDates(): void {
  const bounded = injury();
  assertInjuryCoverage(bounded, new RealDate('2026-01-10T00:00:00.000Z'), true, 'onset boundary is inclusive');
  assertInjuryCoverage(bounded, new RealDate('2026-01-20T00:00:00.000Z'), true, 'resolved boundary is inclusive');
  assertInjuryCoverage(bounded, new RealDate('2026-01-09T23:59:59.999Z'), false, 'dates before onset are excluded');
  assertInjuryCoverage(bounded, new RealDate('2026-01-20T00:00:00.001Z'), false, 'dates after resolution are excluded');

  assertInjuryCoverage(
    injury({ onsetDate: 'not-a-date' }),
    new RealDate('2026-01-15T00:00:00.000Z'),
    false,
    'invalid onset returns false',
  );
  assertInjuryCoverage(
    injury({ resolvedDate: 'not-a-date' }),
    new RealDate('2026-01-15T00:00:00.000Z'),
    false,
    'invalid resolved date returns false',
  );
  assertInjuryCoverage(
    injury({ onsetDate: { seconds: 1768003200, nanoseconds: 0 } }),
    new RealDate('2026-01-10T00:00:00.000Z'),
    true,
    'Firestore-style timestamp onset is accepted',
  );
  assertInjuryCoverage(
    bounded,
    new RealDate(Number.NaN),
    false,
    'invalid workout date returns false',
  );
}

function testUnresolvedInjuryUsesCurrentTime(): void {
  const ongoing = injury({ resolvedDate: null });
  withFrozenNow('2026-02-01T00:00:00.000Z', () => {
    assertInjuryCoverage(ongoing, new RealDate('2026-02-01T00:00:00.000Z'), true, 'unresolved injuries end at frozen now');
    assertInjuryCoverage(ongoing, new RealDate('2026-02-01T00:00:00.001Z'), false, 'unresolved injuries exclude dates after frozen now');
    assertInjuryCoverage(ongoing, new RealDate('2026-01-09T23:59:59.999Z'), false, 'unresolved injuries still honor onset');
  });
}

async function testOngoingReadsFilterAndSwallowFailures(): Promise<void> {
  const originalGetAll = injuryRepository.getAll;
  try {
    injuryRepository.getAll = async () => [
      record('ongoing', { ...injury({ id: 'ongoing', status: 'ongoing' }) }),
      record('resolved', { ...injury({ id: 'resolved', status: 'resolved', resolvedDate: '2026-01-15T00:00:00.000Z' }) }),
    ];
    assert.deepEqual(await nativeInjuries.getOngoingInjuries('user-1'), [
      { ...injury({ id: 'ongoing', status: 'ongoing' }) },
    ], 'only ongoing injuries survive');
    assert.deepEqual(await nativeInjuries.getOngoingInjuryIds('user-1'), ['ongoing']);

    injuryRepository.getAll = async () => {
      throw new Error('repository unavailable');
    };
    assert.deepEqual(await nativeInjuries.getOngoingInjuries('user-1'), [], 'repository errors are swallowed');
    assert.deepEqual(await nativeInjuries.getOngoingInjuryIds('user-1'), [], 'id helper also returns empty on read failure');
  } finally {
    injuryRepository.getAll = originalGetAll;
  }
}

async function testApplyHistoryFiltersAndDedupes(): Promise<void> {
  const originalGetHistory = workoutRepository.getHistory;
  const originalUpdate = workoutRepository.update;
  const rows = new Map<string, StoredRecord<Workout>>([
    ['inside', record('inside', workout('inside', '2026-01-10T00:00:00.000Z'))],
    ['already', record('already', workout('already', '2026-01-15T00:00:00.000Z', ['injury-1']))],
    ['outside', record('outside', workout('outside', '2026-01-21T00:00:00.000Z'))],
    ['planned', record('planned', workout('planned'))],
    ['invalid', record('invalid', workout('invalid', 'not-a-date'))],
  ]);
  const updates: Array<{ id: string; workout: Workout }> = [];
  try {
    workoutRepository.getHistory = async () => [...rows.values()];
    workoutRepository.update = async (_uid, id, data) => {
      updates.push({ id, workout: data });
      rows.set(id, record(id, data));
    };

    const count = await nativeInjuries.applyInjuryToHistory('user-1', injury());
    assert.equal(count, 2, 'only dated workouts in the inclusive injury window are stamped');
    assert.deepEqual(updates.map(({ id }) => id).sort(), ['already', 'inside']);
    assert.deepEqual(updates.map(({ workout: data }) => data.injuries), [['injury-1'], ['injury-1']]);

    updates.length = 0;
    const secondCount = await nativeInjuries.applyInjuryToHistory('user-1', injury());
    assert.equal(secondCount, 2, 're-application reports the same matching workout count');
    assert.deepEqual(updates.map(({ workout: data }) => data.injuries), [['injury-1'], ['injury-1']], 're-application never duplicates ids');
  } finally {
    workoutRepository.getHistory = originalGetHistory;
    workoutRepository.update = originalUpdate;
  }
}

async function testRemoveHistoryOnlyTouchesStampedWorkouts(): Promise<void> {
  const originalGetHistory = workoutRepository.getHistory;
  const originalUpdate = workoutRepository.update;
  const rows = [
    record('has-injury', workout('has-injury', '2026-01-10T00:00:00.000Z', ['other', 'injury-1', 'injury-1'])),
    record('other-injury', workout('other-injury', '2026-01-10T00:00:00.000Z', ['other'])),
    record('none', workout('none', '2026-01-10T00:00:00.000Z')),
  ];
  const updates: Array<{ id: string; workout: Workout }> = [];
  try {
    workoutRepository.getHistory = async () => rows;
    workoutRepository.update = async (_uid, id, data) => {
      updates.push({ id, workout: data });
    };

    const count = await nativeInjuries.removeInjuryFromHistory('user-1', 'injury-1');
    assert.equal(count, 1, 'returns the number of workouts carrying the id');
    assert.deepEqual(updates, [{ id: 'has-injury', workout: { ...rows[0]!.data, injuries: ['other'] } }]);
  } finally {
    workoutRepository.getHistory = originalGetHistory;
    workoutRepository.update = originalUpdate;
  }
}

testInclusiveWindowsAndInvalidDates();
testUnresolvedInjuryUsesCurrentTime();
await testOngoingReadsFilterAndSwallowFailures();
await testApplyHistoryFiltersAndDedupes();
await testRemoveHistoryOnlyTouchesStampedWorkouts();

console.log('injuries: all assertions passed');

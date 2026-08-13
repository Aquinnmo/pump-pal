import assert from 'node:assert/strict';
import { createKeyedMutex, createSerialQueue } from './keyed-mutex';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

async function main() {
  // --- overlapping calls for the same key produce exactly one run ---
  {
    const mutex = createKeyedMutex<number>();
    let calls = 0;
    const gate = deferred<number>();
    const fn = () => {
      calls++;
      return gate.promise;
    };
    const p1 = mutex.run('uid-1', fn);
    const p2 = mutex.run('uid-1', fn);
    const p3 = mutex.run('uid-1', fn);
    assert.equal(calls, 1, 'only the first caller actually invokes the work');
    assert.equal(mutex.isRunning('uid-1'), true);
    gate.resolve(42);
    const results = await Promise.all([p1, p2, p3]);
    assert.deepEqual(results, [42, 42, 42], 'every caller gets the same result');
    assert.equal(mutex.isRunning('uid-1'), false, 'clears after completion, ready for the next trigger');
  }

  // --- a later call, after the first completes, runs again (not deduped forever) ---
  {
    const mutex = createKeyedMutex<number>();
    let calls = 0;
    const first = await mutex.run('uid-1', async () => {
      calls++;
      return 1;
    });
    const second = await mutex.run('uid-1', async () => {
      calls++;
      return 2;
    });
    assert.equal(calls, 2);
    assert.equal(first, 1);
    assert.equal(second, 2);
  }

  // --- different keys run independently, never block each other ---
  {
    const mutex = createKeyedMutex<string>();
    const gate1 = deferred<string>();
    const p1 = mutex.run('uid-1', () => gate1.promise);
    const p2 = mutex.run('uid-2', async () => 'uid-2 result');
    assert.equal(await p2, 'uid-2 result', 'uid-2 must not wait on uid-1s in-flight run');
    gate1.resolve('uid-1 result');
    assert.equal(await p1, 'uid-1 result');
  }

  // --- a rejected run still clears the slot (doesn't wedge future triggers) ---
  {
    const mutex = createKeyedMutex<number>();
    await assert.rejects(() =>
      mutex.run('uid-1', async () => {
        throw new Error('boom');
      })
    );
    assert.equal(mutex.isRunning('uid-1'), false);
    const result = await mutex.run('uid-1', async () => 7);
    assert.equal(result, 7, 'the next trigger after a failure must be able to run');
  }

  // --- createSerialQueue: overlapping tasks never interleave, and all of them run ---
  {
    const enqueue = createSerialQueue();
    const events: string[] = [];
    const task = (name: string) => async () => {
      events.push(`${name}:begin`);
      await new Promise((r) => setTimeout(r, 5));
      events.push(`${name}:end`);
      return name;
    };

    // Fired together with no awaits between them — the case that produces
    // "cannot start a transaction within a transaction" on a bare connection.
    const results = await Promise.all([enqueue(task('a')), enqueue(task('b')), enqueue(task('c'))]);

    assert.deepEqual(events, ['a:begin', 'a:end', 'b:begin', 'b:end', 'c:begin', 'c:end']);
    // The coalescing mutex would return 'a' three times and never run b or c.
    assert.deepEqual(results, ['a', 'b', 'c'], 'every queued task must actually execute');
  }

  // --- a rejected task rejects its own caller but does not wedge the queue ---
  {
    const enqueue = createSerialQueue();
    const failing = enqueue(async () => {
      throw new Error('boom');
    });
    const following = enqueue(async () => 'ran anyway');

    await assert.rejects(() => failing, /boom/);
    assert.equal(await following, 'ran anyway');
  }

  console.log('src/data/keyed-mutex.test.ts: all assertions passed');
}

main();

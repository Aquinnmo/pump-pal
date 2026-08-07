import assert from 'node:assert/strict';
import { createLatestWriteQueue } from './latest-write-queue';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function main() {
  // Writes never overlap, and snapshots waiting behind an in-flight write
  // coalesce to the newest value.
  {
    const first = deferred<void>();
    const writes: number[] = [];
    let concurrent = 0;
    let maxConcurrent = 0;
    const queue = createLatestWriteQueue<number>(async (value) => {
      writes.push(value);
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      if (value === 1) await first.promise;
      concurrent--;
    });

    queue.schedule(1).catch(() => {});
    queue.schedule(2).catch(() => {});
    queue.schedule(3).catch(() => {});
    first.resolve();
    await queue.flush();

    assert.deepEqual(writes, [1, 3]);
    assert.equal(maxConcurrent, 1);
    assert.equal(queue.hasPending(), false);
  }

  // A flush with a fresh snapshot waits for both the in-flight write and the
  // exact latest value supplied at the save boundary.
  {
    const first = deferred<void>();
    const writes: string[] = [];
    const queue = createLatestWriteQueue<string>(async (value) => {
      writes.push(value);
      if (value === 'old') await first.promise;
    });

    queue.schedule('old').catch(() => {});
    const flushed = queue.flush('new');
    let settled = false;
    flushed.then(() => (settled = true));
    await Promise.resolve();
    assert.equal(settled, false);
    first.resolve();
    await flushed;
    assert.deepEqual(writes, ['old', 'new']);
  }

  // Failure keeps the newest snapshot pending. A later flush retries it and
  // only reports success after the write lands.
  {
    let attempts = 0;
    const queue = createLatestWriteQueue<string>(async () => {
      attempts++;
      if (attempts === 1) throw new Error('disk unavailable');
    });

    await assert.rejects(() => queue.flush('latest'), /disk unavailable/);
    assert.equal(queue.hasPending(), true);
    await queue.flush();
    assert.equal(attempts, 2);
    assert.equal(queue.hasPending(), false);
  }

  console.log('utils/latest-write-queue.test.ts: all assertions passed');
}

main();

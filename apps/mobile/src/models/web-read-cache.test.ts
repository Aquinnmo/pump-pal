import assert from 'node:assert/strict';
import { createReadCache } from './web-read-cache';

// A second read of the same key must not hit the network again — that is the
// whole point of the module (page switches used to refetch the account).
{
  const cache = createReadCache();
  let calls = 0;
  const load = async () => {
    calls += 1;
    return 'value';
  };

  assert.equal(await cache.read('workout:uid-a', load), 'value');
  assert.equal(await cache.read('workout:uid-a', load), 'value');
  assert.equal(calls, 1);
}

// Different keys are independent, so a uid-scoped key cannot serve another account.
{
  const cache = createReadCache();
  assert.equal(await cache.read('workout:uid-a', async () => 'a'), 'a');
  assert.equal(await cache.read('workout:uid-b', async () => 'b'), 'b');
}

// clear() is what every web mutation calls; the next read must go back out.
{
  const cache = createReadCache();
  let calls = 0;
  const load = async () => {
    calls += 1;
    return calls;
  };

  assert.equal(await cache.read('workout:uid-a', load), 1);
  cache.clear();
  assert.equal(await cache.read('workout:uid-a', load), 2);
  assert.equal(calls, 2);
}

// A failed load must not be retained, or one offline blip breaks the session.
{
  const cache = createReadCache();
  let calls = 0;
  const load = async () => {
    calls += 1;
    if (calls === 1) throw new Error('offline');
    return 'recovered';
  };

  await assert.rejects(() => cache.read('workout:uid-a', load), /offline/);
  assert.equal(await cache.read('workout:uid-a', load), 'recovered');
  assert.equal(calls, 2);
}

// Concurrent readers share one in-flight request rather than racing two.
{
  const cache = createReadCache();
  let calls = 0;
  const load = async () => {
    calls += 1;
    return 'value';
  };

  const [first, second] = await Promise.all([
    cache.read('workout:uid-a', load),
    cache.read('workout:uid-a', load),
  ]);
  assert.equal(first, 'value');
  assert.equal(second, 'value');
  assert.equal(calls, 1);
}

console.log('web-read-cache: all assertions passed');

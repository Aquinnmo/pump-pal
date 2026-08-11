import assert from 'node:assert/strict';
import { bumpDataVersion, getDataVersion, subscribeDataVersion } from './data-version';

async function main() {
  // --- a bump increments the snapshot and notifies subscribers ---
  const start = getDataVersion();
  let calls = 0;
  const unsubscribe = subscribeDataVersion(() => {
    calls++;
  });
  bumpDataVersion();
  assert.equal(calls, 1);
  assert.equal(getDataVersion(), start + 1, 'snapshot must change so useSyncExternalStore re-renders');

  // --- the snapshot is stable between bumps (no re-render churn) ---
  assert.equal(getDataVersion(), start + 1);

  // --- unsubscribing stops the notifications ---
  unsubscribe();
  bumpDataVersion();
  assert.equal(calls, 1, 'an unsubscribed listener must not be called');
  assert.equal(getDataVersion(), start + 2, 'the version still moves with no listeners attached');

  // --- a listener that unsubscribes from inside its own callback ---
  // React does exactly this when a subscribed component unmounts during a
  // notify, so the iteration must not skip the listeners after it.
  let selfRemovedCalls = 0;
  let survivorCalls = 0;
  const removeSelf = subscribeDataVersion(() => {
    selfRemovedCalls++;
    removeSelf();
  });
  const removeSurvivor = subscribeDataVersion(() => {
    survivorCalls++;
  });
  bumpDataVersion();
  assert.equal(selfRemovedCalls, 1);
  assert.equal(survivorCalls, 1, 'unsubscribing mid-notify must not skip the remaining listeners');
  bumpDataVersion();
  assert.equal(selfRemovedCalls, 1, 'the self-removed listener must not be called again');
  assert.equal(survivorCalls, 2);
  removeSurvivor();

  console.log('src/data/data-version.test.ts: all assertions passed');
}

main();

import assert from 'node:assert/strict';
import {
  BODY_SILHOUETTES,
  MUSCLE_PEBBLES,
} from '@/constants/muscle-map-paths';
import { MUSCLES } from '@/constants/muscles';

for (const view of ['anterior', 'posterior'] as const) {
  assert.ok(
    MUSCLE_PEBBLES.filter((pebble) => pebble.view === view).length > 0,
    `${view} must have pebbles`,
  );
}

assert.equal(
  new Set(MUSCLE_PEBBLES.map((pebble) => pebble.id)).size,
  MUSCLE_PEBBLES.length,
  'pebble ids must be unique',
);

assert.deepEqual(
  MUSCLE_PEBBLES.map((pebble) => pebble.id),
  [...MUSCLE_PEBBLES].map((pebble) => pebble.id).sort(),
  'generated pebbles must have stable id ordering',
);

const represented = [
  ...new Set(
    MUSCLE_PEBBLES.flatMap((pebble) => pebble.muscle ? [pebble.muscle] : []),
  ),
].sort();
assert.deepEqual(
  represented,
  [...MUSCLES].sort(),
  'generated references must cover exactly the canonical muscles',
);

for (const muscle of MUSCLES) {
  assert.ok(
    MUSCLE_PEBBLES.some((pebble) => pebble.muscle === muscle),
    `${muscle} must have visible coverage`,
  );
}

for (const pebble of MUSCLE_PEBBLES) {
  assert.ok(pebble.d.startsWith('M') && pebble.d.endsWith('Z'), `${pebble.id} must be a closed path`);
  assert.ok(/C/.test(pebble.d), `${pebble.id} must use smooth curve primitives`);
  assert.ok(!/NaN|Infinity/.test(pebble.d), `${pebble.id} coordinates must be finite`);
}

assert.deepEqual(
  BODY_SILHOUETTES.map((silhouette) => silhouette.view).sort(),
  ['anterior', 'posterior'],
  'both silhouette clips must exist',
);
for (const silhouette of BODY_SILHOUETTES) {
  assert.ok(silhouette.d.startsWith('M'));
  assert.ok(silhouette.d.endsWith('Z'));
  assert.ok(/[C]/.test(silhouette.d), `${silhouette.view} silhouette must use smooth primitives`);
}

console.log('muscle-map registry tests passed');

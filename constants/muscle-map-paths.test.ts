import assert from 'node:assert/strict';
import {
  BODY_SILHOUETTES,
  MUSCLE_MAP_VIEWBOX,
  MUSCLE_PEBBLES,
  muscleAtPoint,
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

// Tapping a tile must select that tile's muscle. This is the whole
// interaction, and it is invisible in the rendered SVG, so it gets a guard.
for (const pebble of MUSCLE_PEBBLES) {
  const { x, y, r } = pebble.hit;
  assert.ok(Number.isFinite(x) && Number.isFinite(y), `${pebble.id} hit center must be finite`);
  assert.ok(r > 0, `${pebble.id} hit radius must be positive`);
  assert.ok(
    x >= 0 && x <= MUSCLE_MAP_VIEWBOX.width && y >= 0 && y <= MUSCLE_MAP_VIEWBOX.height,
    `${pebble.id} hit center must sit inside the viewbox`,
  );
  if (pebble.muscle) {
    assert.equal(
      muscleAtPoint(x, y),
      pebble.muscle,
      `tapping the center of ${pebble.id} must select ${pebble.muscle}`,
    );
  }
}

// A tap in the empty margin beside the figure must not select anything.
assert.equal(muscleAtPoint(2, 2), null, 'taps off the body select nothing');

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

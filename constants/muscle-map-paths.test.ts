import assert from 'node:assert/strict';
import { MUSCLE_MAP_SEGMENTS, NEUTRAL_BODY_SEGMENTS } from '@/constants/muscle-map-paths';
import { MUSCLES } from '@/constants/muscles';

const represented = [...new Set(MUSCLE_MAP_SEGMENTS.map((segment) => segment.muscle))].sort();
assert.deepEqual(represented, [...MUSCLES].sort(), 'segment registry must cover exactly the canonical muscles');

assert.equal(
  new Set(MUSCLE_MAP_SEGMENTS.map((segment) => segment.id)).size,
  MUSCLE_MAP_SEGMENTS.length,
  'muscle segment ids must be unique'
);
assert.equal(
  new Set(NEUTRAL_BODY_SEGMENTS.map((segment) => segment.id)).size,
  NEUTRAL_BODY_SEGMENTS.length,
  'neutral segment ids must be unique'
);

for (const segment of MUSCLE_MAP_SEGMENTS) {
  assert.ok(segment.d.trim().startsWith('M'), `${segment.id} must contain SVG path data`);
  assert.ok(['anterior', 'posterior'].includes(segment.view), `${segment.id} must identify its view`);
  assert.ok(['left', 'right', 'center'].includes(segment.side), `${segment.id} must identify its side`);
}

console.log('muscle-map path tests passed');

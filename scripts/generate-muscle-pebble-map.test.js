const assert = require('node:assert/strict');
const {
  CANONICAL_MUSCLES,
  CENTERS,
  HEIGHT,
  VIEWS,
  generateMap,
  renderTypeScript,
} = require('./generate-muscle-pebble-map');

const first = generateMap();
const second = generateMap();
assert.equal(renderTypeScript(first), renderTypeScript(second), 'generator must be deterministic');

// Path strings only ever contain absolute coordinate pairs, so the numbers
// alternate x, y throughout regardless of command type.
function pathBounds(d) {
  const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  assert.ok(numbers.length >= 4 && numbers.length % 2 === 0, `parseable path: ${d.slice(0, 30)}`);
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (let index = 0; index < numbers.length; index += 2) {
    bounds.minX = Math.min(bounds.minX, numbers[index]);
    bounds.maxX = Math.max(bounds.maxX, numbers[index]);
    bounds.minY = Math.min(bounds.minY, numbers[index + 1]);
    bounds.maxY = Math.max(bounds.maxY, numbers[index + 1]);
  }
  return bounds;
}

const pebblesById = new Map(first.pebbles.map((pebble) => [pebble.id, pebble]));
assert.equal(pebblesById.size, first.pebbles.length, 'pebble ids must be unique');

for (const view of VIEWS) {
  const viewPebbles = first.pebbles.filter((pebble) => pebble.view === view);
  assert.ok(viewPebbles.length > 0, `${view} must emit pebbles`);
  const [halfMin, halfMax] = view === 'anterior' ? [0, 180] : [180, 360];
  for (const pebble of viewPebbles) {
    assert.ok(!/NaN|Infinity/.test(pebble.d), `${pebble.id} coordinates must be finite`);
    const bounds = pathBounds(pebble.d);
    assert.ok(bounds.minX >= halfMin && bounds.maxX <= halfMax, `${pebble.id} must stay in the ${view} half`);
    assert.ok(bounds.minY >= 0 && bounds.maxY <= HEIGHT, `${pebble.id} must stay inside the viewbox`);
  }

  // Mirrored specs must produce true reflections across the figure centerline.
  const cx = CENTERS[view];
  for (const [leftId, rightId] of first.raw[view].mirrorPairs) {
    const left = pathBounds(pebblesById.get(leftId).d);
    const right = pathBounds(pebblesById.get(rightId).d);
    assert.ok(Math.abs((cx - left.maxX) - (right.minX - cx)) < 0.05, `${leftId}/${rightId} mirrored x`);
    assert.ok(Math.abs((cx - left.minX) - (right.maxX - cx)) < 0.05, `${leftId}/${rightId} mirrored x`);
    assert.ok(Math.abs(left.minY - right.minY) < 0.05 && Math.abs(left.maxY - right.maxY) < 0.05, `${leftId}/${rightId} same y`);
  }
}

const represented = new Set(first.pebbles.map((pebble) => pebble.muscle).filter(Boolean));
assert.deepEqual([...represented].sort(), [...CANONICAL_MUSCLES].sort(), 'every canonical muscle must appear');

console.log('muscle-map generator tests passed');

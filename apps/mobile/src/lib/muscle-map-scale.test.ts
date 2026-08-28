import assert from 'node:assert/strict';
import { muscleMapColor } from './muscle-map-scale';

// The scale interpolates blue -> gray -> amber at the 0/50/100 anchors.
assert.equal(muscleMapColor(0), '#60a5fa');
assert.equal(muscleMapColor(25), '#7497c1');
assert.equal(muscleMapColor(50), '#888888');
assert.equal(muscleMapColor(75), '#bf934a');
assert.equal(muscleMapColor(100), '#f59e0b');

// Scores outside the UI's percentage range clamp to the corresponding
// endpoint rather than extrapolating beyond the palette.
assert.equal(muscleMapColor(-1), muscleMapColor(0), 'negative scores clamp at 0');
assert.equal(muscleMapColor(101), muscleMapColor(100), 'scores above 100 clamp at 100');

console.log('muscle-map-scale: all assertions passed');

import assert from 'node:assert/strict';
import { getUpNextWidgetSize } from './up-next-widget-size';

assert.equal(getUpNextWidgetSize({ width: 110, height: 48 }), 'small');
assert.equal(getUpNextWidgetSize({ width: 300, height: 48 }), 'small');
assert.equal(getUpNextWidgetSize({ width: 180, height: 64 }), 'compact');
assert.equal(getUpNextWidgetSize({ width: 300, height: 80 }), 'compact');
assert.equal(getUpNextWidgetSize({ width: 260, height: 112 }), 'expanded');

console.log('Up Next widget size tests passed');

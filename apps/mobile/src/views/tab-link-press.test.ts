import assert from 'node:assert/strict';
import { shouldPreventDefault } from './tab-link-press';

// A plain left click is the app's to handle: prevent the anchor's navigation so
// the tab switch stays client-side instead of reloading the whole document.
assert.equal(shouldPreventDefault({ button: 0 }), true);
assert.equal(shouldPreventDefault({}), true);
assert.equal(shouldPreventDefault({ button: 0, currentTarget: { target: '_self' } }), false);
assert.equal(shouldPreventDefault({ button: 0, currentTarget: { target: 'self' } }), true);
assert.equal(shouldPreventDefault({ button: 0, currentTarget: { target: '' } }), true);
assert.equal(shouldPreventDefault({ button: 0, currentTarget: null }), true);

// Modified clicks belong to the browser — ⌘-click opens a background tab, and
// the app must not navigate in place as well.
for (const modifier of ['metaKey', 'altKey', 'ctrlKey', 'shiftKey'] as const) {
  assert.equal(shouldPreventDefault({ button: 0, [modifier]: true }), false, modifier);
}

// Middle click (new tab) and right click are the browser's too.
assert.equal(shouldPreventDefault({ button: 1 }), false);
assert.equal(shouldPreventDefault({ button: 2 }), false);

// target=_blank must open a new tab rather than being swallowed.
assert.equal(shouldPreventDefault({ button: 0, currentTarget: { target: '_blank' } }), false);

console.log('tab-link-press: all assertions passed');

import assert from 'node:assert/strict';
import { formatAIError } from './format-ai-error';

// The whole point of this module: nothing may render as the two useless
// stringification defaults. Every case below once did, or nearly did.
const cases: [label: string, value: unknown, expected: string][] = [
  ['Error', new Error('boom'), 'boom'],
  ['TypeError from fetch', new TypeError('Network request failed'), 'Network request failed'],
  ['server error shape', { error: 'AI request failed' }, 'AI request failed'],
  ['object with message', { message: 'nope' }, 'Object: nope'],
  ['string', 'raw string', 'raw string'],
  ['null', null, 'null'],
  ['undefined', undefined, 'undefined'],
  ['number', 404, '404'],
];

for (const [label, value, expected] of cases) {
  assert.equal(formatAIError(value), expected, label);
}

// Non-enumerable fields are the case JSON.stringify silently drops, leaving
// "{}" — and the case that made this show up as "[object Object]" in the UI.
const nonEnumerable = Object.defineProperty({}, 'code', {
  value: 'ENOTFOUND',
  enumerable: false,
});
assert.equal(formatAIError(nonEnumerable), 'Object(code=ENOTFOUND)');

// An Error carrying extra fields but no message still has to say something.
const coded = Object.assign(new Error(''), { code: 'ECONNREFUSED' });
assert.equal(formatAIError(coded), 'Error(message=, code=ECONNREFUSED)');

// A bare object has nothing to report but must not claim to be "[object Object]".
assert.equal(formatAIError({}), 'Object');

// Cyclic structures must terminate rather than recurse.
const circular: Record<string, unknown> = { a: 1 };
circular.self = circular;
assert.equal(formatAIError(circular), 'Object(a=1, self=Object)');

// A getter that throws must not take the whole formatter down with it.
const hostile = Object.defineProperty({}, 'boom', {
  get() {
    throw new Error('getter exploded');
  },
  enumerable: true,
});
assert.equal(formatAIError(hostile), 'Object(boom=<unreadable>)');

// The invariant, stated directly.
for (const [label, value] of [
  ['bare object', {}],
  ['non-enumerable', nonEnumerable],
  ['circular', circular],
  ['hostile getter', hostile],
] as [string, unknown][]) {
  assert.notEqual(formatAIError(value), '[object Object]', `${label} rendered as [object Object]`);
  assert.notEqual(formatAIError(value), '{}', `${label} rendered as {}`);
}

console.log('format-ai-error: all assertions passed');

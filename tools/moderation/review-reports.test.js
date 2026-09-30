const assert = require('node:assert/strict');
const { buildWrites, openReportsFromDocuments, parseArgs } = require('./review-reports');

const report = (id, fields) => ({
  name: `projects/test/databases/(default)/documents/reports/${id}`,
  fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, typeof value === 'string' && key === 'createdAt' ? { timestampValue: value } : { stringValue: value }])),
});

// Only open reports, oldest first.
const open = openReportsFromDocuments([
  report('newer', { status: 'open', createdAt: '2026-09-02T00:00:00.000Z' }),
  report('done', { status: 'dismissed', createdAt: '2026-09-01T00:00:00.000Z' }),
  report('older', { status: 'open', createdAt: '2026-09-01T00:00:00.000Z' }),
]);
assert.deepEqual(open.map((r) => r.id), ['older', 'newer']);

// Dismissing writes the report only. Every write is an updateMask PATCH.
const base = { projectId: 'demo', report: { id: 'r1', reported: 'u2' }, now: '2026-09-30T00:00:00.000Z' };
const dismissed = buildWrites({ ...base, decision: 'dismissed', suspend: true });
assert.equal(dismissed.length, 1, 'suspend is ignored unless the report is actioned');
assert.match(dismissed[0].url, /\/reports\/r1\?updateMask\.fieldPaths=status&updateMask\.fieldPaths=resolvedAt$/);
assert.deepEqual(dismissed[0].body.fields.status, { stringValue: 'dismissed' });

// Actioning without suspension leaves the user alone.
assert.equal(buildWrites({ ...base, decision: 'actioned', suspend: false }).length, 1);

// Actioning with suspension also sets only socialSuspended on the reported user.
const suspended = buildWrites({ ...base, decision: 'actioned', suspend: true });
assert.equal(suspended.length, 2);
assert.match(suspended[1].url, /\/users\/u2\?updateMask\.fieldPaths=socialSuspended$/);
assert.deepEqual(suspended[1].body, { fields: { socialSuspended: { booleanValue: true } } });

// Args: dry-run by default is "no writes"; the flags are exclusive.
assert.equal(parseArgs(['node', 'x']).apply, false);
assert.equal(parseArgs(['node', 'x', '--apply']).apply, true);
assert.throws(() => parseArgs(['node', 'x', '--apply', '--dry-run']), /cannot be used together/);
assert.throws(() => parseArgs(['node', 'x', '--nope']), /Unknown argument/);

console.log('review-reports: all assertions passed');

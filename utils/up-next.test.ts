import { describeUpNext } from '@/utils/up-next';
import assert from 'node:assert/strict';

// A live workout wins over everything — the card and the widget say "Resume".
assert.deepEqual(
  describeUpNext({ inProgressName: 'Push', plannedName: 'Pull', predictedName: 'Legs' }),
  { label: 'Resume', name: 'Push', action: 'Resume workout', source: 'In progress' }
);

// Head of the planned queue beats the split prediction.
assert.deepEqual(
  describeUpNext({ plannedName: 'Pull', predictedName: 'Legs' }),
  { label: 'Up next', name: 'Pull', action: 'Start planned workout', source: 'Planned' }
);

// Nothing live or planned — fall back to the split prediction.
assert.deepEqual(
  describeUpNext({ predictedName: 'Legs' }),
  { label: 'Up next', name: 'Legs', action: 'Start workout', source: 'Next in your split' }
);

// Nothing at all (e.g. custom split with no generated names yet).
assert.deepEqual(
  describeUpNext({}),
  { label: 'Up next', name: 'Start a workout', action: 'Choose your workout', source: 'New session' }
);

// Empty strings from Firestore must not be treated as a name.
assert.equal(describeUpNext({ inProgressName: '', plannedName: 'Pull' }).name, 'Pull');
assert.equal(describeUpNext({ plannedName: null, predictedName: null }).name, 'Start a workout');

console.log('up-next: ok');

// The Up Next priority chain, in one place: a live workout beats the planned
// queue, which beats the split's predicted next day, which beats a blank session.
// Kept free of Firestore imports so the Home screen card, the Android widget and
// the widget's headless task handler can all agree on the same copy.
export type UpNextState = {
  inProgressName?: string | null;
  plannedName?: string | null;
  predictedName?: string | null;
};

export type UpNextCopy = {
  label: string;
  name: string;
  action: string;
  source: string;
};

export function describeUpNext({ inProgressName, plannedName, predictedName }: UpNextState): UpNextCopy {
  if (inProgressName) {
    return { label: 'Resume', name: inProgressName, action: 'Resume workout', source: 'In progress' };
  }
  if (plannedName) {
    return { label: 'Up next', name: plannedName, action: 'Start planned workout', source: 'Planned' };
  }
  if (predictedName) {
    return { label: 'Up next', name: predictedName, action: 'Start workout', source: 'Next in your split' };
  }
  return { label: 'Up next', name: 'Start a workout', action: 'Choose your workout', source: 'New session' };
}

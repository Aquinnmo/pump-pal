// The one place set types are defined. Every consumer — editor badge, live cursor,
// summaries, notification, watch — asks setTypeOf() and reads these fields; nothing
// branches on a type id. Adding a type means adding a row here. A type that needs
// behavior none of these fields describe is the moment to add a field, deliberately.
export type SetTypeDef = {
  // Stored on PerformedSet.type. 'normal' is never written; an absent type means it.
  id: string;
  label: string;
  // Badge text. null shows the set's number (1, 2, 3…) instead.
  glyph: string | null;
  // Present when one set of this type is made of several parts done back to back
  // (a drop set's drops). Each part is completed on its own but they stay one set:
  // stored as PerformedSets sharing a setNumber, edited as DraftSet.subSets.
  subSet?: {
    // "Add drop", "Complete drop", "Drop 2 of 3".
    noun: string;
    // A new part starts at the previous part's weight times this, rounded to 5 lbs.
    // The tuning knob: 1 would repeat the weight (rest-pause).
    weightFactor: number;
  };
  description: string;
};

export const SET_TYPES: readonly SetTypeDef[] = [
  { id: 'normal', label: 'Simple set', glyph: null, description: 'A regular working set.' },
  {
    id: 'drop',
    label: 'Drop set',
    glyph: null,
    subSet: { noun: 'drop', weightFactor: 0.8 },
    description: 'One set, then lighter drops straight after it with no rest.',
  },
];

const NORMAL = SET_TYPES[0];

// Unknown ids (written by a newer build) read as normal rather than breaking anything.
export function setTypeOf(set: { type?: string } | undefined): SetTypeDef {
  return SET_TYPES.find((t) => t.id === set?.type) ?? NORMAL;
}

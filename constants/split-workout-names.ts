import { SplitOption } from './split-options';

export const SPLIT_WORKOUT_NAMES: Record<SplitOption, string[]> = {
  'Push / Pull / Legs': ['Push', 'Pull', 'Legs'],
  'Upper / Lower': ['Upper Body', 'Lower Body'],
  'Bro Split': ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs'],
  'Full Body': ['Full Body'],
  'Other': [],
};

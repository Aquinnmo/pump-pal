export const SPLIT_OPTIONS = [
  'Push / Pull / Legs',
  'Upper / Lower',
  'Bro Split',
  'Full Body',
  'Other',
] as const;

export type SplitOption = (typeof SPLIT_OPTIONS)[number];

export function isSplitOption(value: unknown): value is SplitOption {
  return typeof value === 'string' && SPLIT_OPTIONS.includes(value as SplitOption);
}
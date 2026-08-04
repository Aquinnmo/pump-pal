export type UpNextWidgetSize = 'small' | 'compact' | 'expanded';

type WidgetBounds = {
  width: number;
  height: number;
};

// Android reports current widget bounds in dp. Width and height are both hard
// constraints: a wide-but-short widget still needs the one-line composition.
export function getUpNextWidgetSize({
  width,
  height,
}: WidgetBounds): UpNextWidgetSize {
  if (width < 180 || height < 64) return 'small';
  if (width < 260 || height < 112) return 'compact';
  return 'expanded';
}

import { clearUpNextWidget, setUpNextWidget } from '@/modules/live-update-notification';

// The WidgetKit extension cannot read AsyncStorage; the module writes the copy
// into the shared app-group container and reloads the widget's timeline.
export function setUpNextWidgetNative(json: string): void {
  setUpNextWidget(json);
}

export function clearUpNextWidgetNative(): void {
  clearUpNextWidget();
}

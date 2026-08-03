import {
  getUpNextWidgetSize,
  UpNextWidget,
} from '@/widgets/up-next-widget';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';

// What the Android home-screen widget renders. Written by the Home screen every
// time it resolves the Up Next card, read by the widget's headless task handler
// (which has no auth or Firestore access of its own).
export type WidgetUpNext = {
  label: string;
  name: string;
  action: string;
  source: string;
};

export const WIDGET_UP_NEXT_FALLBACK: WidgetUpNext = {
  label: 'Up next',
  name: 'Start a workout',
  action: 'Choose your workout',
  source: 'New session',
};

const KEY = 'pumppal_widget_up_next';

export async function readWidgetUpNext(): Promise<WidgetUpNext> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return WIDGET_UP_NEXT_FALLBACK;
    const parsed = JSON.parse(raw) as Partial<WidgetUpNext>;
    return {
      label: parsed.label || WIDGET_UP_NEXT_FALLBACK.label,
      name: parsed.name || WIDGET_UP_NEXT_FALLBACK.name,
      action: parsed.action || WIDGET_UP_NEXT_FALLBACK.action,
      source: parsed.source || WIDGET_UP_NEXT_FALLBACK.source,
    };
  } catch {
    return WIDGET_UP_NEXT_FALLBACK;
  }
}

// Caches the copy and redraws any widgets already on the home screen.
// No-op off Android; requestWidgetUpdate is also a no-op when none are added.
export async function syncUpNextWidget(next: WidgetUpNext): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    await requestWidgetUpdate({
      widgetName: 'UpNext',
      renderWidget: (widgetInfo) => (
        <UpNextWidget
          {...next}
          size={getUpNextWidgetSize(widgetInfo)}
        />
      ),
    });
  } catch (err) {
    console.warn('Up Next widget sync failed', err);
  }
}

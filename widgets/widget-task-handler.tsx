import { readWidgetUpNext } from '@/utils/widget-up-next';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { isUpNextWidgetCompact, UpNextWidget } from './up-next-widget';

// Runs as a headless JS task, outside the app's React tree — no auth or Firestore
// here. Content comes from the AsyncStorage cache the Home screen writes.
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (props.widgetInfo.widgetName !== 'UpNext') return;

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(
        <UpNextWidget
          {...(await readWidgetUpNext())}
          compact={isUpNextWidgetCompact(props.widgetInfo)}
        />
      );
      break;
    default:
      // WIDGET_DELETED / WIDGET_CLICK — clicks are handled by OPEN_URI natively.
      break;
  }
}

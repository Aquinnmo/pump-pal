"use no memo";

import { WidgetUpNext } from '@/utils/widget-up-next';
import {
  FlexWidget,
  TextWidget,
  type WidgetInfo,
} from 'react-native-android-widget';

type UpNextWidgetProps = WidgetUpNext & {
  compact?: boolean;
};

// A 2×1 widget has room for one actionable line. Once it gets more room, use
// the fuller three-line hierarchy from the Home screen's Up Next card.
export function isUpNextWidgetCompact({
  width,
  height,
}: Pick<WidgetInfo, 'width' | 'height'>): boolean {
  return width < 220 || height < 88;
}

// Mirrors the Home screen's Up Next card (app/(tabs)/index.tsx), with a
// condensed layout for its 2×1 minimum footprint.
export function UpNextWidget({
  label,
  name,
  action,
  compact = false,
}: UpNextWidgetProps) {
  if (compact) {
    return (
      <FlexWidget
        style={{
          height: 'match_parent',
          width: 'match_parent',
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#1c1c1c',
          borderRadius: 14,
          borderWidth: 1,
          borderColor: '#2a2a2a',
          paddingHorizontal: 12,
          flexGap: 8,
        }}
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'pumppal://up-next' }}
        accessibilityLabel={`${label}, ${name}. ${action}`}>
        <FlexWidget
          style={{ width: 3, height: 'match_parent', backgroundColor: '#e54242' }}
        />
        <TextWidget
          text={name}
          maxLines={1}
          truncate="END"
          style={{
            flex: 1,
            fontSize: 16,
            fontWeight: '700',
            color: '#fff',
          }}
        />
      </FlexWidget>
    );
  }

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1c1c1c',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#2a2a2a',
      }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'pumppal://up-next' }}
      accessibilityLabel={`${label}, ${name}. ${action}`}>
      <FlexWidget
        style={{
          width: 3,
          height: 'match_parent',
          marginVertical: 16,
          backgroundColor: '#e54242',
        }}
      />
      <FlexWidget
        style={{
          flex: 1,
          height: 'match_parent',
          flexDirection: 'column',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 16,
        }}>
        <TextWidget
          text={label}
          maxLines={1}
          style={{
            fontSize: 12,
            fontWeight: '700',
            letterSpacing: 1.4,
            color: '#e54242',
          }}
        />
        <TextWidget
          text={name}
          maxLines={2}
          truncate="END"
          style={{ fontSize: 18, fontWeight: '700', color: '#fff' }}
        />
        <TextWidget
          text={action}
          maxLines={1}
          style={{ fontSize: 14, fontWeight: '500', color: '#888' }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

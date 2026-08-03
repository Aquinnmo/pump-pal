"use no memo";

import type { WidgetUpNext } from '@/utils/widget-up-next';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { type UpNextWidgetSize } from './up-next-widget-size';

export { getUpNextWidgetSize } from './up-next-widget-size';

type UpNextWidgetProps = WidgetUpNext & {
  size?: UpNextWidgetSize;
};

const clickProps = {
  clickAction: 'OPEN_URI' as const,
  clickActionData: { uri: 'pumppal://up-next' },
};

export function UpNextWidget({
  label,
  name,
  action,
  source,
  size = 'small',
}: UpNextWidgetProps) {
  const accessibilityLabel = `${label}, ${name}. ${source}. ${action}`;

  if (size === 'small') {
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
          overflow: 'hidden',
        }}
        {...clickProps}
        accessibilityLabel={accessibilityLabel}>
        <FlexWidget
          style={{
            width: 4,
            height: 24,
            borderRadius: 999,
            backgroundColor: '#e54242',
          }}
        />
        <FlexWidget style={{ flex: 1 }}>
          <TextWidget
            text={name}
            maxLines={1}
            truncate="END"
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: '#fff',
              adjustsFontSizeToFit: true,
            }}
          />
        </FlexWidget>
        <TextWidget
          text="›"
          maxLines={1}
          style={{ fontSize: 24, fontWeight: '500', color: '#e54242' }}
        />
      </FlexWidget>
    );
  }

  if (size === 'compact') {
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
          paddingRight: 12,
          overflow: 'hidden',
        }}
        {...clickProps}
        accessibilityLabel={accessibilityLabel}>
        <FlexWidget
          style={{
            width: 4,
            height: 'match_parent',
            backgroundColor: '#e54242',
          }}
        />
        <FlexWidget
          style={{
            flex: 1,
            flexDirection: 'column',
            justifyContent: 'center',
            paddingHorizontal: 12,
            paddingVertical: 8,
            flexGap: 4,
          }}>
          <TextWidget
            text={label.toUpperCase()}
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
            maxLines={1}
            truncate="END"
            style={{ fontSize: 17, fontWeight: '700', color: '#fff' }}
          />
        </FlexWidget>
        <TextWidget
          text="›"
          maxLines={1}
          style={{ fontSize: 24, fontWeight: '500', color: '#888' }}
        />
      </FlexWidget>
    );
  }

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: '#1c1c1c',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#2a2a2a',
        overflow: 'hidden',
      }}
      {...clickProps}
      accessibilityLabel={accessibilityLabel}>
      <FlexWidget style={{ height: 4, flexDirection: 'row' }}>
        <FlexWidget style={{ width: 44, backgroundColor: '#e54242' }} />
        <FlexWidget style={{ flex: 1, backgroundColor: '#2a2a2a' }} />
      </FlexWidget>
      <FlexWidget
        style={{
          flex: 1,
          flexDirection: 'column',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 16,
        }}>
        <FlexWidget
          style={{ flexDirection: 'row', alignItems: 'center', flexGap: 8 }}>
          <FlexWidget
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              backgroundColor: '#e54242',
            }}
          />
          <TextWidget
            text={label.toUpperCase()}
            maxLines={1}
            style={{
              fontSize: 12,
              fontWeight: '700',
              letterSpacing: 1.4,
              color: '#e54242',
            }}
          />
          <FlexWidget
            style={{ width: 1, height: 12, backgroundColor: '#2a2a2a' }}
          />
          <FlexWidget style={{ flex: 1 }}>
            <TextWidget
              text={source}
              maxLines={1}
              truncate="END"
              style={{ fontSize: 12, fontWeight: '700', color: '#888' }}
            />
          </FlexWidget>
        </FlexWidget>
        <TextWidget
          text={name}
          maxLines={2}
          truncate="END"
          style={{
            fontSize: 24,
            fontWeight: '700',
            letterSpacing: -0.5,
            color: '#fff',
          }}
        />
        <FlexWidget
          style={{ flexDirection: 'row', alignItems: 'center', flexGap: 8 }}>
          <FlexWidget style={{ flex: 1 }}>
            <TextWidget
              text={action}
              maxLines={1}
              truncate="END"
              style={{ fontSize: 14, fontWeight: '500', color: '#fff' }}
            />
          </FlexWidget>
          <TextWidget
            text="›"
            maxLines={1}
            style={{ fontSize: 24, fontWeight: '500', color: '#e54242' }}
          />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}

import { WidgetUpNext } from '@/utils/widget-up-next';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

// Mirrors the Home screen's Up Next card (app/(tabs)/index.tsx): accent bar,
// label + workout name + action line, same surface/border/type colors.
export function UpNextWidget({ label, name, action }: WidgetUpNext) {
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1a1818',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#332626',
      }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'pumppal://up-next' }}
      accessibilityLabel={`${label}, ${name}. ${action}`}>
      <FlexWidget
        style={{
          width: 3,
          height: 'match_parent',
          marginVertical: 18,
          backgroundColor: '#e54242',
        }}
      />
      <FlexWidget
        style={{
          flex: 1,
          height: 'match_parent',
          flexDirection: 'column',
          justifyContent: 'space-between',
          paddingHorizontal: 18,
          paddingVertical: 16,
        }}>
        <TextWidget
          text={label}
          maxLines={1}
          style={{ fontSize: 13, fontWeight: '600', color: '#d88383' }}
        />
        <TextWidget
          text={name}
          maxLines={2}
          truncate="END"
          style={{ fontSize: 22, fontWeight: '700', color: '#ffffff' }}
        />
        <TextWidget
          text={action}
          maxLines={1}
          style={{ fontSize: 13, fontWeight: '600', color: '#e8e8e8' }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

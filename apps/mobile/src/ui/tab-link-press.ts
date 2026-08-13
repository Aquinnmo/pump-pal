/**
 * Web click policy for the tab bar's anchors, split out of src/ui/haptic-tab.tsx
 * so it can be tested without a DOM or a react-native transform.
 *
 * The tab bar hands every button an `href`, and react-native-web renders a
 * Pressable carrying one as a real `<a href>`. expo-router's BottomTabBar only
 * emits `tabPress` and dispatches a navigate action — it never touches the DOM
 * event — so cancelling the anchor's default navigation is the button
 * component's job. Without it a tab press is a full document load: the whole app
 * reboots, the account gate in app/_layout.tsx flashes its loader, and every
 * cached read dies with the JS context.
 *
 * Same conditions expo-router's (deprecated) PlatformPressable used, and for the
 * same reason: a modified or non-left click belongs to the browser — ⌘-click
 * opens a background tab — so it must keep the native behaviour, and the app
 * must not also navigate in place.
 */
export type TabPressEvent = {
  metaKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  button?: number | null;
  currentTarget?: { target?: string | null } | null;
};

export function shouldPreventDefault(event: TabPressEvent): boolean {
  if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return false;
  if (event.button != null && event.button !== 0) return false;
  const target = event.currentTarget?.target;
  return target === undefined || target === null || target === '' || target === 'self';
}

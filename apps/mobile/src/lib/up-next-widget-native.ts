// No-op surface for Android/web. iOS hands the widget its copy to the native
// module (up-next-widget-native.ios.ts); Android renders from AsyncStorage.
export function setUpNextWidgetNative(_json: string): void {}

export function clearUpNextWidgetNative(): void {}

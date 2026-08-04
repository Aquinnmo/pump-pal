import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { LiveUpdateNotificationPayload } from './LiveUpdateNotification.types';

declare class LiveUpdateNotificationNativeModule extends NativeModule<{
  onNotificationAction: (event: { json: string }) => void;
}> {
  isSupported(): boolean;
  show(payload: LiveUpdateNotificationPayload): boolean;
  dismiss(): void;
}

// Android-only native module (see expo-module.config.json) that also won't
// exist on a dev client built before this module landed, so it may be absent
// even on Android. requireOptionalNativeModule returns null instead of
// throwing in either case; every caller below must tolerate that.
const nativeModule =
  requireOptionalNativeModule<LiveUpdateNotificationNativeModule>('LiveUpdateNotification');

export function isSupported(): boolean {
  return nativeModule?.isSupported() ?? false;
}

export function show(payload: LiveUpdateNotificationPayload): boolean {
  return nativeModule?.show(payload) ?? false;
}

export function dismiss(): void {
  nativeModule?.dismiss();
}

export function subscribeActions(onAction: (json: string) => void): () => void {
  if (!nativeModule) return () => {};
  const subscription = nativeModule.addListener('onNotificationAction', ({ json }) => onAction(json));
  return () => subscription.remove();
}

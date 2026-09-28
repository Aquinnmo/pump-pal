import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { LiveUpdateNotificationPayload } from './LiveUpdateNotification.types';

declare class LiveUpdateNotificationNativeModule extends NativeModule<{
  onNotificationAction: (event: { json: string }) => void;
  onJournalChanged: () => void;
}> {
  isSupported(): boolean;
  show(payload: LiveUpdateNotificationPayload): boolean;
  dismiss(): void;
  // iOS only: awaits ActivityKit, and exposes the journal of taps applied natively.
  showAsync?(payload: LiveUpdateNotificationPayload): Promise<boolean>;
  dismissAsync?(): Promise<void>;
  readJournal?(): string;
  acknowledgeJournal?(ids: string[]): Promise<boolean>;
}

// Android-only native module (see expo-module.config.json) that also won't
// exist on a dev client built before this module landed, so it may be absent
// even on Android. requireOptionalNativeModule returns null instead of
// throwing in either case; every caller below must tolerate that.
const nativeModule =
  requireOptionalNativeModule<LiveUpdateNotificationNativeModule>('LiveUpdateNotification');

/** Whether the optional native module is present in this installed client. */
export function isNativeModuleAvailable(): boolean {
  return nativeModule != null;
}

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

export function readJournal(): string {
  return nativeModule?.readJournal?.() ?? '[]';
}

export async function acknowledgeJournal(ids: string[]): Promise<boolean> {
  return (await nativeModule?.acknowledgeJournal?.(ids)) ?? false;
}

export function subscribeJournal(onChange: () => void): () => void {
  if (!nativeModule?.readJournal) return () => {};
  const subscription = nativeModule.addListener('onJournalChanged', onChange);
  return () => subscription.remove();
}

export async function showAsync(payload: LiveUpdateNotificationPayload): Promise<boolean> {
  return nativeModule?.showAsync ? nativeModule.showAsync(payload) : show(payload);
}

export async function dismissAsync(): Promise<void> {
  if (nativeModule?.dismissAsync) await nativeModule.dismissAsync();
  else dismiss();
}

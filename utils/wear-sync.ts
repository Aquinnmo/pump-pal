import { WearAction, WearState } from '@/utils/wear-state';

// No-op stub for iOS/web. The Android implementation lives in wear-sync.android.ts;
// same split as workout-notification.ts / .android.ts.
export function pushWearState(_state: WearState): void {}

export function subscribeWearActions(_onAction: (action: WearAction) => void): () => void {
  return () => {};
}

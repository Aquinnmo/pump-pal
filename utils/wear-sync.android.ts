import { wearSyncNativeModule } from '@/modules/wear-sync';
import { WearAction, WearState } from '@/utils/wear-state';

// Bridge to the paired Wear OS app. Both calls are safe no-ops when the native module
// is missing (dev client built before it landed) or no watch is paired.

export function pushWearState(state: WearState): void {
  try {
    wearSyncNativeModule?.pushState(JSON.stringify(state));
  } catch (err) {
    console.warn('Wear state push failed', err);
  }
}

// The watch only sends the four actions in WearAction; anything else is a version
// mismatch and gets dropped rather than fed into the draft state.
const KNOWN: WearAction['action'][] = ['startWorkout', 'completeSet', 'uncompleteSet', 'finishWorkout'];

export function subscribeWearActions(onAction: (action: WearAction) => void): () => void {
  if (!wearSyncNativeModule) return () => {};

  const sub = wearSyncNativeModule.addListener('onWearAction', ({ json }) => {
    try {
      const parsed = JSON.parse(json) as WearAction;
      if (!KNOWN.includes(parsed?.action)) return;
      onAction(parsed);
    } catch (err) {
      console.warn('Bad wear action payload', err);
    }
  });

  return () => sub.remove();
}

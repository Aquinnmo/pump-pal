import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class WearSyncNativeModule extends NativeModule<{ onWearAction: (event: { json: string }) => void }> {
  pushState(json: string): boolean;
}

// Android-only (see expo-module.config.json), and absent from any dev client built
// before this module landed. requireOptionalNativeModule returns null rather than
// throwing in both cases; every caller must tolerate that.
export const wearSyncNativeModule = requireOptionalNativeModule<WearSyncNativeModule>('WearSync');

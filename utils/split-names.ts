import { profileRepository } from '@/db/profile-repository';
import { isSplitOption } from '@/constants/split-options';
import { SPLIT_WORKOUT_NAMES } from '@/constants/split-workout-names';
import { generateSplitWorkoutNames } from '@/utils/workout-suggestions';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Resolves the ordered workout-day names for a user's split. Preset splits map
// straight to a constant; a custom ("Other") split is named once by the AI and
// then cached per description so later loads are offline/free.
export async function loadSplitNames(uid: string): Promise<string[]> {
  const profile = await profileRepository.get(uid);
  const userData = profile?.data;
  const splitType = userData?.workoutSplit?.type;
  const customSplitDesc: string = userData?.workoutSplit?.custom ?? '';
  let splitNames: string[] = isSplitOption(splitType) ? SPLIT_WORKOUT_NAMES[splitType] : [];

  if (splitType === 'Other' && customSplitDesc) {
    const cacheKey = `pumppal_split_names_v2_${customSplitDesc.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 60)}`;
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      try { splitNames = JSON.parse(cached); } catch { /* ignore */ }
    } else {
      try {
        const generated = await generateSplitWorkoutNames(customSplitDesc);
        if (generated.length > 0) {
          splitNames = generated;
          await AsyncStorage.setItem(cacheKey, JSON.stringify(generated));
        }
      } catch { /* keep the caller usable with its fallback label */ }
    }
  }

  return splitNames;
}

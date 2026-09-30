import AsyncStorage from '@react-native-async-storage/async-storage';
import { bumpDataVersion } from '@/data/data-version';
import { useDataVersion } from '@/hooks/use-data-version';
import { useEffect, useState } from 'react';

// Device-local on purpose: how a plan is pre-filled is a per-device editing
// preference, not account data, so it stays out of the synced profile and
// firestore.rules. Missing means on — normalization is the default.
const STORAGE_KEY = 'pumppal_normalize_autofill';

export async function getNormalizeAutoFill(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) !== 'false';
  } catch {
    return true;
  }
}

export async function setNormalizeAutoFill(on: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, on ? 'true' : 'false');
  bumpDataVersion();
}

export function useNormalizeAutoFill(): boolean {
  const dataVersion = useDataVersion();
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getNormalizeAutoFill().then((next) => {
      if (!cancelled) setEnabled(next);
    });
    return () => { cancelled = true; };
  }, [dataVersion]);

  return enabled;
}

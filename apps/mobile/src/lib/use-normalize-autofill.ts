import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

// Device-local on purpose: how a plan is pre-filled is a per-device editing
// preference, not account data, so it stays out of the synced profile and
// firestore.rules. Missing means on — normalization is the default.
const STORAGE_KEY = 'pumppal_normalize_autofill';

// In-memory copy so a toggle is reflected synchronously. A Switch whose value
// only catches up after an async write + re-read snaps back for a frame, then
// flips again — the flicker. Same shape as src/data/data-version.ts.
let enabled = true;
let touched = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

function load(): Promise<void> {
  loading ??= AsyncStorage.getItem(STORAGE_KEY).then(
    (stored) => {
      // A toggle that landed while this read was in flight is newer than the read.
      if (touched) return;
      enabled = stored !== 'false';
      emit();
    },
    () => {}
  );
  return loading;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => enabled;

export async function getNormalizeAutoFill(): Promise<boolean> {
  await load();
  return enabled;
}

export async function setNormalizeAutoFill(on: boolean): Promise<void> {
  const previous = enabled;
  touched = true;
  enabled = on;
  emit();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, on ? 'true' : 'false');
  } catch (err) {
    enabled = previous;
    emit();
    throw err;
  }
}

export function useNormalizeAutoFill(): boolean {
  useEffect(() => {
    load();
  }, []);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

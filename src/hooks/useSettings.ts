import { useCallback, useMemo } from "react";

export const STORAGE_KEYS = {
  inputMode: "sf6_input_mode",
  directionMode: "sf6_direction_mode",
  directionDisplayMode: "sf6_direction_display_mode",
  downDisplayMode: "sf6_down_display_mode",
  buttonBindings: "sf6_button_bindings",
  buttonBindingsLegacy: "sf6_button_bindings:v2",
  resetTrialBinding: "sf6_reset_trial_binding",
  resetTrialBindingLegacy: "sf6_reset_trial_binding:v1",
  trialModeOverride: "sf6_trial_mode_override",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export type SettingsStore = {
  read: (key: StorageKey) => string | null;
  write: (key: StorageKey, value: string) => void;
  remove: (key: StorageKey) => void;
};

function resolveLocalStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
}

export function readStorageKey(key: StorageKey): string | null {
  const storage = resolveLocalStorage();
  if (!storage) {
    return null;
  }

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorageKey(key: StorageKey, value: string): void {
  const storage = resolveLocalStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, value);
  } catch {
    // Ignore write failures (private mode / quota exceeded).
  }
}

export function removeStorageKey(key: StorageKey): void {
  const storage = resolveLocalStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(key);
  } catch {
    // Ignore remove failures.
  }
}

export function useSettings(): SettingsStore & { keys: typeof STORAGE_KEYS } {
  const read = useCallback((key: StorageKey) => readStorageKey(key), []);
  const write = useCallback((key: StorageKey, value: string) => writeStorageKey(key, value), []);
  const remove = useCallback((key: StorageKey) => removeStorageKey(key), []);

  return useMemo(
    () => ({
      keys: STORAGE_KEYS,
      read,
      write,
      remove,
    }),
    [read, write, remove],
  );
}

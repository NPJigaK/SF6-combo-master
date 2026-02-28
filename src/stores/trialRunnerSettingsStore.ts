import { createDefaultButtonBindings, normalizeButtonBindings, setBinding } from "../domain/input/buttonMapping";
import { isDirectionMode, type DirectionMode } from "../domain/input/direction";
import { normalizeResetTrialBinding } from "../domain/input/resetBinding";
import {
  ATTACK_ACTION_IDS,
  isPhysicalButton as isKnownPhysicalButton,
  type AttackActionId,
  type ButtonBindings,
  type InputMode,
  type PhysicalButton,
} from "../domain/input/types";
import type { TrialMode } from "../domain/trial/schema";
import {
  isDirectionDisplayMode,
  isDownDisplayMode,
  type DirectionDisplayMode,
  type DownDisplayMode,
} from "../components/trial-runner/inputDisplayRenderers";
import { STORAGE_KEYS, readStorageKey, removeStorageKey, writeStorageKey } from "../hooks/useSettings";
import { createStore } from "./createStore";

const INPUT_MODES: readonly InputMode[] = ["auto", "xinput", "hid", "web"];
const TRIAL_MODES: readonly TrialMode[] = ["timeline", "stepper"];

function isInputMode(value: string): value is InputMode {
  return INPUT_MODES.includes(value as InputMode);
}

function isTrialMode(value: string): value is TrialMode {
  return TRIAL_MODES.includes(value as TrialMode);
}

function isPhysicalButton(value: unknown): value is PhysicalButton {
  return typeof value === "string" && isKnownPhysicalButton(value);
}

function parseStoredButtonBindingsValue(stored: string): ButtonBindings | null {
  const parsed = JSON.parse(stored) as unknown;
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const partial: Partial<Record<AttackActionId, PhysicalButton | null>> = {};
  const record = parsed as Record<string, unknown>;

  for (const actionId of ATTACK_ACTION_IDS) {
    const value = record[actionId];
    if (value === null) {
      partial[actionId] = null;
    } else if (isPhysicalButton(value)) {
      partial[actionId] = value;
    }
  }

  return normalizeButtonBindings(partial);
}

function parseStoredResetTrialBindingValue(stored: string): PhysicalButton[] | null {
  const parsed = JSON.parse(stored) as unknown;
  if (!Array.isArray(parsed)) {
    return null;
  }

  const collected: PhysicalButton[] = [];
  for (const value of parsed) {
    if (isPhysicalButton(value)) {
      collected.push(value);
    }
  }

  return normalizeResetTrialBinding(collected);
}

function readStoredInputMode(): InputMode {
  const stored = readStorageKey(STORAGE_KEYS.inputMode);
  if (stored && isInputMode(stored)) {
    return stored;
  }
  return "auto";
}

function readStoredDirectionMode(): DirectionMode {
  const stored = readStorageKey(STORAGE_KEYS.directionMode);
  if (stored && isDirectionMode(stored)) {
    return stored;
  }
  return "normal";
}

function readStoredDirectionDisplayMode(): DirectionDisplayMode {
  const stored = readStorageKey(STORAGE_KEYS.directionDisplayMode);
  if (stored && isDirectionDisplayMode(stored)) {
    return stored;
  }
  return "number";
}

function readStoredDownDisplayMode(): DownDisplayMode {
  const stored = readStorageKey(STORAGE_KEYS.downDisplayMode);
  if (stored && isDownDisplayMode(stored)) {
    return stored;
  }
  return "text";
}

function readStoredTrialModeOverride(): TrialMode | null {
  const stored = readStorageKey(STORAGE_KEYS.trialModeOverride);
  if (!stored || !isTrialMode(stored)) {
    return null;
  }
  return stored;
}

function readStoredButtonBindings(): ButtonBindings {
  const fallback = createDefaultButtonBindings();
  try {
    const current = readStorageKey(STORAGE_KEYS.buttonBindings);
    if (current) {
      const parsedCurrent = parseStoredButtonBindingsValue(current);
      if (parsedCurrent) {
        return parsedCurrent;
      }
    }

    const legacy = readStorageKey(STORAGE_KEYS.buttonBindingsLegacy);
    if (!legacy) {
      return fallback;
    }

    const parsedLegacy = parseStoredButtonBindingsValue(legacy);
    if (!parsedLegacy) {
      return fallback;
    }

    writeStorageKey(STORAGE_KEYS.buttonBindings, JSON.stringify(parsedLegacy));
    removeStorageKey(STORAGE_KEYS.buttonBindingsLegacy);
    return parsedLegacy;
  } catch {
    return fallback;
  }
}

function readStoredResetTrialBinding(): PhysicalButton[] {
  try {
    const current = readStorageKey(STORAGE_KEYS.resetTrialBinding);
    if (current) {
      const parsedCurrent = parseStoredResetTrialBindingValue(current);
      if (parsedCurrent) {
        return parsedCurrent;
      }
    }

    const legacy = readStorageKey(STORAGE_KEYS.resetTrialBindingLegacy);
    if (!legacy) {
      return [];
    }

    const parsedLegacy = parseStoredResetTrialBindingValue(legacy);
    if (!parsedLegacy) {
      return [];
    }

    writeStorageKey(STORAGE_KEYS.resetTrialBinding, JSON.stringify(parsedLegacy));
    removeStorageKey(STORAGE_KEYS.resetTrialBindingLegacy);
    return parsedLegacy;
  } catch {
    return [];
  }
}

function arePhysicalButtonArraysEqual(left: readonly PhysicalButton[], right: readonly PhysicalButton[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

export type TrialRunnerSettingsState = {
  inputMode: InputMode;
  directionMode: DirectionMode;
  directionDisplayMode: DirectionDisplayMode;
  downDisplayMode: DownDisplayMode;
  trialModeOverride: TrialMode | null;
  buttonBindings: ButtonBindings;
  resetTrialBinding: PhysicalButton[];
  setInputMode: (inputMode: InputMode) => void;
  setDirectionMode: (directionMode: DirectionMode) => void;
  setDirectionDisplayMode: (directionDisplayMode: DirectionDisplayMode) => void;
  setDownDisplayMode: (downDisplayMode: DownDisplayMode) => void;
  setTrialModeOverride: (trialModeOverride: TrialMode) => void;
  setButtonBinding: (actionId: AttackActionId, physicalButton: PhysicalButton | null) => void;
  setResetTrialBinding: (resetTrialBinding: PhysicalButton[]) => void;
  resetBindingsToDefault: () => void;
};

export const useTrialRunnerSettingsStore = createStore<TrialRunnerSettingsState>((set) => ({
  inputMode: readStoredInputMode(),
  directionMode: readStoredDirectionMode(),
  directionDisplayMode: readStoredDirectionDisplayMode(),
  downDisplayMode: readStoredDownDisplayMode(),
  trialModeOverride: readStoredTrialModeOverride(),
  buttonBindings: readStoredButtonBindings(),
  resetTrialBinding: readStoredResetTrialBinding(),
  setInputMode: (inputMode) => {
    set((previous) => {
      if (previous.inputMode === inputMode) {
        return previous;
      }
      return { inputMode };
    });
    writeStorageKey(STORAGE_KEYS.inputMode, inputMode);
  },
  setDirectionMode: (directionMode) => {
    set((previous) => {
      if (previous.directionMode === directionMode) {
        return previous;
      }
      return { directionMode };
    });
    writeStorageKey(STORAGE_KEYS.directionMode, directionMode);
  },
  setDirectionDisplayMode: (directionDisplayMode) => {
    set((previous) => {
      if (previous.directionDisplayMode === directionDisplayMode) {
        return previous;
      }
      return { directionDisplayMode };
    });
    writeStorageKey(STORAGE_KEYS.directionDisplayMode, directionDisplayMode);
  },
  setDownDisplayMode: (downDisplayMode) => {
    set((previous) => {
      if (previous.downDisplayMode === downDisplayMode) {
        return previous;
      }
      return { downDisplayMode };
    });
    writeStorageKey(STORAGE_KEYS.downDisplayMode, downDisplayMode);
  },
  setTrialModeOverride: (trialModeOverride) => {
    set((previous) => {
      if (previous.trialModeOverride === trialModeOverride) {
        return previous;
      }
      return { trialModeOverride };
    });
    writeStorageKey(STORAGE_KEYS.trialModeOverride, trialModeOverride);
  },
  setButtonBinding: (actionId, physicalButton) => {
    set((previous) => {
      const nextBindings = setBinding(previous.buttonBindings, actionId, physicalButton);
      if (nextBindings === previous.buttonBindings) {
        return previous;
      }
      writeStorageKey(STORAGE_KEYS.buttonBindings, JSON.stringify(nextBindings));
      return {
        buttonBindings: nextBindings,
      };
    });
  },
  setResetTrialBinding: (resetTrialBinding) => {
    const normalized = normalizeResetTrialBinding(resetTrialBinding);
    set((previous) => {
      if (arePhysicalButtonArraysEqual(previous.resetTrialBinding, normalized)) {
        return previous;
      }
      writeStorageKey(STORAGE_KEYS.resetTrialBinding, JSON.stringify(normalized));
      return {
        resetTrialBinding: normalized,
      };
    });
  },
  resetBindingsToDefault: () => {
    const defaultBindings = createDefaultButtonBindings();
    set({
      buttonBindings: defaultBindings,
      resetTrialBinding: [],
    });
    writeStorageKey(STORAGE_KEYS.buttonBindings, JSON.stringify(defaultBindings));
    writeStorageKey(STORAGE_KEYS.resetTrialBinding, JSON.stringify([]));
  },
}));

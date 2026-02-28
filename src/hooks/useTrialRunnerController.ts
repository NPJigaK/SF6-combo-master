import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  createDefaultButtonBindings,
  normalizeButtonBindings,
  setBinding,
} from "../domain/input/buttonMapping";
import { computeResetTrialPressTrigger, normalizeResetTrialBinding } from "../domain/input/resetBinding";
import {
  ATTACK_ACTION_IDS,
  isPhysicalButton as isKnownPhysicalButton,
  type AttackActionId,
  type ButtonBindings,
  type InputFrame,
  type InputMode,
  type InputProviderKind,
  type PhysicalButton,
} from "../domain/input/types";
import type { DirectionMode } from "../domain/input/direction";
import type { InputHistoryEntry } from "../domain/input/history";
import type { TrialEngineSnapshot } from "../domain/trial-engine/core/types";
import type { CompiledTrial, CompiledTrialStep } from "../domain/trial/compiled";
import type { TrialMode } from "../domain/trial/schema";
import type { BindingTarget } from "../components/binding/ButtonBindingPanel";
import {
  isDirectionDisplayMode,
  isDownDisplayMode,
  renderButtonSet,
  renderDirectionValue,
  type DirectionDisplayMode,
  type DownDisplayMode,
} from "../components/trial-runner/inputDisplayRenderers";
import {
  isInputMode,
  isPlayerSideMode,
  isTrialMode,
  resolveAvailableTrialModes,
  resolveInitialTrialMode,
} from "../components/trial-runner/trialRunnerOptions";
import { useInputProvider } from "./useInputProvider";
import { STORAGE_KEYS, useSettings, type SettingsStore } from "./useSettings";
import { useSfx } from "./useSfx";
import { useTrialEngine } from "./useTrialEngine";

function readStoredInputMode(settings: SettingsStore): InputMode {
  const stored = settings.read(STORAGE_KEYS.inputMode);
  if (stored && isInputMode(stored)) {
    return stored;
  }

  return "auto";
}

function readStoredDirectionDisplayMode(settings: SettingsStore): DirectionDisplayMode {
  const stored = settings.read(STORAGE_KEYS.directionDisplayMode);
  if (stored && isDirectionDisplayMode(stored)) {
    return stored;
  }

  return "number";
}

function readStoredDirectionMode(settings: SettingsStore): DirectionMode {
  const stored = settings.read(STORAGE_KEYS.directionMode);
  if (stored && isPlayerSideMode(stored)) {
    return stored;
  }

  return "normal";
}

function readStoredDownDisplayMode(settings: SettingsStore): DownDisplayMode {
  const stored = settings.read(STORAGE_KEYS.downDisplayMode);
  if (stored && isDownDisplayMode(stored)) {
    return stored;
  }

  return "text";
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

function readStoredButtonBindings(settings: SettingsStore): ButtonBindings {
  const fallback = createDefaultButtonBindings();

  try {
    const current = settings.read(STORAGE_KEYS.buttonBindings);
    if (current) {
      const parsedCurrent = parseStoredButtonBindingsValue(current);
      if (parsedCurrent) {
        return parsedCurrent;
      }
    }

    const legacy = settings.read(STORAGE_KEYS.buttonBindingsLegacy);
    if (!legacy) {
      return fallback;
    }

    const parsedLegacy = parseStoredButtonBindingsValue(legacy);
    if (!parsedLegacy) {
      return fallback;
    }

    settings.write(STORAGE_KEYS.buttonBindings, JSON.stringify(parsedLegacy));
    settings.remove(STORAGE_KEYS.buttonBindingsLegacy);
    return parsedLegacy;
  } catch {
    return fallback;
  }
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

function readStoredResetTrialBinding(settings: SettingsStore): PhysicalButton[] {
  try {
    const current = settings.read(STORAGE_KEYS.resetTrialBinding);
    if (current) {
      const parsedCurrent = parseStoredResetTrialBindingValue(current);
      if (parsedCurrent) {
        return parsedCurrent;
      }
    }

    const legacy = settings.read(STORAGE_KEYS.resetTrialBindingLegacy);
    if (!legacy) {
      return [];
    }

    const parsedLegacy = parseStoredResetTrialBindingValue(legacy);
    if (!parsedLegacy) {
      return [];
    }

    settings.write(STORAGE_KEYS.resetTrialBinding, JSON.stringify(parsedLegacy));
    settings.remove(STORAGE_KEYS.resetTrialBindingLegacy);
    return parsedLegacy;
  } catch {
    return [];
  }
}

export type UseTrialRunnerControllerOptions = {
  trial: CompiledTrial;
};

export type UseTrialRunnerControllerResult = {
  trialSnapshot: TrialEngineSnapshot;
  currentStep: CompiledTrialStep | null;
  visibleFrames: InputFrame[];
  visibleHistoryEntries: InputHistoryEntry[];
  selectedTrialMode: TrialMode;
  availableTrialModes: TrialMode[];
  allowModeOverride: boolean;
  inputMode: InputMode;
  directionMode: DirectionMode;
  directionDisplayMode: DirectionDisplayMode;
  downDisplayMode: DownDisplayMode;
  providerKind: InputProviderKind;
  providerLoading: boolean;
  providerError: string | null;
  isBindingsOpen: boolean;
  pendingBindingTarget: BindingTarget | null;
  buttonBindings: ButtonBindings;
  resetTrialBinding: PhysicalButton[];
  renderDirection: (direction: number | undefined) => ReactNode;
  renderButtons: (buttons: readonly string[]) => ReactNode;
  handleTrialModeChange: (value: string) => void;
  handleInputModeChange: (value: string) => void;
  handleDirectionModeChange: (value: string) => void;
  handleDirectionDisplayModeChange: (value: string) => void;
  handleDownDisplayModeChange: (value: string) => void;
  handleOpenBindings: () => void;
  handleCloseBindings: () => void;
  handleStartBinding: (actionId: AttackActionId) => void;
  handleClearBinding: (actionId: AttackActionId) => void;
  handleCancelBinding: () => void;
  handleStartResetTrialBinding: () => void;
  handleClearResetTrialBinding: () => void;
  handleResetBindingsToDefault: () => void;
  handleReset: () => void;
};

export function useTrialRunnerController({ trial }: UseTrialRunnerControllerOptions): UseTrialRunnerControllerResult {
  const settings = useSettings();
  const [selectedTrialMode, setSelectedTrialMode] = useState<TrialMode>(() =>
    resolveInitialTrialMode(trial, settings),
  );
  const availableTrialModes = useMemo(() => resolveAvailableTrialModes(), []);
  const [inputMode, setInputMode] = useState<InputMode>(() => readStoredInputMode(settings));
  const [directionMode, setDirectionMode] = useState<DirectionMode>(() => readStoredDirectionMode(settings));
  const [directionDisplayMode, setDirectionDisplayMode] = useState<DirectionDisplayMode>(() =>
    readStoredDirectionDisplayMode(settings),
  );
  const [downDisplayMode, setDownDisplayMode] = useState<DownDisplayMode>(() =>
    readStoredDownDisplayMode(settings),
  );
  const [buttonBindings, setButtonBindings] = useState<ButtonBindings>(() => readStoredButtonBindings(settings));
  const [resetTrialBinding, setResetTrialBinding] = useState<PhysicalButton[]>(() =>
    readStoredResetTrialBinding(settings),
  );
  const [pendingBindingTarget, setPendingBindingTarget] = useState<BindingTarget | null>(null);
  const [isBindingsOpen, setIsBindingsOpen] = useState(false);
  const {
    snapshot: trialSnapshot,
    recentFrames,
    inputHistory,
    advanceFrame,
    reset: resetTrialEngine,
  } = useTrialEngine({ trial, modeOverride: selectedTrialMode, directionMode });
  const { playSuccess } = useSfx();
  const previousStatusRef = useRef<TrialEngineSnapshot["status"]>(trialSnapshot.status);
  const buttonBindingsRef = useRef<ButtonBindings>(buttonBindings);
  const resetTrialBindingRef = useRef<PhysicalButton[]>(resetTrialBinding);
  const pendingBindingTargetRef = useRef<BindingTarget | null>(pendingBindingTarget);
  const resetTrialComboActiveRef = useRef(false);
  const pendingResetCaptureRef = useRef<Set<PhysicalButton>>(new Set());
  const pendingResetCaptureArmedRef = useRef(false);

  const clearPendingResetCapture = useCallback(() => {
    pendingResetCaptureRef.current.clear();
    pendingResetCaptureArmedRef.current = false;
  }, []);

  const handleInputModeChange = (value: string) => {
    if (!isInputMode(value)) {
      return;
    }
    setInputMode(value);
  };

  const handleDirectionDisplayModeChange = (value: string) => {
    if (!isDirectionDisplayMode(value)) {
      return;
    }
    setDirectionDisplayMode(value);
  };

  const handleDirectionModeChange = (value: string) => {
    if (!isPlayerSideMode(value)) {
      return;
    }
    setDirectionMode(value);
  };

  const handleDownDisplayModeChange = (value: string) => {
    if (!isDownDisplayMode(value)) {
      return;
    }
    setDownDisplayMode(value);
  };

  const handleTrialModeChange = (value: string) => {
    if (!isTrialMode(value)) {
      return;
    }
    if (!availableTrialModes.includes(value)) {
      return;
    }
    setSelectedTrialMode(value);
  };

  const handleStartBinding = (actionId: AttackActionId) => {
    clearPendingResetCapture();
    setPendingBindingTarget(actionId);
  };

  const handleStartResetTrialBinding = () => {
    clearPendingResetCapture();
    setPendingBindingTarget("resetTrial");
  };

  const handleCancelBinding = () => {
    clearPendingResetCapture();
    setPendingBindingTarget(null);
  };

  const handleClearBinding = (actionId: AttackActionId) => {
    setButtonBindings((previous) => setBinding(previous, actionId, null));
    setPendingBindingTarget((current) => (current === actionId ? null : current));
  };

  const handleClearResetTrialBinding = () => {
    setResetTrialBinding([]);
    clearPendingResetCapture();
    setPendingBindingTarget((current) => (current === "resetTrial" ? null : current));
  };

  const handleResetBindingsToDefault = () => {
    setButtonBindings(createDefaultButtonBindings());
    setResetTrialBinding([]);
    clearPendingResetCapture();
    resetTrialComboActiveRef.current = false;
    setPendingBindingTarget(null);
  };

  const handleOpenBindings = () => {
    setIsBindingsOpen(true);
  };

  const handleCloseBindings = () => {
    clearPendingResetCapture();
    setPendingBindingTarget(null);
    setIsBindingsOpen(false);
  };

  const onInputFrame = useCallback(
    (frame: InputFrame) => {
      const pendingTarget = pendingBindingTargetRef.current;
      if (pendingTarget === "resetTrial") {
        if (frame.physicalDown.length > 0) {
          pendingResetCaptureArmedRef.current = true;
          for (const button of frame.physicalDown) {
            pendingResetCaptureRef.current.add(button);
          }
          return;
        }

        if (pendingResetCaptureArmedRef.current) {
          const capturedButtons = normalizeResetTrialBinding(Array.from(pendingResetCaptureRef.current));
          setResetTrialBinding(capturedButtons);
          clearPendingResetCapture();
          setPendingBindingTarget(null);
          return;
        }

        return;
      }

      if (pendingTarget) {
        const physical = frame.physicalPressed[0];
        if (physical) {
          setButtonBindings((previous) => setBinding(previous, pendingTarget, physical));
          setPendingBindingTarget(null);
        }
        return;
      }

      const { active, triggered } = computeResetTrialPressTrigger(
        frame,
        resetTrialBindingRef.current,
        resetTrialComboActiveRef.current,
      );
      resetTrialComboActiveRef.current = active;
      if (triggered) {
        resetTrialEngine();
        return;
      }

      advanceFrame(frame);
    },
    [advanceFrame, clearPendingResetCapture, resetTrialEngine],
  );

  const getCurrentButtonBindings = useCallback(() => buttonBindingsRef.current, []);
  const { providerKind, providerLoading, providerError } = useInputProvider({
    inputMode,
    getButtonBindings: getCurrentButtonBindings,
    onFrame: onInputFrame,
  });

  useEffect(() => {
    settings.write(settings.keys.inputMode, inputMode);
  }, [inputMode, settings]);

  useEffect(() => {
    settings.write(settings.keys.directionMode, directionMode);
  }, [directionMode, settings]);

  useEffect(() => {
    settings.write(settings.keys.directionDisplayMode, directionDisplayMode);
  }, [directionDisplayMode, settings]);

  useEffect(() => {
    settings.write(settings.keys.downDisplayMode, downDisplayMode);
  }, [downDisplayMode, settings]);

  useEffect(() => {
    settings.write(settings.keys.trialModeOverride, selectedTrialMode);
  }, [selectedTrialMode, settings]);

  useEffect(() => {
    if (availableTrialModes.includes(selectedTrialMode)) {
      return;
    }

    const fallback = resolveInitialTrialMode(trial, settings);
    setSelectedTrialMode(fallback);
  }, [availableTrialModes, selectedTrialMode, settings, trial]);

  useEffect(() => {
    buttonBindingsRef.current = buttonBindings;
  }, [buttonBindings]);

  useEffect(() => {
    resetTrialBindingRef.current = resetTrialBinding;
    resetTrialComboActiveRef.current = false;
  }, [resetTrialBinding]);

  useEffect(() => {
    pendingBindingTargetRef.current = pendingBindingTarget;
  }, [pendingBindingTarget]);

  useEffect(() => {
    settings.write(settings.keys.buttonBindings, JSON.stringify(buttonBindings));
  }, [buttonBindings, settings]);

  useEffect(() => {
    settings.write(settings.keys.resetTrialBinding, JSON.stringify(resetTrialBinding));
  }, [resetTrialBinding, settings]);

  useEffect(() => {
    resetTrialEngine();
  }, [buttonBindings, resetTrialEngine]);

  useEffect(() => {
    resetTrialEngine();
    clearPendingResetCapture();
    resetTrialComboActiveRef.current = false;
    setPendingBindingTarget(null);
  }, [clearPendingResetCapture, inputMode, resetTrialEngine]);

  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    const currentStatus = trialSnapshot.status;
    if (previousStatus === currentStatus) {
      return;
    }

    if (previousStatus === "running" && currentStatus === "success") {
      playSuccess();
    }

    previousStatusRef.current = currentStatus;
  }, [playSuccess, trialSnapshot.status]);

  const currentStep = useMemo(() => {
    return trial.steps[trialSnapshot.currentStepIndex] ?? null;
  }, [trial.steps, trialSnapshot.currentStepIndex]);

  const visibleFrames = useMemo(() => {
    return [...recentFrames].reverse();
  }, [recentFrames]);

  const visibleHistoryEntries = useMemo(() => {
    return [...inputHistory].reverse();
  }, [inputHistory]);

  const renderDirection = useCallback(
    (direction: number | undefined): ReactNode => renderDirectionValue(direction, directionDisplayMode),
    [directionDisplayMode],
  );
  const renderButtons = useCallback(
    (buttons: readonly string[]): ReactNode => renderButtonSet(buttons, downDisplayMode),
    [downDisplayMode],
  );

  return {
    trialSnapshot,
    currentStep,
    visibleFrames,
    visibleHistoryEntries,
    selectedTrialMode,
    availableTrialModes,
    allowModeOverride: trial.rules?.allowModeOverride ?? true,
    inputMode,
    directionMode,
    directionDisplayMode,
    downDisplayMode,
    providerKind,
    providerLoading,
    providerError,
    isBindingsOpen,
    pendingBindingTarget,
    buttonBindings,
    resetTrialBinding,
    renderDirection,
    renderButtons,
    handleTrialModeChange,
    handleInputModeChange,
    handleDirectionModeChange,
    handleDirectionDisplayModeChange,
    handleDownDisplayModeChange,
    handleOpenBindings,
    handleCloseBindings,
    handleStartBinding,
    handleClearBinding,
    handleCancelBinding,
    handleStartResetTrialBinding,
    handleClearResetTrialBinding,
    handleResetBindingsToDefault,
    handleReset: resetTrialEngine,
  };
}

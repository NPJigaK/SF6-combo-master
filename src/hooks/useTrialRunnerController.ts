import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { computeResetTrialPressTrigger } from "../domain/input/resetBinding";
import {
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
import { useTrialRunnerSettingsStore } from "../stores/trialRunnerSettingsStore";
import { useInputProvider } from "./useInputProvider";
import { useSfx } from "./useSfx";
import { useTrialEngine } from "./useTrialEngine";

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
  const availableTrialModes = useMemo(() => resolveAvailableTrialModes(), []);
  const allowModeOverride = trial.rules?.allowModeOverride ?? true;
  const trialModeOverride = useTrialRunnerSettingsStore((state) => state.trialModeOverride);
  const setTrialModeOverride = useTrialRunnerSettingsStore((state) => state.setTrialModeOverride);
  const inputMode = useTrialRunnerSettingsStore((state) => state.inputMode);
  const setInputMode = useTrialRunnerSettingsStore((state) => state.setInputMode);
  const directionMode = useTrialRunnerSettingsStore((state) => state.directionMode);
  const setDirectionMode = useTrialRunnerSettingsStore((state) => state.setDirectionMode);
  const directionDisplayMode = useTrialRunnerSettingsStore((state) => state.directionDisplayMode);
  const setDirectionDisplayMode = useTrialRunnerSettingsStore((state) => state.setDirectionDisplayMode);
  const downDisplayMode = useTrialRunnerSettingsStore((state) => state.downDisplayMode);
  const setDownDisplayMode = useTrialRunnerSettingsStore((state) => state.setDownDisplayMode);
  const buttonBindings = useTrialRunnerSettingsStore((state) => state.buttonBindings);
  const setButtonBinding = useTrialRunnerSettingsStore((state) => state.setButtonBinding);
  const resetTrialBinding = useTrialRunnerSettingsStore((state) => state.resetTrialBinding);
  const setResetTrialBinding = useTrialRunnerSettingsStore((state) => state.setResetTrialBinding);
  const resetBindingsToDefault = useTrialRunnerSettingsStore((state) => state.resetBindingsToDefault);
  const [pendingBindingTarget, setPendingBindingTarget] = useState<BindingTarget | null>(null);
  const [isBindingsOpen, setIsBindingsOpen] = useState(false);
  const selectedTrialMode = useMemo(() => resolveInitialTrialMode(trial, trialModeOverride), [trial, trialModeOverride]);
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
    if (!allowModeOverride) {
      return;
    }
    if (!isTrialMode(value)) {
      return;
    }
    if (!availableTrialModes.includes(value)) {
      return;
    }
    setTrialModeOverride(value);
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
    setButtonBinding(actionId, null);
    setPendingBindingTarget((current) => (current === actionId ? null : current));
  };

  const handleClearResetTrialBinding = () => {
    setResetTrialBinding([]);
    clearPendingResetCapture();
    setPendingBindingTarget((current) => (current === "resetTrial" ? null : current));
  };

  const handleResetBindingsToDefault = () => {
    resetBindingsToDefault();
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
          const capturedButtons = [...pendingResetCaptureRef.current];
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
          setButtonBinding(pendingTarget, physical);
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
    [advanceFrame, clearPendingResetCapture, resetTrialEngine, setButtonBinding, setResetTrialBinding],
  );

  const getCurrentButtonBindings = useCallback(() => buttonBindingsRef.current, []);
  const { providerKind, providerLoading, providerError } = useInputProvider({
    inputMode,
    getButtonBindings: getCurrentButtonBindings,
    onFrame: onInputFrame,
  });

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
    allowModeOverride,
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

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createFrameComboRowIndex } from "../domain/frameData/normalizer";
import {
  ATTACK_ACTIONS,
  PHYSICAL_BUTTON_LABELS,
  createDefaultButtonBindings,
  normalizeButtonBindings,
  setBinding,
} from "../domain/input/buttonMapping";
import { appendInputHistoryEntry, toDisplayHoldFrames, type InputHistoryEntry } from "../domain/input/history";
import { computeResetTrialPressTrigger, normalizeResetTrialBinding, type ResetTrialBinding } from "../domain/input/resetBinding";
import {
  ATTACK_ACTION_IDS,
  type AttackActionId,
  type ButtonBindings,
  type CanonicalButton,
  type InputFrame,
  type InputMode,
  type InputProvider,
  type PhysicalButton,
} from "../domain/input/types";
import { createTrialEngine } from "../domain/trial-engine/createTrialEngine";
import type { TrialEngine, TrialEngineSnapshot } from "../domain/trial-engine/core/types";
import type { ComboTrial, TrialMode, TrialStep } from "../domain/trial/schema";
import type { TrialMoveDataResolver } from "../domain/trial/validate";
import { createInputProvider } from "../platform/createInputProvider";

const INPUT_HISTORY_LIMIT = 24;
const RAW_FRAME_LOG_LIMIT = 24;
const INPUT_MODE_STORAGE_KEY = "sf6_input_mode";
const DIRECTION_DISPLAY_MODE_STORAGE_KEY = "sf6_direction_display_mode";
const DOWN_DISPLAY_MODE_STORAGE_KEY = "sf6_down_display_mode";
const BUTTON_BINDINGS_STORAGE_KEY = "sf6_button_bindings:v2";
const RESET_TRIAL_BINDING_STORAGE_KEY = "sf6_reset_trial_binding:v1";
const TRIAL_MODE_STORAGE_KEY = "sf6_trial_mode_override";
const INPUT_MODES: InputMode[] = ["auto", "xinput", "hid", "web"];
const TRIAL_MODES: TrialMode[] = ["timeline", "stepper"];
const DIRECTION_DISPLAY_MODES = ["number", "arrow"] as const;
const DOWN_DISPLAY_MODES = ["text", "icon"] as const;
const BUTTON_SEPARATOR_ICON_SRC = "/assets/controller/key-plus.png";

const BUTTON_ICON_BY_NAME: Partial<Record<CanonicalButton, string>> = {
  LP: "/assets/controller/icon_punch_l.png",
  MP: "/assets/controller/icon_punch_m.png",
  HP: "/assets/controller/icon_punch_h.png",
  LK: "/assets/controller/icon_kick_l.png",
  MK: "/assets/controller/icon_kick_m.png",
  HK: "/assets/controller/icon_kick_h.png",
};

type DirectionDisplayMode = (typeof DIRECTION_DISPLAY_MODES)[number];
type DownDisplayMode = (typeof DOWN_DISPLAY_MODES)[number];
type BindingTarget = AttackActionId | "resetTrial";

type FrameComboRow = {
  index: number;
  skillName: string;
  startup: string;
  hitAdvantage: string;
};

type DirectionIconSpec = {
  src: string;
  alt: string;
  rotateDeg?: number;
};

type SfxTone = {
  wave: OscillatorType;
  frequency: number;
  endFrequency?: number;
  delaySec: number;
  durationSec: number;
  gain: number;
};

let sfxContext: AudioContext | null = null;

function getSfxContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  const audioContextCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!audioContextCtor) {
    return null;
  }

  if (!sfxContext) {
    sfxContext = new audioContextCtor();
  }

  return sfxContext;
}

function scheduleTone(context: AudioContext, baseTime: number, tone: SfxTone): void {
  const startAt = baseTime + tone.delaySec;
  const endAt = startAt + tone.durationSec;
  const attackAt = startAt + Math.min(0.02, tone.durationSec * 0.5);

  const oscillator = context.createOscillator();
  oscillator.type = tone.wave;
  oscillator.frequency.setValueAtTime(tone.frequency, startAt);
  if (tone.endFrequency !== undefined) {
    oscillator.frequency.linearRampToValueAtTime(tone.endFrequency, endAt);
  }

  const gain = context.createGain();
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(tone.gain, attackAt);
  gain.gain.linearRampToValueAtTime(0, endAt);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(endAt + 0.01);
}

function playToneSequence(tones: SfxTone[]): void {
  const context = getSfxContext();
  if (!context) {
    return;
  }

  const schedule = () => {
    const baseTime = context.currentTime + 0.01;
    for (const tone of tones) {
      scheduleTone(context, baseTime, tone);
    }
  };

  if (context.state === "suspended") {
    void context
      .resume()
      .then(() => {
        schedule();
      })
      .catch(() => undefined);
    return;
  }

  schedule();
}

function playSuccessSfx(): void {
  playToneSequence([
    { wave: "triangle", frequency: 880, delaySec: 0, durationSec: 0.09, gain: 0.08 },
    { wave: "sine", frequency: 1320, delaySec: 0.08, durationSec: 0.15, gain: 0.1 },
  ]);
}

function toDirectionIconSpec(direction: number): DirectionIconSpec | null {
  switch (direction) {
    case 1:
      return { src: "/assets/controller/key-dl.png", alt: "↙" };
    case 2:
      return { src: "/assets/controller/key-d.png", alt: "↓" };
    case 3:
      return { src: "/assets/controller/key-dr.png", alt: "↘" };
    case 4:
      return { src: "/assets/controller/key-l.png", alt: "←" };
    case 5:
      return { src: "/assets/controller/key-nutral.png", alt: "N" };
    case 6:
      return { src: "/assets/controller/key-r.png", alt: "→" };
    case 7:
      return { src: "/assets/controller/key-dr.png", alt: "↖", rotateDeg: 180 };
    case 8:
      return { src: "/assets/controller/key-d.png", alt: "↑", rotateDeg: 180 };
    case 9:
      return { src: "/assets/controller/key-dl.png", alt: "↗", rotateDeg: 180 };
    default:
      return null;
  }
}

function directionLabel(direction: number | undefined, mode: DirectionDisplayMode): ReactNode {
  if (!direction) {
    return "-";
  }

  if (mode === "number") {
    return String(direction);
  }

  switch (direction) {
    case 1:
      return "↙";
    case 2:
      return "↓";
    case 3:
      return "↘";
    case 4:
      return "←";
    case 5:
      return "N";
    case 6:
      return "→";
    case 7:
      return "↖";
    case 8:
      return "↑";
    case 9:
      return "↗";
    default:
      return "-";
  }
}

function renderDirectionValue(direction: number | undefined, mode: DirectionDisplayMode): ReactNode {
  if (!direction) {
    return "-";
  }

  if (mode === "number") {
    return directionLabel(direction, mode);
  }

  const iconSpec = toDirectionIconSpec(direction);
  if (!iconSpec) {
    return directionLabel(direction, mode);
  }

  return (
    <img
      className="dir-icon"
      src={iconSpec.src}
      alt={iconSpec.alt}
      title={iconSpec.alt}
      loading="lazy"
      style={iconSpec.rotateDeg ? { transform: `rotate(${iconSpec.rotateDeg}deg)` } : undefined}
    />
  );
}

function renderSingleButton(button: string): ReactNode {
  const iconSrc = BUTTON_ICON_BY_NAME[button as CanonicalButton];
  if (!iconSrc) {
    return (
      <span className="button-fallback" title={button}>
        {button}
      </span>
    );
  }

  return <img className="button-icon" src={iconSrc} alt={button} title={button} loading="lazy" />;
}

function renderButtonSet(buttons: readonly string[], mode: DownDisplayMode): ReactNode {
  if (buttons.length === 0) {
    return "-";
  }

  if (mode === "text") {
    return buttons.join("+");
  }

  return (
    <span className="input-buttons">
      {buttons.map((button, index) => (
        <Fragment key={`${button}-${index}`}>
          {index > 0 ? <img className="button-separator-icon" src={BUTTON_SEPARATOR_ICON_SRC} alt="+" title="+" loading="lazy" /> : null}
          {renderSingleButton(button)}
        </Fragment>
      ))}
    </span>
  );
}

function parseMotionDirections(motion: string): number[] {
  const directions: number[] = [];
  for (const char of motion) {
    const direction = Number(char);
    if (Number.isInteger(direction) && direction >= 1 && direction <= 9) {
      directions.push(direction);
    }
  }
  return directions;
}

function renderMotionValue(motion: string, directionDisplayMode: DirectionDisplayMode): ReactNode {
  const directions = parseMotionDirections(motion);
  if (directions.length === 0) {
    return motion;
  }

  return (
    <span className="trial-step-motion-seq">
      {directions.map((direction, index) => (
        <span key={`${motion}-${index}-${direction}`} className="trial-step-motion-token">
          {renderDirectionValue(direction, directionDisplayMode)}
        </span>
      ))}
    </span>
  );
}

function renderStepExpectation(step: TrialStep, directionDisplayMode: DirectionDisplayMode, downDisplayMode: DownDisplayMode): ReactNode {
  const parts: ReactNode[] = [];

  if (step.expect.motion) {
    parts.push(
      <span key="motion" className="trial-step-expect-group">
        <span className="trial-step-expect-label">motion</span>
        <span>{renderMotionValue(step.expect.motion, directionDisplayMode)}</span>
      </span>,
    );
  }

  if (step.expect.direction) {
    parts.push(
      <span key="direction" className="trial-step-expect-group">
        <span className="trial-step-expect-label">dir</span>
        <span>{renderDirectionValue(step.expect.direction, directionDisplayMode)}</span>
      </span>,
    );
  }

  if (step.expect.buttons?.length) {
    parts.push(
      <span key="buttons" className="trial-step-expect-group">
        <span>{renderButtonSet(step.expect.buttons, downDisplayMode)}</span>
        {step.expect.simultaneousWithinFrames !== undefined ? (
          <span className="trial-step-expect-frames">({step.expect.simultaneousWithinFrames}F)</span>
        ) : null}
      </span>,
    );
  }

  if (step.expect.anyTwoButtonsFrom?.length) {
    parts.push(
      <span key="any-two-buttons" className="trial-step-expect-group">
        <span className="trial-step-expect-label">Any 2</span>
        <span>{renderButtonSet(step.expect.anyTwoButtonsFrom, downDisplayMode)}</span>
        {step.expect.simultaneousWithinFrames !== undefined ? (
          <span className="trial-step-expect-frames">({step.expect.simultaneousWithinFrames}F)</span>
        ) : null}
      </span>,
    );
  }

  if (parts.length === 0) {
    return "No expectation";
  }

  return (
    <span className="trial-step-expectation-parts">
      {parts.map((part, index) => (
        <Fragment key={`step-part-${index}`}>
          {index > 0 ? <span className="trial-step-expect-join">+</span> : null}
          {part}
        </Fragment>
      ))}
    </span>
  );
}

function statusLabel(snapshot: TrialEngineSnapshot): string {
  if (snapshot.status === "success") {
    return "Success";
  }
  return "Running";
}

function stepStateClass(stepIndex: number, snapshot: TrialEngineSnapshot): string {
  if (stepIndex < snapshot.currentStepIndex) {
    return "is-completed";
  }
  if (stepIndex === snapshot.currentStepIndex && snapshot.status === "running") {
    return "is-active";
  }
  return "is-pending";
}

function isInputMode(value: string): value is InputMode {
  return INPUT_MODES.includes(value as InputMode);
}

function isDirectionDisplayMode(value: string): value is DirectionDisplayMode {
  return DIRECTION_DISPLAY_MODES.includes(value as DirectionDisplayMode);
}

function isDownDisplayMode(value: string): value is DownDisplayMode {
  return DOWN_DISPLAY_MODES.includes(value as DownDisplayMode);
}

function readStoredInputMode(): InputMode {
  if (typeof window === "undefined") {
    return "auto";
  }

  const stored = window.localStorage.getItem(INPUT_MODE_STORAGE_KEY);
  if (stored && isInputMode(stored)) {
    return stored;
  }

  return "auto";
}

function readStoredDirectionDisplayMode(): DirectionDisplayMode {
  if (typeof window === "undefined") {
    return "number";
  }

  const stored = window.localStorage.getItem(DIRECTION_DISPLAY_MODE_STORAGE_KEY);
  if (stored && isDirectionDisplayMode(stored)) {
    return stored;
  }

  return "number";
}

function readStoredDownDisplayMode(): DownDisplayMode {
  if (typeof window === "undefined") {
    return "text";
  }

  const stored = window.localStorage.getItem(DOWN_DISPLAY_MODE_STORAGE_KEY);
  if (stored && isDownDisplayMode(stored)) {
    return stored;
  }

  return "text";
}

function isPhysicalButton(value: unknown): value is PhysicalButton {
  return typeof value === "string" && value in PHYSICAL_BUTTON_LABELS;
}

function readStoredButtonBindings(): ButtonBindings {
  const fallback = createDefaultButtonBindings();

  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const stored = window.localStorage.getItem(BUTTON_BINDINGS_STORAGE_KEY);
    if (!stored) {
      return fallback;
    }

    const parsed = JSON.parse(stored) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return fallback;
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
  } catch {
    return fallback;
  }
}

function readStoredResetTrialBinding(): PhysicalButton[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(RESET_TRIAL_BINDING_STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const collected: PhysicalButton[] = [];
    for (const value of parsed) {
      if (isPhysicalButton(value)) {
        collected.push(value);
      }
    }

    return normalizeResetTrialBinding(collected);
  } catch {
    return [];
  }
}

function physicalButtonLabel(button: PhysicalButton | null): string {
  if (button === null) {
    return "-";
  }
  return PHYSICAL_BUTTON_LABELS[button] ?? button;
}

function physicalButtonSetLabel(buttons: ResetTrialBinding): string {
  if (buttons.length === 0) {
    return "-";
  }

  return buttons.map((button) => PHYSICAL_BUTTON_LABELS[button] ?? button).join("+");
}

function modeLabel(mode: InputMode): string {
  switch (mode) {
    case "auto":
      return "Auto";
    case "xinput":
      return "XInput";
    case "hid":
      return "HID";
    case "web":
      return "Web Gamepad";
    default:
      return mode;
  }
}

function trialModeLabel(mode: TrialMode): string {
  switch (mode) {
    case "timeline":
      return "Timeline";
    case "stepper":
      return "Stepper";
    default:
      return mode;
  }
}

function isTrialMode(value: string): value is TrialMode {
  return TRIAL_MODES.includes(value as TrialMode);
}

function readStoredTrialMode(): TrialMode | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(TRIAL_MODE_STORAGE_KEY);
  if (!stored || !isTrialMode(stored)) {
    return null;
  }

  return stored;
}

function directionDisplayModeLabel(mode: DirectionDisplayMode): string {
  switch (mode) {
    case "arrow":
      return "Icon";
    case "number":
    default:
      return "Number";
  }
}

function downDisplayModeLabel(mode: DownDisplayMode): string {
  switch (mode) {
    case "icon":
      return "Icon";
    case "text":
    default:
      return "Text";
  }
}

function resolveStepWindow(step: TrialStep): { openAfterPrevFrames: number; closeAfterPrevFrames: number } {
  return {
    openAfterPrevFrames: step.timing?.openAfterPrevFrames ?? step.window?.openAfterPrevFrames ?? 0,
    closeAfterPrevFrames: step.timing?.closeAfterPrevFrames ?? step.window?.closeAfterPrevFrames ?? 0,
  };
}

function createMoveDataResolver(frameRows: readonly FrameComboRow[]): TrialMoveDataResolver | undefined {
  if (frameRows.length === 0) {
    return undefined;
  }

  const rowIndex = createFrameComboRowIndex(frameRows);
  return (moveRef) => {
    const row = rowIndex.get(moveRef.rowIndex);
    if (!row) {
      return null;
    }

    return {
      rowIndex: row.index,
      skillName: row.skillName,
      startup: row.startup,
      hitAdvantage: row.hitAdvantage,
    };
  };
}

function resolveDefaultTrialMode(trial: ComboTrial): TrialMode {
  return trial.rules?.defaultMode ?? "timeline";
}

function resolveAvailableTrialModes(): TrialMode[] {
  return ["timeline", "stepper"];
}

function resolveInitialTrialMode(trial: ComboTrial): TrialMode {
  const available = resolveAvailableTrialModes();
  const preferred = resolveDefaultTrialMode(trial);
  const allowOverride = trial.rules?.allowModeOverride ?? true;

  if (!allowOverride) {
    if (available.includes(preferred)) {
      return preferred;
    }
    return available[0] ?? "timeline";
  }

  const stored = readStoredTrialMode();

  if (stored && available.includes(stored)) {
    return stored;
  }

  if (available.includes(preferred)) {
    return preferred;
  }

  return available[0] ?? "timeline";
}

export function TrialRunnerPanel({ trial, frameRows }: { trial: ComboTrial; frameRows: FrameComboRow[] }) {
  const moveDataResolver = useMemo(() => createMoveDataResolver(frameRows), [frameRows]);
  const [selectedTrialMode, setSelectedTrialMode] = useState<TrialMode>(() => resolveInitialTrialMode(trial));
  const availableTrialModes = useMemo(() => resolveAvailableTrialModes(), []);
  const engineRef = useRef<TrialEngine>(
    createTrialEngine(trial, {
      modeOverride: selectedTrialMode,
      resolveMoveData: moveDataResolver,
    }),
  );

  const [inputMode, setInputMode] = useState<InputMode>(() => readStoredInputMode());
  const [directionDisplayMode, setDirectionDisplayMode] = useState<DirectionDisplayMode>(() => readStoredDirectionDisplayMode());
  const [downDisplayMode, setDownDisplayMode] = useState<DownDisplayMode>(() => readStoredDownDisplayMode());
  const [buttonBindings, setButtonBindings] = useState<ButtonBindings>(() => readStoredButtonBindings());
  const [resetTrialBinding, setResetTrialBinding] = useState<PhysicalButton[]>(() => readStoredResetTrialBinding());
  const [pendingBindingTarget, setPendingBindingTarget] = useState<BindingTarget | null>(null);
  const [isBindingsOpen, setIsBindingsOpen] = useState(false);
  const [providerKind, setProviderKind] = useState<InputProvider["kind"]>("web-gamepad");
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [trialSnapshot, setTrialSnapshot] = useState<TrialEngineSnapshot>(() => engineRef.current.getSnapshot());
  const previousStatusRef = useRef<TrialEngineSnapshot["status"]>(trialSnapshot.status);
  const [recentFrames, setRecentFrames] = useState<InputFrame[]>([]);
  const [inputHistory, setInputHistory] = useState<InputHistoryEntry[]>([]);
  const buttonBindingsRef = useRef<ButtonBindings>(buttonBindings);
  const resetTrialBindingRef = useRef<PhysicalButton[]>(resetTrialBinding);
  const pendingBindingTargetRef = useRef<BindingTarget | null>(pendingBindingTarget);
  const resetTrialComboActiveRef = useRef(false);
  const pendingResetCaptureRef = useRef<Set<PhysicalButton>>(new Set());
  const pendingResetCaptureArmedRef = useRef(false);

  const resetSessionState = () => {
    engineRef.current.reset();
    setTrialSnapshot(engineRef.current.getSnapshot());
    setRecentFrames([]);
    setInputHistory([]);
  };

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

  const clearPendingResetCapture = () => {
    pendingResetCaptureRef.current.clear();
    pendingResetCaptureArmedRef.current = false;
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

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(INPUT_MODE_STORAGE_KEY, inputMode);
    }
  }, [inputMode]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DIRECTION_DISPLAY_MODE_STORAGE_KEY, directionDisplayMode);
    }
  }, [directionDisplayMode]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DOWN_DISPLAY_MODE_STORAGE_KEY, downDisplayMode);
    }
  }, [downDisplayMode]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TRIAL_MODE_STORAGE_KEY, selectedTrialMode);
    }
  }, [selectedTrialMode]);

  useEffect(() => {
    if (availableTrialModes.includes(selectedTrialMode)) {
      return;
    }

    const fallback = resolveInitialTrialMode(trial);
    setSelectedTrialMode(fallback);
  }, [availableTrialModes, selectedTrialMode, trial]);

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
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(BUTTON_BINDINGS_STORAGE_KEY, JSON.stringify(buttonBindings));
    } catch {
      // Ignore storage errors such as private mode or quota exceeded.
    }
  }, [buttonBindings]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(RESET_TRIAL_BINDING_STORAGE_KEY, JSON.stringify(resetTrialBinding));
    } catch {
      // Ignore storage errors such as private mode or quota exceeded.
    }
  }, [resetTrialBinding]);

  useEffect(() => {
    resetSessionState();
  }, [buttonBindings]);

  useEffect(() => {
    clearPendingResetCapture();
    resetTrialComboActiveRef.current = false;
    setPendingBindingTarget(null);
  }, [inputMode]);

  useEffect(() => {
    if (!isBindingsOpen || typeof window === "undefined") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleCloseBindings();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isBindingsOpen]);

  useEffect(() => {
    const engine = createTrialEngine(trial, {
      modeOverride: selectedTrialMode,
      resolveMoveData: moveDataResolver,
    });
    engineRef.current = engine;
    const snapshot = engine.getSnapshot();
    setTrialSnapshot(snapshot);
    previousStatusRef.current = snapshot.status;
    setRecentFrames([]);
    setInputHistory([]);
  }, [trial, moveDataResolver, selectedTrialMode]);

  useEffect(() => {
    const provider = createInputProvider(inputMode, () => buttonBindingsRef.current);

    setProviderKind(provider.kind);
    setProviderError(null);
    setProviderLoading(true);
    resetSessionState();
    resetTrialComboActiveRef.current = false;
    clearPendingResetCapture();

    let mounted = true;
    let rafId: number | null = null;
    let startPromise: Promise<void> | null = null;
    const unsubscribe = provider.subscribe((frame) => {
      if (!mounted) {
        return;
      }

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
        resetSessionState();
        return;
      }

      const snapshot = engineRef.current.advance(frame);
      setTrialSnapshot(snapshot);
      setRecentFrames((previous) => {
        const next = [...previous, frame];
        if (next.length > RAW_FRAME_LOG_LIMIT) {
          next.splice(0, next.length - RAW_FRAME_LOG_LIMIT);
        }
        return next;
      });
      setInputHistory((previous) => appendInputHistoryEntry(previous, frame, INPUT_HISTORY_LIMIT));
    });

    const startProvider = async () => {
      try {
        await provider.start();
        if (!mounted) {
          await provider.stop().catch(() => undefined);
          return;
        }

        setProviderKind(provider.kind);
      } catch (error) {
        if (mounted) {
          const message = error instanceof Error ? error.message : String(error);
          setProviderError(message);
        }
      } finally {
        if (mounted) {
          setProviderLoading(false);
        }
      }
    };

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        startPromise = startProvider();
      });
    } else {
      startPromise = startProvider();
    }

    return () => {
      mounted = false;
      if (typeof window !== "undefined" && rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      unsubscribe();
      void (async () => {
        if (startPromise) {
          await startPromise.catch(() => undefined);
        }
        await provider.stop().catch(() => undefined);
      })();
    };
  }, [inputMode]);

  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    const currentStatus = trialSnapshot.status;

    if (previousStatus === currentStatus) {
      return;
    }

    if (previousStatus === "running" && currentStatus === "success") {
      playSuccessSfx();
    }

    previousStatusRef.current = currentStatus;
  }, [trialSnapshot.status]);

  const currentStep = useMemo(() => {
    return trial.steps[trialSnapshot.currentStepIndex] ?? null;
  }, [trialSnapshot.currentStepIndex, trial.steps]);
  const allowModeOverride = trial.rules?.allowModeOverride ?? true;
  const currentAssessment = useMemo(() => {
    return trialSnapshot.assessments[trialSnapshot.currentStepIndex] ?? null;
  }, [trialSnapshot.assessments, trialSnapshot.currentStepIndex]);

  const visibleFrames = useMemo(() => {
    return [...recentFrames].reverse();
  }, [recentFrames]);

  const visibleHistoryEntries = useMemo(() => {
    return [...inputHistory].reverse();
  }, [inputHistory]);

  const handleReset = () => {
    resetSessionState();
  };

  return (
    <section className="trial-panel">
      <div className="trial-head">
        <div>
          <h2>Combo Trial ({trialModeLabel(trialSnapshot.mode)})</h2>
          <p>{trial.name}</p>
        </div>
        <div className="trial-actions">
          <span className={`trial-status is-${trialSnapshot.status}`}>{statusLabel(trialSnapshot)}</span>
          <button type="button" onClick={handleReset}>
            Reset Trial
          </button>
        </div>
      </div>

      <div className="input-mode-row">
        <label className="input-mode-control">
          <span>Trial Mode</span>
          <select value={selectedTrialMode} onChange={(event) => handleTrialModeChange(event.currentTarget.value)} disabled={!allowModeOverride}>
            {availableTrialModes.map((mode) => (
              <option key={mode} value={mode}>
                {trialModeLabel(mode)}
              </option>
            ))}
          </select>
        </label>
        <label className="input-mode-control">
          <span>Input Mode</span>
          <select value={inputMode} onChange={(event) => handleInputModeChange(event.currentTarget.value)}>
            {INPUT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {modeLabel(mode)}
              </option>
            ))}
          </select>
        </label>
        <label className="input-mode-control">
          <span>Dir Display</span>
          <select value={directionDisplayMode} onChange={(event) => handleDirectionDisplayModeChange(event.currentTarget.value)}>
            {DIRECTION_DISPLAY_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {directionDisplayModeLabel(mode)}
              </option>
            ))}
          </select>
        </label>
        <label className="input-mode-control">
          <span>Down Display</span>
          <select value={downDisplayMode} onChange={(event) => handleDownDisplayModeChange(event.currentTarget.value)}>
            {DOWN_DISPLAY_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {downDisplayModeLabel(mode)}
              </option>
            ))}
          </select>
        </label>
        <p className="provider-line">
          Input Provider: <strong>{providerKind}</strong>
        </p>
        <button
          className="open-bindings-button"
          type="button"
          aria-haspopup="dialog"
          aria-expanded={isBindingsOpen}
          onClick={handleOpenBindings}
        >
          Button Bindings
        </button>
      </div>

      {isBindingsOpen ? (
        <div className="bindings-modal-backdrop" role="presentation" onClick={handleCloseBindings}>
          <section className="bindings-panel bindings-modal" role="dialog" aria-label="Button Bindings" onClick={(event) => event.stopPropagation()}>
            <div className="bindings-head">
              <h3>Button Bindings</h3>
              <div className="bindings-head-actions">
                <button type="button" onClick={handleResetBindingsToDefault}>
                  Reset Default
                </button>
                <button type="button" onClick={handleCloseBindings}>
                  Close
                </button>
              </div>
            </div>
            <p className="bindings-help">
              {pendingBindingTarget === "resetTrial"
                ? "Press all buttons for Reset Trial, then release to save."
                : pendingBindingTarget
                  ? `Press any physical button to assign to ${pendingBindingTarget}.`
                  : "Assign each action to the physical button that matches your SF6 settings."}
            </p>
            <div className="bindings-table-wrap">
              <table className="bindings-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Assigned Button</th>
                    <th>Controls</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={pendingBindingTarget === "resetTrial" ? "is-pending-bind" : undefined}>
                    <td>
                      <strong>Reset Trial</strong>
                    </td>
                    <td>{physicalButtonSetLabel(resetTrialBinding)}</td>
                    <td className="bindings-actions">
                      <button type="button" onClick={handleStartResetTrialBinding} disabled={pendingBindingTarget === "resetTrial"}>
                        Assign
                      </button>
                      <button type="button" onClick={handleClearResetTrialBinding} disabled={resetTrialBinding.length === 0}>
                        Clear
                      </button>
                      <button type="button" onClick={handleCancelBinding} disabled={pendingBindingTarget !== "resetTrial"}>
                        Cancel
                      </button>
                    </td>
                  </tr>
                  {ATTACK_ACTIONS.map((action) => {
                    const assigned = buttonBindings[action.id];
                    const pending = pendingBindingTarget === action.id;

                    return (
                      <tr key={action.id} className={pending ? "is-pending-bind" : undefined}>
                        <td>
                          <strong>{action.label}</strong>
                        </td>
                        <td>{physicalButtonLabel(assigned)}</td>
                        <td className="bindings-actions">
                          <button type="button" onClick={() => handleStartBinding(action.id)} disabled={pending}>
                            Assign
                          </button>
                          <button type="button" onClick={() => handleClearBinding(action.id)} disabled={assigned === null}>
                            Clear
                          </button>
                          <button type="button" onClick={handleCancelBinding} disabled={!pending}>
                            Cancel
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {providerError ? (
        <div className="native-error">
          <h3>Input Error</h3>
          <p>{providerError}</p>
          <p>選択中モードで入力を開始できませんでした。コントローラー接続とモード設定を確認してください。</p>
        </div>
      ) : providerLoading ? (
        <div className="provider-loading">
          <h3>Input Provider</h3>
          <p>入力プロバイダーを初期化しています...</p>
        </div>
      ) : (
        <div className="trial-window">
          <p>
            Mode: <strong>{trialModeLabel(trialSnapshot.mode)}</strong>
          </p>
          <p>
            Current Step: <strong>{currentStep ? `${trialSnapshot.currentStepIndex + 1}/${trial.steps.length} ${currentStep.id}` : "Complete"}</strong>
          </p>
          <p>
            Window: <strong>{trialSnapshot.currentWindowOpenFrame ?? "-"}F - {trialSnapshot.currentWindowCloseFrame ?? "-"}F</strong>
          </p>
          <p>
            Last Match: <strong>{trialSnapshot.lastMatchedFrame ?? "-"}</strong>
          </p>
          <p>
            Last Input / Commit:{" "}
            <strong>
              {trialSnapshot.lastMatchedInputFrame ?? "-"}F / {trialSnapshot.lastMatchedCommitFrame ?? "-"}F
            </strong>
          </p>
          {trialSnapshot.mode === "timeline" ? (
            <p>
              Timeline Delta:{" "}
              <strong>
                {currentAssessment?.deltaFrames === null || currentAssessment?.deltaFrames === undefined
                  ? "-"
                  : `${currentAssessment.deltaFrames >= 0 ? "+" : ""}${currentAssessment.deltaFrames}F`}
              </strong>
            </p>
          ) : null}
          {trialSnapshot.mode === "stepper" ? (
            <p>
              Step Attempts: <strong>{currentAssessment?.attempts ?? 0}</strong>
            </p>
          ) : null}
        </div>
      )}

      {trial.notes?.length ? (
        <section className="trial-note-panel">
          <h3>Note</h3>
          <ul>
            {trial.notes.map((note, index) => (
              <li key={`${trial.id}-note-${index}`}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="trial-layout">
        <section className="trial-steps-panel">
          <h3>Steps</h3>
          <ol className="trial-steps">
            {trial.steps.map((step, stepIndex) => {
              const window = resolveStepWindow(step);
              const assessment = trialSnapshot.assessments[stepIndex];
              return (
                <li key={`${step.id}-${stepIndex}`} className={`trial-step ${stepStateClass(stepIndex, trialSnapshot)}`}>
                  <div className="trial-step-head">
                    <strong>{step.id}</strong>
                    <span>
                      +{window.openAfterPrevFrames}F to +{window.closeAfterPrevFrames}F
                    </span>
                  </div>
                  <p className="trial-step-expectation">{renderStepExpectation(step, directionDisplayMode, downDisplayMode)}</p>
                  {assessment ? (
                    <p className="trial-step-assessment">
                      {assessment.result}
                      {assessment.deltaFrames !== null ? ` / delta ${assessment.deltaFrames >= 0 ? "+" : ""}${assessment.deltaFrames}F` : ""}
                      {assessment.attempts > 0 ? ` / attempts ${assessment.attempts}` : ""}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>

        <section className="trial-log-panel">
          <h3>Input History</h3>
          <div className="frame-log-wrap">
            <table className="frame-log-table history-table">
              <thead>
                <tr>
                  <th>Hold</th>
                  <th>Dir</th>
                  <th>Down</th>
                </tr>
              </thead>
              <tbody>
                {visibleHistoryEntries.length > 0 ? (
                  visibleHistoryEntries.map((entry) => (
                    <tr key={`${entry.startFrame}-${entry.endFrame}`}>
                      <td>{toDisplayHoldFrames(entry.holdFrames)}</td>
                      <td>{renderDirectionValue(entry.direction, directionDisplayMode)}</td>
                      <td>{renderButtonSet(entry.down, downDisplayMode)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3}>No input history yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <details className="debug-frame-panel">
            <summary>Debug Raw Frames</summary>
            <div className="frame-log-wrap">
              <table className="frame-log-table">
                <thead>
                  <tr>
                    <th>F</th>
                    <th>Dir</th>
                    <th>Pressed</th>
                    <th>Down</th>
                    <th>Released</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleFrames.length > 0 ? (
                    visibleFrames.map((frame) => (
                      <tr key={frame.frame}>
                        <td>{frame.frame}</td>
                        <td>{renderDirectionValue(frame.direction, directionDisplayMode)}</td>
                        <td>{frame.pressed.join("+") || "-"}</td>
                        <td>{renderButtonSet(frame.down, downDisplayMode)}</td>
                        <td>{frame.released.join("+") || "-"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5}>No input frames yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </details>

          <details className="debug-frame-panel">
            <summary>Mode Events ({trialSnapshot.events.length})</summary>
            <div className="frame-log-wrap">
              <table className="frame-log-table">
                <thead>
                  <tr>
                    <th>F</th>
                    <th>Type</th>
                    <th>Step</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {trialSnapshot.events.length > 0 ? (
                    [...trialSnapshot.events]
                      .reverse()
                      .map((event, index) => (
                        <tr key={`${event.frame}-${event.type}-${index}`}>
                          <td>{event.frame}</td>
                          <td>{event.type}</td>
                          <td>{event.stepId ?? "-"}</td>
                          <td>{event.message}</td>
                        </tr>
                      ))
                  ) : (
                    <tr>
                      <td colSpan={4}>No mode events yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      </div>
    </section>
  );
}

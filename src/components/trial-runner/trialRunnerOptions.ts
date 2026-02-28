import type { InputMode } from "../../domain/input/types";
import { DIRECTION_MODES, directionModeLabel, isDirectionMode, type DirectionMode } from "../../domain/input/direction";
import type { CompiledTrial } from "../../domain/trial/compiled";
import type { TrialMode } from "../../domain/trial/schema";

export const INPUT_MODES: InputMode[] = ["auto", "xinput", "hid", "web"];
export const TRIAL_MODES: TrialMode[] = ["timeline", "stepper"];
export const PLAYER_SIDE_MODES: DirectionMode[] = [...DIRECTION_MODES];

export function isInputMode(value: string): value is InputMode {
  return INPUT_MODES.includes(value as InputMode);
}

export function inputModeLabel(mode: InputMode): string {
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

export function isTrialMode(value: string): value is TrialMode {
  return TRIAL_MODES.includes(value as TrialMode);
}

export function trialModeLabel(mode: TrialMode): string {
  switch (mode) {
    case "timeline":
      return "Timeline";
    case "stepper":
      return "Stepper";
    default:
      return mode;
  }
}

export function isPlayerSideMode(value: string): value is DirectionMode {
  return isDirectionMode(value);
}

export function playerSideModeLabel(mode: DirectionMode): string {
  return directionModeLabel(mode);
}

function resolveDefaultTrialMode(trial: CompiledTrial): TrialMode {
  return trial.rules?.defaultMode ?? "timeline";
}

export function resolveAvailableTrialModes(): TrialMode[] {
  return [...TRIAL_MODES];
}

export function resolveInitialTrialMode(trial: CompiledTrial, trialModeOverride: TrialMode | null): TrialMode {
  const available = resolveAvailableTrialModes();
  const preferred = resolveDefaultTrialMode(trial);
  const allowOverride = trial.rules?.allowModeOverride ?? true;

  if (!allowOverride) {
    if (available.includes(preferred)) {
      return preferred;
    }
    return available[0] ?? "timeline";
  }

  if (trialModeOverride && available.includes(trialModeOverride)) {
    return trialModeOverride;
  }

  if (available.includes(preferred)) {
    return preferred;
  }

  return available[0] ?? "timeline";
}

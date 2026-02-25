import type { ComboTrial, TrialMode } from "../trial/schema";
import { validateTrialConfiguration } from "../trial/validate";
import { defaultMode, type TrialEngine, type TrialEngineOptions } from "./core/types";
import { StepperEngine } from "./modes/stepperEngine";
import { TimelineEngine } from "./modes/timelineEngine";

function resolveRequestedMode(trial: ComboTrial, options: TrialEngineOptions): TrialMode {
  const baseMode = defaultMode(trial);
  if (!options.modeOverride) {
    return baseMode;
  }

  const allowOverride = trial.rules?.allowModeOverride ?? true;
  if (!allowOverride) {
    return baseMode;
  }

  return options.modeOverride;
}

export function createTrialEngine(trial: ComboTrial, options: TrialEngineOptions = {}): TrialEngine {
  validateTrialConfiguration(trial, options.resolveMoveData);

  const requestedMode = resolveRequestedMode(trial, options);

  if (requestedMode === "stepper") {
    return new StepperEngine(trial);
  }

  return new TimelineEngine(trial);
}

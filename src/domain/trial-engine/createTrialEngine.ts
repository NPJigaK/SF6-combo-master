import type { CompiledTrial } from "../trial/compiled";
import type { TrialMode } from "../trial/schema";
import { defaultMode, type TrialEngine, type TrialEngineOptions } from "./core/types";
import { StepperEngine } from "./modes/stepperEngine";
import { TimelineEngine } from "./modes/timelineEngine";

function resolveRequestedMode(trial: CompiledTrial, options: TrialEngineOptions): TrialMode {
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

export function createTrialEngine(trial: CompiledTrial, options: TrialEngineOptions = {}): TrialEngine {
  const requestedMode = resolveRequestedMode(trial, options);
  const directionMode = options.directionMode ?? "normal";

  if (requestedMode === "stepper") {
    return new StepperEngine(trial, directionMode);
  }

  return new TimelineEngine(trial, directionMode);
}

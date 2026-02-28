import type { InputFrame } from "../../input/types";
import type { DirectionMode } from "../../input/direction";
import type { CompiledTrial } from "../../trial/compiled";
import type { TrialMode } from "../../trial/schema";

export type TrialEngineStatus = "running" | "success";

export type TrialAssessmentResult = "pending" | "matched" | "missed" | "retried";

export type StepAssessment = {
  stepIndex: number;
  stepId: string;
  result: TrialAssessmentResult;
  targetFrame: number | null;
  actualFrame: number | null;
  deltaFrames: number | null;
  attempts: number;
  notes: string[];
};

export type ModeEventType = "step_matched" | "step_missed" | "step_retry" | "success";

export type ModeEvent = {
  type: ModeEventType;
  mode: TrialMode;
  frame: number;
  stepIndex: number | null;
  stepId: string | null;
  message: string;
};

export type TrialEngineSnapshot = {
  mode: TrialMode;
  status: TrialEngineStatus;
  currentStepIndex: number;
  currentFrame: number | null;
  currentWindowOpenFrame: number | null;
  currentWindowCloseFrame: number | null;
  lastMatchedFrame: number | null;
  lastMatchedInputFrame: number | null;
  lastMatchedCommitFrame: number | null;
  assessments: StepAssessment[];
  events: ModeEvent[];
};

export interface TrialEngine {
  advance(frame: InputFrame): TrialEngineSnapshot;
  reset(): void;
  getSnapshot(): TrialEngineSnapshot;
}

export type TrialEngineOptions = {
  modeOverride?: TrialMode;
  directionMode?: DirectionMode;
};

export function defaultMode(trial: CompiledTrial): TrialMode {
  return trial.rules?.defaultMode ?? "timeline";
}

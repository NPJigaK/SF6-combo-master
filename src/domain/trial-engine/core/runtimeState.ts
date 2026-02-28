import type { CompiledTrial } from "../../trial/compiled";
import type { TrialMode } from "../../trial/schema";
import type { ModeEvent, StepAssessment, TrialEngineSnapshot, TrialEngineStatus } from "./types";

const EVENT_LIMIT = 80;

export function createInitialAssessments(trial: CompiledTrial): StepAssessment[] {
  return trial.steps.map((step, stepIndex) => ({
    stepIndex,
    stepId: step.id,
    result: "pending",
    targetFrame: null,
    actualFrame: null,
    deltaFrames: null,
    attempts: 0,
    notes: [],
  }));
}

export function cloneAssessments(assessments: StepAssessment[]): StepAssessment[] {
  return assessments.map((assessment) => ({
    ...assessment,
    notes: [...assessment.notes],
  }));
}

export function pushEvent(events: ModeEvent[], event: ModeEvent): void {
  events.push(event);
  if (events.length > EVENT_LIMIT) {
    events.splice(0, events.length - EVENT_LIMIT);
  }
}

export function buildSnapshot(params: {
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
}): TrialEngineSnapshot {
  return {
    mode: params.mode,
    status: params.status,
    currentStepIndex: params.currentStepIndex,
    currentFrame: params.currentFrame,
    currentWindowOpenFrame: params.currentWindowOpenFrame,
    currentWindowCloseFrame: params.currentWindowCloseFrame,
    lastMatchedFrame: params.lastMatchedFrame,
    lastMatchedInputFrame: params.lastMatchedInputFrame,
    lastMatchedCommitFrame: params.lastMatchedCommitFrame,
    assessments: cloneAssessments(params.assessments),
    events: [...params.events],
  };
}

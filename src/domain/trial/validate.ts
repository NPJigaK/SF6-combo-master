import type { ComboTrial, TrialMoveRef, TrialStep } from "./schema";

export type TrialResolvedMoveData = {
  rowIndex: number;
  skillName: string;
  startup: string;
  hitAdvantage: string;
};

export type TrialMoveDataResolver = (moveRef: TrialMoveRef) => TrialResolvedMoveData | null;

function ensureFiniteNumber(value: number, fieldName: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number.`);
  }
}

function ensureNonNegativeFiniteNumber(value: number, fieldName: string): void {
  ensureFiniteNumber(value, fieldName);
  if (value < 0) {
    throw new Error(`${fieldName} must be >= 0.`);
  }
}

function resolveFallbackTargetAfterPrevFrames(step: TrialStep): number | null {
  if (step.timing?.openAfterPrevFrames !== undefined) {
    return step.timing.openAfterPrevFrames;
  }
  if (step.window?.openAfterPrevFrames !== undefined) {
    return step.window.openAfterPrevFrames;
  }
  return null;
}

function resolveFallbackMissAfterFrames(step: TrialStep): number | null {
  if (step.timing?.closeAfterPrevFrames !== undefined) {
    return step.timing.closeAfterPrevFrames;
  }
  if (step.window?.closeAfterPrevFrames !== undefined) {
    return step.window.closeAfterPrevFrames;
  }
  return null;
}

export function validateTrialConfiguration(trial: ComboTrial, resolveMoveData?: TrialMoveDataResolver): void {
  if (trial.steps.length === 0) {
    throw new Error(`Trial ${trial.id}: at least one step is required.`);
  }

  const defaultMode = trial.rules?.defaultMode ?? "timeline";
  if (!["timeline", "stepper"].includes(defaultMode)) {
    throw new Error(`Trial ${trial.id}: unsupported defaultMode ${defaultMode}.`);
  }

  const timelineRules = trial.rules?.timeline;
  if (timelineRules?.defaultToleranceFrames !== undefined) {
    ensureNonNegativeFiniteNumber(timelineRules.defaultToleranceFrames, `rules.timeline.defaultToleranceFrames`);
  }
  if (timelineRules?.defaultMissAfterFrames !== undefined) {
    ensureNonNegativeFiniteNumber(timelineRules.defaultMissAfterFrames, `rules.timeline.defaultMissAfterFrames`);
  }

  const stepperRules = trial.rules?.stepper;
  if (stepperRules?.timeoutFramesDefault !== undefined) {
    ensureNonNegativeFiniteNumber(stepperRules.timeoutFramesDefault, `rules.stepper.timeoutFramesDefault`);
  }

  for (let index = 0; index < trial.steps.length; index += 1) {
    const step = trial.steps[index];
    if (!step.id) {
      throw new Error(`Trial ${trial.id}: step[${index}] requires id.`);
    }

    if (step.moveRef) {
      if (step.moveRef.source !== "frame.combo") {
        throw new Error(`Step ${step.id}: unsupported moveRef source ${step.moveRef.source}.`);
      }
      if (!Number.isInteger(step.moveRef.rowIndex) || step.moveRef.rowIndex < 0) {
        throw new Error(`Step ${step.id}: moveRef.rowIndex must be a non-negative integer.`);
      }
      if (resolveMoveData && !resolveMoveData(step.moveRef)) {
        throw new Error(`Step ${step.id}: frame data not found for rowIndex=${step.moveRef.rowIndex}.`);
      }
    }

    const timeline = step.timeline;
    const hasAbsolute = timeline?.targetAbsoluteFrame !== undefined;
    const hasRelative = timeline?.targetAfterPrevFrames !== undefined;

    if (hasAbsolute && hasRelative) {
      throw new Error(`Step ${step.id}: timeline targetAbsoluteFrame and targetAfterPrevFrames are mutually exclusive.`);
    }

    const fallbackTarget = resolveFallbackTargetAfterPrevFrames(step);
    const fallbackMissAfter = resolveFallbackMissAfterFrames(step);

    if (!hasAbsolute && !hasRelative && fallbackTarget === null) {
      throw new Error(`Step ${step.id}: timeline target is required (targetAbsoluteFrame or targetAfterPrevFrames).`);
    }

    if (timeline?.targetAbsoluteFrame !== undefined) {
      ensureNonNegativeFiniteNumber(timeline.targetAbsoluteFrame, `Step ${step.id} timeline.targetAbsoluteFrame`);
    }

    if (timeline?.targetAfterPrevFrames !== undefined) {
      ensureNonNegativeFiniteNumber(timeline.targetAfterPrevFrames, `Step ${step.id} timeline.targetAfterPrevFrames`);
    }

    if (timeline?.toleranceFrames !== undefined) {
      ensureNonNegativeFiniteNumber(timeline.toleranceFrames, `Step ${step.id} timeline.toleranceFrames`);
    }

    const missAfterCandidate = timeline?.missAfterFrames ?? fallbackMissAfter;
    if (missAfterCandidate !== null && missAfterCandidate !== undefined) {
      ensureNonNegativeFiniteNumber(missAfterCandidate, `Step ${step.id} timeline.missAfterFrames`);
    }

    if (stepperRules || step.stepper) {
      if (step.stepper?.timeoutFrames !== undefined) {
        ensureNonNegativeFiniteNumber(step.stepper.timeoutFrames, `Step ${step.id} stepper.timeoutFrames`);
      }
    }

    const open = step.timing?.openAfterPrevFrames ?? step.window?.openAfterPrevFrames;
    const close = step.timing?.closeAfterPrevFrames ?? step.window?.closeAfterPrevFrames;
    if (open !== undefined) {
      ensureFiniteNumber(open, `Step ${step.id} openAfterPrevFrames`);
    }
    if (close !== undefined) {
      ensureFiniteNumber(close, `Step ${step.id} closeAfterPrevFrames`);
    }
    if (open !== undefined && close !== undefined && close < open) {
      throw new Error(`Step ${step.id}: closeAfterPrevFrames must be >= openAfterPrevFrames.`);
    }

    if (step.timing?.bufferFrames !== undefined) {
      ensureNonNegativeFiniteNumber(step.timing.bufferFrames, `Step ${step.id} timing.bufferFrames`);
    }
  }
}

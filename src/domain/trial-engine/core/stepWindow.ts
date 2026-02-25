import type { TrialStep } from "../../trial/schema";

export function resolveTimelineTargetFrame(
  step: TrialStep,
  stepIndex: number,
  startFrame: number,
  previousResolvedFrame: number | null,
): number {
  if (step.timeline?.targetAbsoluteFrame !== undefined) {
    return startFrame + step.timeline.targetAbsoluteFrame;
  }

  const relative =
    step.timeline?.targetAfterPrevFrames ?? step.timing?.openAfterPrevFrames ?? step.window?.openAfterPrevFrames ?? 0;

  if (stepIndex === 0) {
    return startFrame + relative;
  }

  const base = previousResolvedFrame ?? startFrame;
  return base + relative;
}

export function resolveTimelineMissFrame(step: TrialStep, targetFrame: number, defaultMissAfterFrames: number): number {
  const missAfter =
    step.timeline?.missAfterFrames ?? step.timing?.closeAfterPrevFrames ?? step.window?.closeAfterPrevFrames ?? defaultMissAfterFrames;
  return targetFrame + missAfter;
}

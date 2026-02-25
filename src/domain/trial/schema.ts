import type { CanonicalButton, Direction } from "../input/types";
import type { MotionCode } from "../input/motion";

export type TrialMoveRef = {
  source: "frame.combo";
  rowIndex: number;
};

export type TrialTimingKind = "manual" | "link" | "cancel" | "chain" | "target";

export type TrialStepTiming = {
  kind: TrialTimingKind;
  openAfterPrevFrames: number;
  closeAfterPrevFrames: number;
  bufferFrames?: number;
};

export type TrialMode = "timeline" | "stepper";

export type TrialStepTimeline = {
  targetAfterPrevFrames?: number;
  targetAbsoluteFrame?: number;
  toleranceFrames?: number;
  missAfterFrames?: number;
};

export type TrialStepStepper = {
  timeoutFrames?: number;
  requirePressed?: boolean;
  requireReleaseBeforeReuse?: boolean;
  requireNeutralBeforeStep?: boolean;
};

export type TrialStep = {
  id: string;
  moveRef?: TrialMoveRef;
  expect: {
    direction?: Direction;
    buttons?: CanonicalButton[];
    anyTwoButtonsFrom?: CanonicalButton[];
    motion?: MotionCode;
    simultaneousWithinFrames?: number;
  };
  timeline?: TrialStepTimeline;
  stepper?: TrialStepStepper;
  timing?: TrialStepTiming;
  window?: {
    openAfterPrevFrames: number;
    closeAfterPrevFrames: number;
  };
};

export type TrialTimelineRules = {
  defaultToleranceFrames?: number;
  defaultMissAfterFrames?: number;
};

export type TrialStepperRules = {
  timeoutFramesDefault?: number;
  requirePressedDefault?: boolean;
  requireReleaseBeforeReuseDefault?: boolean;
  requireNeutralBeforeStepDefault?: boolean;
};

export type TrialRules = {
  defaultMode?: TrialMode;
  allowModeOverride?: boolean;
  timeline?: TrialTimelineRules;
  stepper?: TrialStepperRules;
};

export type ComboTrial = {
  id: string;
  name: string;
  fps: 60;
  notes?: string[];
  steps: TrialStep[];
  rules?: TrialRules;
};

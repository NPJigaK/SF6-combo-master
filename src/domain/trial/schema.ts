import type { CanonicalButton, Direction } from "../input/types";
import type { MotionCode } from "../input/motion";

export type TrialMode = "timeline" | "stepper";

export type TrialConnectType = "link" | "cancel" | "chain" | "target";

export type TrialCancelKind = "special" | "super" | "dr";

// Used by compiled.ts for the compiled step expectation
export type TrialStepExpectation = {
  direction?: Direction;
  buttons?: CanonicalButton[];
  anyTwoButtonsFrom?: CanonicalButton[];
  motion?: MotionCode;
  simultaneousWithinFrames?: number;
};

export type TrialStepMove = {
  move: string;              // moveId
  connect?: TrialConnectType; // How this step connects FROM the previous (required for 2nd+ steps)
  cancelKind?: TrialCancelKind; // Required when connect="cancel"
  label?: string;            // Display name override (falls back to move's official name)
  window?: {                 // Optional timing override (defaults applied by compiler)
    min?: number;            // minAfterPrevFrames (default: 0)
    max?: number;            // maxAfterPrevFrames (default: by connect type)
  };
};

export type TrialStepWait = {
  wait: number;              // Frames to wait
  reason?: string;
};

export type TrialStep = TrialStepMove | TrialStepWait;

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
  notes?: string[];
  steps: TrialStep[];
  rules?: TrialRules;
};

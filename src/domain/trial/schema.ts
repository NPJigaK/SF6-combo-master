import type { CanonicalButton, Direction } from "../input/types";
import type { MotionCode } from "../input/motion";

export type TrialStep = {
  id: string;
  expect: {
    direction?: Direction;
    buttons?: CanonicalButton[];
    motion?: MotionCode;
    simultaneousWithinFrames?: number;
  };
  window: {
    openAfterPrevFrames: number;
    closeAfterPrevFrames: number;
  };
};

export type ComboTrial = {
  id: string;
  name: string;
  fps: 60;
  steps: TrialStep[];
};


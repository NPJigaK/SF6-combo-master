import { detectMotion } from "../input/motion";
import type { CanonicalButton, InputFrame } from "../input/types";
import type { ComboTrial, TrialStep } from "./schema";

const HISTORY_LIMIT_FRAMES = 240;
const MOTION_TO_BUTTON_MAX_GAP_FRAMES = 12;

export type TrialJudgeStatus = "running" | "success" | "failed";

export type TrialJudgeSnapshot = {
  status: TrialJudgeStatus;
  currentStepIndex: number;
  currentFrame: number | null;
  currentWindowOpenFrame: number | null;
  currentWindowCloseFrame: number | null;
  lastMatchedFrame: number | null;
  failedStepIndex: number | null;
  failReason: string | null;
};

function getStepWindowBounds(
  trial: ComboTrial,
  currentStepIndex: number,
  startFrame: number | null,
  lastMatchedFrame: number | null,
): { openFrame: number | null; closeFrame: number | null } {
  if (startFrame === null) {
    return {
      openFrame: null,
      closeFrame: null,
    };
  }

  const step = trial.steps[currentStepIndex];
  if (!step) {
    return {
      openFrame: null,
      closeFrame: null,
    };
  }

  const baseFrame = lastMatchedFrame ?? startFrame;
  return {
    openFrame: baseFrame + step.window.openAfterPrevFrames,
    closeFrame: baseFrame + step.window.closeAfterPrevFrames,
  };
}

function findLatestPressedFrame(history: InputFrame[], button: CanonicalButton, minFrame: number, maxFrame: number): number | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const frame = history[index];
    if (frame.frame > maxFrame) {
      continue;
    }
    if (frame.frame < minFrame) {
      break;
    }
    if (frame.pressed.includes(button)) {
      return frame.frame;
    }
  }
  return null;
}

function matchesButtons(step: TrialStep, history: InputFrame[], currentFrame: InputFrame): boolean {
  const expectedButtons = step.expect.buttons ?? [];
  if (expectedButtons.length === 0) {
    return true;
  }

  const withinFrames = Math.max(0, step.expect.simultaneousWithinFrames ?? 0);
  const minFrame = currentFrame.frame - withinFrames;
  const pressedFrames = expectedButtons.map((button) => findLatestPressedFrame(history, button, minFrame, currentFrame.frame));

  if (pressedFrames.some((value) => value === null)) {
    return false;
  }

  const exactPressedFrames = pressedFrames as number[];
  const earliest = Math.min(...exactPressedFrames);
  const latest = Math.max(...exactPressedFrames);
  return latest - earliest <= withinFrames;
}

function matchesStep(step: TrialStep, history: InputFrame[], currentFrame: InputFrame): boolean {
  const { direction, motion } = step.expect;

  if (direction !== undefined && currentFrame.direction !== direction) {
    return false;
  }

  if (motion) {
    const match = detectMotion(history, motion, currentFrame.frame);
    if (!match) {
      return false;
    }

    if (step.expect.buttons?.length && currentFrame.frame - match.endFrame > MOTION_TO_BUTTON_MAX_GAP_FRAMES) {
      return false;
    }
  }

  return matchesButtons(step, history, currentFrame);
}

function hasInputActivity(frame: InputFrame): boolean {
  if (frame.direction !== 5) {
    return true;
  }
  if (frame.pressed.length > 0) {
    return true;
  }
  return frame.down.length > 0;
}

export class TrialJudge {
  private readonly trial: ComboTrial;
  private history: InputFrame[] = [];
  private startFrame: number | null = null;
  private currentStepIndex = 0;
  private currentFrame: number | null = null;
  private lastMatchedFrame: number | null = null;
  private failedStepIndex: number | null = null;
  private failReason: string | null = null;
  private status: TrialJudgeStatus = "running";

  public constructor(trial: ComboTrial) {
    this.trial = trial;
  }

  public reset(): void {
    this.history = [];
    this.startFrame = null;
    this.currentStepIndex = 0;
    this.currentFrame = null;
    this.lastMatchedFrame = null;
    this.failedStepIndex = null;
    this.failReason = null;
    this.status = "running";
  }

  public getSnapshot(): TrialJudgeSnapshot {
    const bounds = getStepWindowBounds(this.trial, this.currentStepIndex, this.startFrame, this.lastMatchedFrame);

    return {
      status: this.status,
      currentStepIndex: this.currentStepIndex,
      currentFrame: this.currentFrame,
      currentWindowOpenFrame: bounds.openFrame,
      currentWindowCloseFrame: bounds.closeFrame,
      lastMatchedFrame: this.lastMatchedFrame,
      failedStepIndex: this.failedStepIndex,
      failReason: this.failReason,
    };
  }

  public advance(frame: InputFrame): TrialJudgeSnapshot {
    this.currentFrame = frame.frame;

    this.history.push(frame);
    if (this.history.length > HISTORY_LIMIT_FRAMES) {
      this.history.splice(0, this.history.length - HISTORY_LIMIT_FRAMES);
    }

    if (this.startFrame === null) {
      if (!hasInputActivity(frame)) {
        return this.getSnapshot();
      }
      this.startFrame = frame.frame;
    }

    if (this.status !== "running") {
      return this.getSnapshot();
    }

    const step = this.trial.steps[this.currentStepIndex];
    if (!step) {
      this.status = "success";
      return this.getSnapshot();
    }

    const bounds = getStepWindowBounds(this.trial, this.currentStepIndex, this.startFrame, this.lastMatchedFrame);
    const openFrame = bounds.openFrame;
    const closeFrame = bounds.closeFrame;

    if (openFrame === null || closeFrame === null) {
      return this.getSnapshot();
    }

    if (frame.frame > closeFrame) {
      this.status = "failed";
      this.failedStepIndex = this.currentStepIndex;
      this.failReason = `Step ${step.id} was not completed within the window.`;
      return this.getSnapshot();
    }

    if (frame.frame < openFrame) {
      return this.getSnapshot();
    }

    if (!matchesStep(step, this.history, frame)) {
      return this.getSnapshot();
    }

    this.lastMatchedFrame = frame.frame;
    this.currentStepIndex += 1;

    if (this.currentStepIndex >= this.trial.steps.length) {
      this.status = "success";
    }

    return this.getSnapshot();
  }
}

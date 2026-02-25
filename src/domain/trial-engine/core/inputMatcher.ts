import { detectMotion } from "../../input/motion";
import type { CanonicalButton, InputFrame } from "../../input/types";
import type { TrialStep } from "../../trial/schema";

const MOTION_TO_BUTTON_MAX_GAP_FRAMES = 12;
const PREHOLD_DIRECTIONS = new Set([1, 2, 3]);

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

type AnyTwoButtonsMatch = {
  latestFrame: number;
};

function findAnyTwoButtonsMatch(
  history: InputFrame[],
  allowedButtons: readonly CanonicalButton[],
  minFrame: number,
  maxFrame: number,
  withinFrames: number,
): AnyTwoButtonsMatch | null {
  const allowedSet = new Set(allowedButtons);
  if (allowedSet.size < 2) {
    return null;
  }

  const pressedEvents: Array<{ button: CanonicalButton; frame: number }> = [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const frame = history[index];
    if (frame.frame > maxFrame) {
      continue;
    }
    if (frame.frame < minFrame) {
      break;
    }

    for (const button of frame.pressed) {
      if (!allowedSet.has(button)) {
        continue;
      }
      pressedEvents.push({
        button,
        frame: frame.frame,
      });
    }
  }

  let latestMatchFrame: number | null = null;
  for (let leftIndex = 0; leftIndex < pressedEvents.length; leftIndex += 1) {
    const leftEvent = pressedEvents[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < pressedEvents.length; rightIndex += 1) {
      const rightEvent = pressedEvents[rightIndex];
      if (leftEvent.button === rightEvent.button) {
        continue;
      }

      if (Math.abs(leftEvent.frame - rightEvent.frame) > withinFrames) {
        continue;
      }

      const latest = Math.max(leftEvent.frame, rightEvent.frame);
      if (latestMatchFrame === null || latest > latestMatchFrame) {
        latestMatchFrame = latest;
      }
    }
  }

  if (latestMatchFrame === null) {
    return null;
  }

  return {
    latestFrame: latestMatchFrame,
  };
}

function resolveButtonInputFrame(step: TrialStep, history: InputFrame[], currentFrame: InputFrame): number | null {
  const expectedButtons = step.expect.buttons ?? [];
  const anyTwoButtons = Array.from(new Set(step.expect.anyTwoButtonsFrom ?? []));

  const withinFrames = Math.max(0, step.expect.simultaneousWithinFrames ?? 0);
  const minFrame = currentFrame.frame - withinFrames;
  const candidateFrames: number[] = [];

  if (expectedButtons.length > 0) {
    const pressedFrames = expectedButtons.map((button) => findLatestPressedFrame(history, button, minFrame, currentFrame.frame));
    if (pressedFrames.some((value) => value === null)) {
      return null;
    }

    const exactPressedFrames = pressedFrames as number[];
    const earliest = Math.min(...exactPressedFrames);
    const latest = Math.max(...exactPressedFrames);
    if (latest - earliest > withinFrames) {
      return null;
    }

    candidateFrames.push(latest);
  }

  if (anyTwoButtons.length > 0) {
    const anyTwoMatch = findAnyTwoButtonsMatch(history, anyTwoButtons, minFrame, currentFrame.frame, withinFrames);
    if (!anyTwoMatch) {
      return null;
    }
    candidateFrames.push(anyTwoMatch.latestFrame);
  }

  if (candidateFrames.length === 0) {
    return null;
  }

  return Math.max(...candidateFrames);
}

export type StepInputMatch = {
  inputFrame: number;
  motionCompletionFrame: number | null;
};

export function resolveStepInputEvent(step: TrialStep, history: InputFrame[], currentFrame: InputFrame): StepInputMatch | null {
  const { direction, motion } = step.expect;

  if (direction !== undefined && currentFrame.direction !== direction) {
    return null;
  }

  const buttonInputFrame = resolveButtonInputFrame(step, history, currentFrame);
  const expectsButtonInput = (step.expect.buttons?.length ?? 0) > 0 || (step.expect.anyTwoButtonsFrom?.length ?? 0) > 0;

  if (expectsButtonInput && buttonInputFrame === null) {
    return null;
  }

  if (motion) {
    const motionMatch = detectMotion(history, motion, currentFrame.frame);
    if (!motionMatch) {
      return null;
    }

    if (buttonInputFrame !== null) {
      if (motionMatch.endFrame > buttonInputFrame) {
        return null;
      }

      if (buttonInputFrame - motionMatch.endFrame > MOTION_TO_BUTTON_MAX_GAP_FRAMES) {
        return null;
      }

      return {
        inputFrame: buttonInputFrame,
        motionCompletionFrame: motionMatch.endFrame,
      };
    }

    return {
      inputFrame: motionMatch.endFrame,
      motionCompletionFrame: motionMatch.endFrame,
    };
  }

  if (buttonInputFrame !== null) {
    return {
      inputFrame: buttonInputFrame,
      motionCompletionFrame: null,
    };
  }

  return {
    inputFrame: currentFrame.frame,
    motionCompletionFrame: null,
  };
}

export function hasInputActivity(frame: InputFrame): boolean {
  if (frame.direction !== 5) {
    return true;
  }
  if (frame.pressed.length > 0) {
    return true;
  }
  return frame.down.length > 0;
}

export function isNeutralInput(frame: InputFrame): boolean {
  return frame.direction === 5 && frame.down.length === 0;
}

export function shouldStartTrial(firstStep: TrialStep | undefined, frame: InputFrame): boolean {
  if (!firstStep) {
    return hasInputActivity(frame);
  }

  const requiredAttackButtons = new Set([...(firstStep.expect.buttons ?? []), ...(firstStep.expect.anyTwoButtonsFrom ?? [])]);
  if (requiredAttackButtons.size > 0 && frame.pressed.length === 0) {
    const expectedDirection = firstStep.expect.direction;
    if (expectedDirection !== undefined && PREHOLD_DIRECTIONS.has(expectedDirection)) {
      return false;
    }
  }

  return hasInputActivity(frame);
}

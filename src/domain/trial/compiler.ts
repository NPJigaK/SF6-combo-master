import type { CompiledStepWindow, CompiledTrial, CompiledTrialDelayStep, CompiledTrialMoveStep } from "./compiled";
import type {
  ComboTrial,
  TrialCancelKind,
  TrialConnectType,
  TrialStep,
  TrialStepExpectation,
  TrialStepMove,
  TrialStepWait,
} from "./schema";
import { validateTrialConfiguration } from "./validate";
import type { Direction } from "../input/types";
import type { MotionCode } from "../input/motion";

type CommandToken =
  | { type: "text"; value?: string }
  | { type: "icon"; file?: string };

export type MasterMoveData = {
  moveId: string;
  official?: {
    moveName?: string;
    command?: {
      tokens?: CommandToken[];
    };
  };
};

export type CompileTrialOptions = {
  masterMoves: readonly MasterMoveData[];
};

// Default timing windows (max frames) per connect type
const DEFAULT_WINDOW_MAX: Record<TrialConnectType, number> = {
  link: 24,
  cancel: 40,
  chain: 20,
  target: 20,
};

// DR cancel has a tighter default window
const DEFAULT_DR_CANCEL_MAX = 12;

const DIRECTION_ICON_TO_NUM: Record<string, number> = {
  "key-d.png": 2,
  "key-dr.png": 3,
  "key-r.png": 6,
  "key-dl.png": 1,
  "key-l.png": 4,
  "key-nutral.png": 5,
};

const SPECIFIC_BUTTON_ICON_TO_NAME: Record<string, string> = {
  "icon_punch_l.png": "LP",
  "icon_punch_m.png": "MP",
  "icon_punch_h.png": "HP",
  "icon_kick_l.png": "LK",
  "icon_kick_m.png": "MK",
  "icon_kick_h.png": "HK",
};

function motionFromDirections(directions: number[]): MotionCode | null {
  if (directions.length === 3 && directions[0] === 2 && directions[1] === 3 && directions[2] === 6) return "236";
  if (directions.length === 3 && directions[0] === 2 && directions[1] === 1 && directions[2] === 4) return "214";
  if (directions.length === 3 && directions[0] === 6 && directions[1] === 2 && directions[2] === 3) return "623";
  if (directions.length === 2 && directions[0] === 2 && directions[1] === 2) return "22";
  return null;
}

function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

function parseExpectation(moveId: string, tokens: CommandToken[]): TrialStepExpectation {
  if (tokens.length === 0) {
    throw new Error(`Compile failed: cannot derive expect for ${moveId}: command tokens are empty.`);
  }

  // Find the last "arrow_3.png" (continuation separator) and start from after it
  let startIndex = 0;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (token.type === "icon" && token.file === "arrow_3.png") {
      startIndex = index + 1;
      break;
    }
  }

  const sequence = tokens.slice(startIndex);
  const icons = sequence.flatMap((token) => (token.type === "icon" && token.file ? [token.file] : []));
  const hasOr = icons.includes("key-or.png");

  const specificButtons = unique(
    icons.flatMap((icon) => (SPECIFIC_BUTTON_ICON_TO_NAME[icon] ? [SPECIFIC_BUTTON_ICON_TO_NAME[icon]] : [])),
  );
  const genericPunchCount = icons.filter((icon) => icon === "icon_punch.png").length;
  const genericKickCount = icons.filter((icon) => icon === "icon_kick.png").length;

  if (specificButtons.length > 0 && (genericPunchCount > 0 || genericKickCount > 0)) {
    throw new Error(`Compile failed: cannot derive expect for ${moveId}: mixed specific and generic button icons.`);
  }

  if (genericPunchCount > 0 && genericKickCount > 0) {
    throw new Error(`Compile failed: cannot derive expect for ${moveId}: mixed generic punch and kick icons.`);
  }

  const directionSequence = hasOr
    ? []
    : icons.flatMap((icon) => (DIRECTION_ICON_TO_NUM[icon] !== undefined ? [DIRECTION_ICON_TO_NUM[icon]] : []));

  const expectation: TrialStepExpectation = {};

  if (!hasOr) {
    const motion = motionFromDirections(directionSequence);
    if (motion) {
      expectation.motion = motion;
    } else if (directionSequence.length === 1) {
      expectation.direction = directionSequence[0] as Direction;
    } else if (directionSequence.length > 1) {
      throw new Error(
        `Compile failed: cannot derive expect for ${moveId}: unsupported direction sequence ${directionSequence.join(",")}.`,
      );
    }
  }

  if (specificButtons.length > 0) {
    expectation.buttons = specificButtons as TrialStepExpectation["buttons"];
  } else if (genericPunchCount >= 2) {
    expectation.anyTwoButtonsFrom = ["LP", "MP", "HP"];
  } else if (genericKickCount >= 2) {
    expectation.anyTwoButtonsFrom = ["LK", "MK", "HK"];
  } else {
    throw new Error(`Compile failed: cannot derive expect for ${moveId}: no button input could be resolved.`);
  }

  const hasMultiButton = (expectation.buttons?.length ?? 0) > 1 || (expectation.anyTwoButtonsFrom?.length ?? 0) > 0;
  const hasButtonInput = (expectation.buttons?.length ?? 0) > 0 || (expectation.anyTwoButtonsFrom?.length ?? 0) > 0;
  if ((expectation.motion && hasButtonInput) || hasMultiButton) {
    expectation.simultaneousWithinFrames = 2;
  }

  return expectation;
}

function resolveWindowMax(connect: TrialConnectType, cancelKind: TrialCancelKind | undefined): number {
  if (connect === "cancel" && cancelKind === "dr") {
    return DEFAULT_DR_CANCEL_MAX;
  }
  return DEFAULT_WINDOW_MAX[connect];
}

function isMoveStep(step: TrialStep): step is TrialStepMove {
  return "move" in step;
}

function isWaitStep(step: TrialStep): step is TrialStepWait {
  return "wait" in step;
}

function buildWindowFromPrev(
  step: TrialStepMove,
  prevStepIndex: number,
  connect: TrialConnectType,
  cancelKind: TrialCancelKind | undefined,
): CompiledStepWindow {
  const windowMin = step.window?.min ?? 0;
  const windowMaxOverride = step.window?.max;
  const windowMax = windowMaxOverride !== undefined ? windowMaxOverride : resolveWindowMax(connect, cancelKind);

  return {
    edgeId: `e${prevStepIndex}`,
    fromStepId: `s${prevStepIndex}`,
    connect,
    cancelKind,
    minAfterPrevFrames: windowMin,
    maxAfterPrevFrames: windowMax,
    source: step.window !== undefined ? "inline_override" : "default",
  };
}

export function compileTrial(trial: ComboTrial, options: CompileTrialOptions): CompiledTrial {
  validateTrialConfiguration(trial);

  const masterMoveMap = new Map(options.masterMoves.map((m) => [m.moveId, m]));
  const compiledSteps: CompiledTrial["steps"] = [];

  for (const [index, step] of trial.steps.entries()) {
    if (isMoveStep(step)) {
      const move = masterMoveMap.get(step.move);
      if (!move) {
        throw new Error(`Compile failed: unknown moveId "${step.move}" (steps[${index}]).`);
      }

      const tokens = (move.official?.command?.tokens ?? []) as CommandToken[];
      const expect = parseExpectation(step.move, tokens);
      const label = step.label ?? move.official?.moveName;

      const compiledStep: CompiledTrialMoveStep = {
        id: `s${index}`,
        label,
        kind: "move",
        moveId: step.move,
        expect,
      };

      if (index > 0) {
        // connect is guaranteed by validation for non-first steps
        const connect = step.connect as TrialConnectType;
        compiledStep.windowFromPrev = buildWindowFromPrev(step, index - 1, connect, step.cancelKind);
      }

      compiledSteps.push(compiledStep);
    } else if (isWaitStep(step)) {
      if (index === 0) {
        const compiledStep: CompiledTrialDelayStep = {
          id: `s${index}`,
          kind: "delay",
          frames: step.wait,
          reason: step.reason,
        };
        compiledSteps.push(compiledStep);
      } else {
        // Wait steps in non-first position are not yet supported.
        // Implement when a combo requires explicit frame delays.
        throw new Error(
          `Compile failed: wait step at steps[${index}] is not yet supported after the first step (trial "${trial.id}").`,
        );
      }
    }
  }

  return {
    id: trial.id,
    name: trial.name,
    notes: trial.notes ? [...trial.notes] : undefined,
    rules: trial.rules,
    startPolicy: "immediate",
    steps: compiledSteps,
  };
}

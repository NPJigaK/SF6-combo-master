import type {
  ComboTrial,
  TrialCancelKind,
  TrialConnectType,
  TrialRules,
  TrialStepMove,
} from "./schema";
import { validateTrialConfiguration } from "./validate";

const DEFAULT_TRIAL_ID = "custom_trial";
export const DEFAULT_FOLLOWUP_CONNECT: TrialConnectType = "link";

export type TrialBuilderMoveStepInput = {
  move: string;
  connect?: TrialConnectType;
  cancelKind?: TrialCancelKind;
  label?: string;
  windowMin?: number;
  windowMax?: number;
};

export type BuildComboTrialInput = {
  id?: string;
  name: string;
  notesText?: string;
  steps: readonly TrialBuilderMoveStepInput[];
  rules?: TrialRules;
};

function trimOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function parseNotes(notesText: string | undefined): string[] | undefined {
  if (!notesText) {
    return undefined;
  }

  const parsed = notesText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return parsed.length > 0 ? parsed : undefined;
}

function buildMoveStep(step: TrialBuilderMoveStepInput, index: number): TrialStepMove {
  const moveStep: TrialStepMove = {
    move: step.move.trim(),
  };

  if (index > 0) {
    const connect = step.connect ?? DEFAULT_FOLLOWUP_CONNECT;
    moveStep.connect = connect;
    if (connect === "cancel" && step.cancelKind) {
      moveStep.cancelKind = step.cancelKind;
    }
  }

  const label = trimOptionalText(step.label);
  if (label) {
    moveStep.label = label;
  }

  if (step.windowMin !== undefined || step.windowMax !== undefined) {
    moveStep.window = {};
    if (step.windowMin !== undefined) {
      moveStep.window.min = step.windowMin;
    }
    if (step.windowMax !== undefined) {
      moveStep.window.max = step.windowMax;
    }
  }

  return moveStep;
}

export function createTrialIdFromName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");

  return normalized.length > 0 ? normalized : DEFAULT_TRIAL_ID;
}

export function buildComboTrial(input: BuildComboTrialInput): ComboTrial {
  const name = input.name.trim();
  const id = trimOptionalText(input.id) ?? createTrialIdFromName(name);

  const trial: ComboTrial = {
    id,
    name,
    steps: input.steps.map((step, index) => buildMoveStep(step, index)),
  };

  const notes = parseNotes(input.notesText);
  if (notes) {
    trial.notes = notes;
  }

  if (input.rules) {
    trial.rules = input.rules;
  }

  validateTrialConfiguration(trial);
  return trial;
}

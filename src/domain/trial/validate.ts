import type { ComboTrial } from "./schema";

const TRIAL_FIELDS = new Set(["id", "name", "notes", "steps", "rules"]);
const TRIAL_RULE_FIELDS = new Set(["defaultMode", "allowModeOverride", "timeline", "stepper"]);
const TRIAL_RULE_TIMELINE_FIELDS = new Set(["defaultToleranceFrames", "defaultMissAfterFrames"]);
const TRIAL_RULE_STEPPER_FIELDS = new Set([
  "timeoutFramesDefault",
  "requirePressedDefault",
  "requireReleaseBeforeReuseDefault",
  "requireNeutralBeforeStepDefault",
]);
const STEP_MOVE_FIELDS = new Set(["move", "connect", "cancelKind", "label", "window"]);
const STEP_MOVE_WINDOW_FIELDS = new Set(["min", "max"]);
const STEP_WAIT_FIELDS = new Set(["wait", "reason"]);
const CONNECT_TYPES = new Set(["link", "cancel", "chain", "target"]);
const CANCEL_KINDS = new Set(["special", "super", "dr"]);

function ensureRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function ensureAllowedKeys(record: Record<string, unknown>, allowedKeys: ReadonlySet<string>, field: string): void {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${field} has unknown field "${key}".`);
    }
  }
}

function ensureNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }
  if (value < 0) {
    throw new Error(`${field} must be >= 0.`);
  }
}

function validateNotes(trial: ComboTrial): void {
  if (trial.notes === undefined) {
    return;
  }
  if (!Array.isArray(trial.notes)) {
    throw new Error(`Trial ${trial.id}: notes must be an array when provided.`);
  }
  for (const [index, note] of trial.notes.entries()) {
    if (typeof note !== "string" || note.length === 0) {
      throw new Error(`Trial ${trial.id}: notes[${index}] must be a non-empty string.`);
    }
  }
}

function validateRules(trial: ComboTrial): void {
  if (trial.rules === undefined) {
    return;
  }

  const rulesRecord = ensureRecord(trial.rules, `Trial ${trial.id}: rules`);
  ensureAllowedKeys(rulesRecord, TRIAL_RULE_FIELDS, `Trial ${trial.id}: rules`);

  const defaultMode = trial.rules.defaultMode ?? "timeline";
  if (!["timeline", "stepper"].includes(defaultMode)) {
    throw new Error(`Trial ${trial.id}: unsupported defaultMode ${defaultMode}.`);
  }

  if (trial.rules.allowModeOverride !== undefined && typeof trial.rules.allowModeOverride !== "boolean") {
    throw new Error(`Trial ${trial.id}: rules.allowModeOverride must be a boolean when provided.`);
  }

  const timelineRules = trial.rules.timeline;
  if (timelineRules !== undefined) {
    const timelineRecord = ensureRecord(timelineRules, `Trial ${trial.id}: rules.timeline`);
    ensureAllowedKeys(timelineRecord, TRIAL_RULE_TIMELINE_FIELDS, `Trial ${trial.id}: rules.timeline`);

    if (timelineRules.defaultToleranceFrames !== undefined) {
      ensureNonNegative(timelineRules.defaultToleranceFrames, `${trial.id}.rules.timeline.defaultToleranceFrames`);
    }
    if (timelineRules.defaultMissAfterFrames !== undefined) {
      ensureNonNegative(timelineRules.defaultMissAfterFrames, `${trial.id}.rules.timeline.defaultMissAfterFrames`);
    }
  }

  const stepperRules = trial.rules.stepper;
  if (stepperRules !== undefined) {
    const stepperRecord = ensureRecord(stepperRules, `Trial ${trial.id}: rules.stepper`);
    ensureAllowedKeys(stepperRecord, TRIAL_RULE_STEPPER_FIELDS, `Trial ${trial.id}: rules.stepper`);

    if (stepperRules.timeoutFramesDefault !== undefined) {
      ensureNonNegative(stepperRules.timeoutFramesDefault, `${trial.id}.rules.stepper.timeoutFramesDefault`);
    }
    if (stepperRules.requirePressedDefault !== undefined && typeof stepperRules.requirePressedDefault !== "boolean") {
      throw new Error(`Trial ${trial.id}: rules.stepper.requirePressedDefault must be a boolean when provided.`);
    }
    if (
      stepperRules.requireReleaseBeforeReuseDefault !== undefined
      && typeof stepperRules.requireReleaseBeforeReuseDefault !== "boolean"
    ) {
      throw new Error(
        `Trial ${trial.id}: rules.stepper.requireReleaseBeforeReuseDefault must be a boolean when provided.`,
      );
    }
    if (
      stepperRules.requireNeutralBeforeStepDefault !== undefined
      && typeof stepperRules.requireNeutralBeforeStepDefault !== "boolean"
    ) {
      throw new Error(
        `Trial ${trial.id}: rules.stepper.requireNeutralBeforeStepDefault must be a boolean when provided.`,
      );
    }
  }
}

function validateMoveStep(step: unknown, trialId: string, index: number, isFirst: boolean): void {
  const stepRecord = ensureRecord(step, `Trial ${trialId}: steps[${index}]`);
  ensureAllowedKeys(stepRecord, STEP_MOVE_FIELDS, `Trial ${trialId}: steps[${index}]`);

  const s = stepRecord as {
    move?: unknown;
    connect?: unknown;
    cancelKind?: unknown;
    label?: unknown;
    window?: unknown;
  };

  if (!s.move || typeof s.move !== "string") {
    throw new Error(`Trial ${trialId}: steps[${index}] requires a non-empty "move" (moveId).`);
  }

  if (!isFirst && s.connect === undefined) {
    throw new Error(`Trial ${trialId}: steps[${index}] requires "connect" (not the first step).`);
  }

  if (s.connect !== undefined) {
    if (!CONNECT_TYPES.has(s.connect as string)) {
      throw new Error(`Trial ${trialId}: steps[${index}] has unsupported connect "${String(s.connect)}".`);
    }
  }

  if (s.cancelKind !== undefined) {
    if (s.connect !== "cancel") {
      throw new Error(`Trial ${trialId}: steps[${index}] cancelKind is only valid when connect="cancel".`);
    }
    if (!CANCEL_KINDS.has(s.cancelKind as string)) {
      throw new Error(`Trial ${trialId}: steps[${index}] has unsupported cancelKind "${String(s.cancelKind)}".`);
    }
  }

  if (s.label !== undefined && typeof s.label !== "string") {
    throw new Error(`Trial ${trialId}: steps[${index}] label must be a string when provided.`);
  }

  if (s.window !== undefined) {
    const windowRecord = ensureRecord(s.window, `Trial ${trialId}: steps[${index}].window`);
    ensureAllowedKeys(windowRecord, STEP_MOVE_WINDOW_FIELDS, `Trial ${trialId}: steps[${index}].window`);

    const w = windowRecord as { min?: unknown; max?: unknown };
    if (w.min !== undefined) {
      if (typeof w.min !== "number") {
        throw new Error(`Trial ${trialId}: steps[${index}].window.min must be a number.`);
      }
      ensureNonNegative(w.min, `Trial ${trialId}: steps[${index}].window.min`);
    }
    if (w.max !== undefined) {
      if (typeof w.max !== "number") {
        throw new Error(`Trial ${trialId}: steps[${index}].window.max must be a number.`);
      }
      ensureNonNegative(w.max, `Trial ${trialId}: steps[${index}].window.max`);
    }
    if (w.min !== undefined && w.max !== undefined && (w.max as number) < (w.min as number)) {
      throw new Error(`Trial ${trialId}: steps[${index}].window.max must be >= min.`);
    }
  }
}

function validateWaitStep(step: unknown, trialId: string, index: number): void {
  const stepRecord = ensureRecord(step, `Trial ${trialId}: steps[${index}]`);
  ensureAllowedKeys(stepRecord, STEP_WAIT_FIELDS, `Trial ${trialId}: steps[${index}]`);

  const s = stepRecord as { wait?: unknown; reason?: unknown };

  if (!Number.isInteger(s.wait) || (s.wait as number) < 0) {
    throw new Error(`Trial ${trialId}: steps[${index}] wait must be a non-negative integer.`);
  }

  if (s.reason !== undefined && typeof s.reason !== "string") {
    throw new Error(`Trial ${trialId}: steps[${index}] reason must be a string when provided.`);
  }
}

function hasMoveField(step: unknown): boolean {
  return !!step && typeof step === "object" && !Array.isArray(step) && "move" in (step as object);
}

function hasWaitField(step: unknown): boolean {
  return !!step && typeof step === "object" && !Array.isArray(step) && "wait" in (step as object);
}

export function validateTrialConfiguration(trial: ComboTrial): void {
  const trialRecord = ensureRecord(trial, "Trial");
  ensureAllowedKeys(trialRecord, TRIAL_FIELDS, `Trial ${(trial as { id?: string }).id ?? "(unknown)"}`);

  if (!trial.id || typeof trial.id !== "string") {
    throw new Error("Trial id must be a non-empty string.");
  }
  if (!trial.name || typeof trial.name !== "string") {
    throw new Error(`Trial ${trial.id}: name must be a non-empty string.`);
  }

  validateNotes(trial);
  validateRules(trial);

  if (!Array.isArray(trial.steps) || trial.steps.length === 0) {
    throw new Error(`Trial ${trial.id}: at least one step is required.`);
  }

  for (const [index, step] of (trial.steps as unknown[]).entries()) {
    if (hasMoveField(step)) {
      validateMoveStep(step, trial.id, index, index === 0);
    } else if (hasWaitField(step)) {
      validateWaitStep(step, trial.id, index);
    } else {
      throw new Error(`Trial ${trial.id}: steps[${index}] must have either "move" or "wait" field.`);
    }
  }
}

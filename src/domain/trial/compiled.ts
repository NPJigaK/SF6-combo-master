import type { TrialCancelKind, TrialConnectType, TrialRules, TrialStepExpectation } from "./schema";

export type CompiledWindowSource = "inline_override" | "default" | "edge_override";

export type CompiledStepWindow = {
  edgeId: string;
  fromStepId: string;
  connect: TrialConnectType;
  cancelKind?: TrialCancelKind;
  minAfterPrevFrames: number;
  maxAfterPrevFrames: number;
  source: CompiledWindowSource;
};

export type CompiledTrialMoveStep = {
  id: string;
  label?: string;
  kind: "move";
  moveId: string;
  variant?: string;
  expect: TrialStepExpectation;
  windowFromPrev?: CompiledStepWindow;
};

export type CompiledTrialDelayStep = {
  id: string;
  label?: string;
  kind: "delay";
  frames: number;
  reason?: string;
  windowFromPrev?: CompiledStepWindow;
};

export type CompiledTrialStep = CompiledTrialMoveStep | CompiledTrialDelayStep;

export type CompiledStartPolicy = "immediate";

export type CompiledTrial = {
  id: string;
  name: string;
  notes?: string[];
  rules?: TrialRules;
  startPolicy: CompiledStartPolicy;
  steps: CompiledTrialStep[];
};

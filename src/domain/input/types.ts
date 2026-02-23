export const CANONICAL_BUTTONS = ["LP", "MP", "HP", "LK", "MK", "HK"] as const;

export type CanonicalButton = (typeof CANONICAL_BUTTONS)[number];

export const ATTACK_ACTION_IDS = [
  "LP",
  "MP",
  "HP",
  "LK",
  "MK",
  "HK",
  "LP+LK",
  "MP+MK",
  "HP+HK",
  "LP+MP",
  "LP+HP",
  "MP+HP",
  "LP+MP+HP",
  "LK+MK",
  "LK+HK",
  "MK+HK",
  "LK+MK+HK",
] as const;

export type AttackActionId = (typeof ATTACK_ACTION_IDS)[number];

export const PHYSICAL_BUTTONS = [
  "South",
  "East",
  "West",
  "North",
  "L1",
  "R1",
  "L2",
  "R2",
  "Select",
  "Start",
  "L3",
  "R3",
  "DPadUp",
  "DPadDown",
  "DPadLeft",
  "DPadRight",
] as const;

export type PhysicalButton = (typeof PHYSICAL_BUTTONS)[number];

export type ButtonBindings = Record<AttackActionId, PhysicalButton | null>;

export type Direction = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type InputSnapshot = {
  timestampMs: number;
  direction: Direction;
  physicalDown: PhysicalButton[];
  down: CanonicalButton[];
};

export type InputFrame = {
  frame: number;
  timestampMs: number;
  direction: Direction;
  physicalDown: PhysicalButton[];
  physicalPressed: PhysicalButton[];
  physicalReleased: PhysicalButton[];
  down: CanonicalButton[];
  pressed: CanonicalButton[];
  released: CanonicalButton[];
};

export type InputMode = "auto" | "xinput" | "hid" | "web";

export type InputProviderKind = "tauri-native-xinput" | "tauri-native-hid" | "web-gamepad";

export interface InputProvider {
  kind: InputProviderKind;
  start(): Promise<void>;
  stop(): Promise<void>;
  subscribe(cb: (frame: InputFrame) => void): () => void;
}

const CANONICAL_BUTTON_SET = new Set<string>(CANONICAL_BUTTONS);
const ATTACK_ACTION_ID_SET = new Set<string>(ATTACK_ACTION_IDS);
const PHYSICAL_BUTTON_SET = new Set<string>(PHYSICAL_BUTTONS);

export function isCanonicalButton(value: string): value is CanonicalButton {
  return CANONICAL_BUTTON_SET.has(value);
}

export function isAttackActionId(value: string): value is AttackActionId {
  return ATTACK_ACTION_ID_SET.has(value);
}

export function isPhysicalButton(value: string): value is PhysicalButton {
  return PHYSICAL_BUTTON_SET.has(value);
}

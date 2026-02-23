export const CANONICAL_BUTTONS = ["LP", "MP", "HP", "LK", "MK", "HK", "DI", "PARry"] as const;

export type CanonicalButton = (typeof CANONICAL_BUTTONS)[number];

export type Direction = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type InputSnapshot = {
  timestampMs: number;
  direction: Direction;
  down: CanonicalButton[];
};

export type InputFrame = {
  frame: number;
  timestampMs: number;
  direction: Direction;
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

export function isCanonicalButton(value: string): value is CanonicalButton {
  return CANONICAL_BUTTON_SET.has(value);
}

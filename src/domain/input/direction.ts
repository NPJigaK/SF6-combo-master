import type { Direction, InputFrame } from "./types";

export const DIRECTION_MODES = ["normal", "mirrored"] as const;
export type DirectionMode = (typeof DIRECTION_MODES)[number];

const MIRRORED_DIRECTION_MAP: Record<Direction, Direction> = {
  1: 3,
  2: 2,
  3: 1,
  4: 6,
  5: 5,
  6: 4,
  7: 9,
  8: 8,
  9: 7,
};

export function mirrorDirection(direction: Direction): Direction {
  return MIRRORED_DIRECTION_MAP[direction];
}

export function isDirectionMode(value: string): value is DirectionMode {
  return DIRECTION_MODES.includes(value as DirectionMode);
}

export function directionModeLabel(mode: DirectionMode): string {
  switch (mode) {
    case "normal":
      return "Left Side";
    case "mirrored":
      return "Right Side";
    default:
      return mode;
  }
}

export function applyDirectionModeToInputFrame(frame: InputFrame, mode: DirectionMode): InputFrame {
  if (mode !== "mirrored") {
    return frame;
  }

  const mirroredDirection = mirrorDirection(frame.direction);
  if (mirroredDirection === frame.direction) {
    return frame;
  }

  return {
    ...frame,
    direction: mirroredDirection,
  };
}

import type { CanonicalButton, Direction, InputFrame } from "./types";

const HOLD_FRAME_SATURATION = 99;

export type InputState = {
  direction: Direction;
  down: CanonicalButton[];
};

export type InputHistoryEntry = InputState & {
  startFrame: number;
  endFrame: number;
  holdFrames: number;
  isSaturated: boolean;
};

function hasSameButtons(left: CanonicalButton[], right: CanonicalButton[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function isSameInputState(entry: InputHistoryEntry, frame: InputFrame): boolean {
  return entry.direction === frame.direction && hasSameButtons(entry.down, frame.down);
}

export function toDisplayHoldFrames(holdFrames: number): number {
  return Math.min(holdFrames, HOLD_FRAME_SATURATION);
}

export function appendInputHistoryEntry(entries: InputHistoryEntry[], frame: InputFrame, limit: number): InputHistoryEntry[] {
  if (limit <= 0) {
    return [];
  }

  const lastEntry = entries[entries.length - 1];

  if (lastEntry && isSameInputState(lastEntry, frame)) {
    const nextHoldFrames = lastEntry.holdFrames + 1;
    const updatedEntry: InputHistoryEntry = {
      ...lastEntry,
      endFrame: frame.frame,
      holdFrames: nextHoldFrames,
      isSaturated: nextHoldFrames >= HOLD_FRAME_SATURATION,
    };

    const nextEntries = [...entries];
    nextEntries[nextEntries.length - 1] = updatedEntry;
    return nextEntries;
  }

  const nextEntry: InputHistoryEntry = {
    startFrame: frame.frame,
    endFrame: frame.frame,
    direction: frame.direction,
    down: [...frame.down],
    holdFrames: 1,
    isSaturated: false,
  };

  const nextEntries = [...entries, nextEntry];
  if (nextEntries.length <= limit) {
    return nextEntries;
  }

  return nextEntries.slice(nextEntries.length - limit);
}

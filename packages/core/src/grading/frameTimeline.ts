import type { ExactTerminalToken } from "../contracts/drill";

import { resolveDirectionState, type DirectionalInput, type ResolvedDirection } from "./directionResolution";

export type AttackButtonToken = ExactTerminalToken;

export interface InputSample {
  timestampMs: number;
  direction: DirectionalInput;
  buttons: AttackButtonToken[];
}

export interface TimelineFrame {
  frame: number;
  timestampMs: number;
  direction: ResolvedDirection;
  heldButtons: AttackButtonToken[];
  pressedButtons: AttackButtonToken[];
  releasedButtons: AttackButtonToken[];
}

export interface FrameTimeline {
  capacity: number;
  frames: TimelineFrame[];
}

const FRAME_TIME_MS = 1000 / 60;
const BUTTON_ORDER: AttackButtonToken[] = ["LP", "MP", "HP", "LK", "MK", "HK", "PP", "KK"];
const BUTTON_INDEX = new Map(BUTTON_ORDER.map((button, index) => [button, index]));

function sortButtons(buttons: AttackButtonToken[]): AttackButtonToken[] {
  return [...new Set(buttons)].sort(
    (left, right) => (BUTTON_INDEX.get(left) ?? Number.MAX_SAFE_INTEGER) - (BUTTON_INDEX.get(right) ?? Number.MAX_SAFE_INTEGER),
  );
}

function diffButtons(previous: AttackButtonToken[], current: AttackButtonToken[]) {
  const previousSet = new Set(previous);
  const currentSet = new Set(current);

  return {
    pressedButtons: current.filter((button) => !previousSet.has(button)),
    releasedButtons: previous.filter((button) => !currentSet.has(button)),
  };
}

function trimFrames(frames: TimelineFrame[], capacity: number): TimelineFrame[] {
  if (capacity <= 0) {
    return [];
  }

  return frames.slice(Math.max(0, frames.length - capacity));
}

export function quantizeTimestampToFrame(timestampMs: number): number {
  return Math.max(0, Math.round(timestampMs / FRAME_TIME_MS));
}

export function createFrameTimeline(capacity: number): FrameTimeline {
  return {
    capacity,
    frames: [],
  };
}

export function appendInputSample(timeline: FrameTimeline, sample: InputSample): FrameTimeline {
  const targetFrame = quantizeTimestampToFrame(sample.timestampMs);
  const nextDirection = resolveDirectionState(sample.direction);
  const nextHeldButtons = sortButtons(sample.buttons);
  const previousFrame = timeline.frames.at(-1);

  if (!previousFrame) {
    return {
      capacity: timeline.capacity,
      frames: trimFrames(
        [
          {
            frame: targetFrame,
            timestampMs: sample.timestampMs,
            direction: nextDirection,
            heldButtons: nextHeldButtons,
            pressedButtons: nextHeldButtons,
            releasedButtons: [],
          },
        ],
        timeline.capacity,
      ),
    };
  }

  if (targetFrame < previousFrame.frame) {
    throw new Error("Input samples must be appended in non-decreasing frame order.");
  }

  const frames = [...timeline.frames];

  if (targetFrame === previousFrame.frame) {
    const previousStableFrame = frames.at(-2);
    const priorButtons = previousStableFrame?.heldButtons ?? [];
    const { pressedButtons, releasedButtons } = diffButtons(priorButtons, nextHeldButtons);

    frames[frames.length - 1] = {
      frame: targetFrame,
      timestampMs: sample.timestampMs,
      direction: nextDirection,
      heldButtons: nextHeldButtons,
      pressedButtons,
      releasedButtons,
    };

    return {
      capacity: timeline.capacity,
      frames: trimFrames(frames, timeline.capacity),
    };
  }

  for (let frame = previousFrame.frame + 1; frame < targetFrame; frame += 1) {
    frames.push({
      frame,
      timestampMs: frame * FRAME_TIME_MS,
      direction: previousFrame.direction,
      heldButtons: previousFrame.heldButtons,
      pressedButtons: [],
      releasedButtons: [],
    });
  }

  const { pressedButtons, releasedButtons } = diffButtons(previousFrame.heldButtons, nextHeldButtons);
  frames.push({
    frame: targetFrame,
    timestampMs: sample.timestampMs,
    direction: nextDirection,
    heldButtons: nextHeldButtons,
    pressedButtons,
    releasedButtons,
  });

  return {
    capacity: timeline.capacity,
    frames: trimFrames(frames, timeline.capacity),
  };
}

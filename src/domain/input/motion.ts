import type { Direction, InputFrame } from "./types";

export type MotionCode = "236" | "214" | "623";

export type MotionMatch = {
  startFrame: number;
  endFrame: number;
};

const MOTION_PATTERNS: Record<MotionCode, Direction[]> = {
  "236": [2, 3, 6],
  "214": [2, 1, 4],
  "623": [6, 2, 3],
};

type DirectionEvent = {
  frame: number;
  direction: Direction;
};

function compressDirectionHistory(history: InputFrame[], minFrame: number, maxFrame: number): DirectionEvent[] {
  const events: DirectionEvent[] = [];
  let previousDirection: Direction | null = null;

  for (const frame of history) {
    if (frame.frame < minFrame || frame.frame > maxFrame) {
      continue;
    }

    if (previousDirection === frame.direction) {
      continue;
    }

    previousDirection = frame.direction;
    events.push({
      frame: frame.frame,
      direction: frame.direction,
    });
  }

  return events;
}

export function detectMotion(
  history: InputFrame[],
  motion: MotionCode,
  currentFrame: number,
  maxWindowFrames = 20,
): MotionMatch | null {
  const pattern = MOTION_PATTERNS[motion];
  const minFrame = Math.max(0, currentFrame - maxWindowFrames);
  const events = compressDirectionHistory(history, minFrame, currentFrame);

  if (events.length === 0) {
    return null;
  }

  let bestMatch: MotionMatch | null = null;

  for (let startIndex = 0; startIndex < events.length; startIndex += 1) {
    const startEvent = events[startIndex];
    if (startEvent.direction !== pattern[0]) {
      continue;
    }

    let patternIndex = 1;
    const startFrame = startEvent.frame;
    let lastMatchedDirection = startEvent.direction;

    for (let eventIndex = startIndex + 1; eventIndex < events.length; eventIndex += 1) {
      const event = events[eventIndex];

      if (event.direction === 5) {
        continue;
      }

      if (event.direction === lastMatchedDirection) {
        continue;
      }

      if (patternIndex < pattern.length && event.direction === pattern[patternIndex]) {
        lastMatchedDirection = event.direction;
        patternIndex += 1;

        if (patternIndex === pattern.length) {
          const candidate = {
            startFrame,
            endFrame: event.frame,
          };

          if (!bestMatch || candidate.endFrame > bestMatch.endFrame) {
            bestMatch = candidate;
          }
          break;
        }
        continue;
      }

      // A non-neutral direction that diverges from the expected next direction
      // invalidates this candidate sequence.
      break;
    }
  }

  return bestMatch;
}

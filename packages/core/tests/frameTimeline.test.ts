import { describe, expect, it } from "vitest";

import {
  appendInputSample,
  createFrameTimeline,
  quantizeTimestampToFrame,
  type TimelineFrame,
} from "../src/grading/frameTimeline";
import { resolveDirectionState } from "../src/grading/directionResolution";
import { detectTerminalEvents } from "../src/grading/terminalEvents";

describe("frame timeline", () => {
  it("quantizes input samples onto a 60Hz frame grid", () => {
    expect(quantizeTimestampToFrame(0)).toBe(0);
    expect(quantizeTimestampToFrame(16.7)).toBe(1);
    expect(quantizeTimestampToFrame(33.4)).toBe(2);
  });

  it("keeps only the newest frames inside the bounded ring buffer", () => {
    let timeline = createFrameTimeline(3);

    timeline = appendInputSample(timeline, {
      timestampMs: 0,
      direction: { resolvedDirection: "neutral" },
      buttons: [],
    });
    timeline = appendInputSample(timeline, {
      timestampMs: 16.7,
      direction: { resolvedDirection: "down" },
      buttons: [],
    });
    timeline = appendInputSample(timeline, {
      timestampMs: 33.4,
      direction: { resolvedDirection: "down_forward" },
      buttons: [],
    });
    timeline = appendInputSample(timeline, {
      timestampMs: 50.1,
      direction: { resolvedDirection: "forward" },
      buttons: [],
    });

    expect(timeline.frames.map((frame) => frame.frame)).toEqual([1, 2, 3]);
    expect(timeline.frames.at(-1)?.direction).toBe("forward");
  });

  it("passes backend-resolved directions through unchanged", () => {
    expect(
      resolveDirectionState({
        resolvedDirection: "down_forward",
        back: true,
        forward: true,
      }),
    ).toBe("down_forward");
  });

  it("neutralizes unresolved opposite directions before deriving diagonals", () => {
    expect(resolveDirectionState({ back: true, forward: true, down: true })).toBe("down");
    expect(resolveDirectionState({ up: true, down: true, forward: true })).toBe("forward");
    expect(resolveDirectionState({ up: true, down: true, back: true, forward: true })).toBe(
      "neutral",
    );
  });

  it("derives held state across intervening logical frames", () => {
    let timeline = createFrameTimeline(10);

    timeline = appendInputSample(timeline, {
      timestampMs: 0,
      direction: { resolvedDirection: "neutral" },
      buttons: [],
    });
    timeline = appendInputSample(timeline, {
      timestampMs: 16.7,
      direction: { resolvedDirection: "down" },
      buttons: ["LP"],
    });
    timeline = appendInputSample(timeline, {
      timestampMs: 50.1,
      direction: { resolvedDirection: "down" },
      buttons: ["LP"],
    });

    expect(timeline.frames.map((frame) => frame.frame)).toEqual([0, 1, 2, 3]);
    expect(timeline.frames[1]?.heldButtons).toEqual(["LP"]);
    expect(timeline.frames[2]?.heldButtons).toEqual(["LP"]);
    expect(timeline.frames[3]?.heldButtons).toEqual(["LP"]);
  });

  it("detects press and release terminal events from adjacent frames", () => {
    const pressFrame: TimelineFrame = {
      frame: 10,
      timestampMs: 166.7,
      direction: "forward",
      heldButtons: ["LP"],
      pressedButtons: ["LP"],
      releasedButtons: [],
    };
    const releaseFrame: TimelineFrame = {
      frame: 11,
      timestampMs: 183.4,
      direction: "forward",
      heldButtons: [],
      pressedButtons: [],
      releasedButtons: ["LP"],
    };

    expect(
      detectTerminalEvents(null, pressFrame, {
        default_terminal_event: "press",
        available_terminal_events: ["press", "release"],
      }),
    ).toEqual([{ button: "LP", frame: 10, kind: "press" }]);
    expect(
      detectTerminalEvents(pressFrame, releaseFrame, {
        default_terminal_event: "press",
        available_terminal_events: ["press", "release"],
      }),
    ).toEqual([{ button: "LP", frame: 11, kind: "release" }]);
  });
});

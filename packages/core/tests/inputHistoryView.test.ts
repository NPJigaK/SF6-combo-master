import { describe, expect, it } from "vitest";

import type { FrameTimeline, InputSample } from "../src/grading/frameTimeline";
import { appendInputSample, createFrameTimeline } from "../src/grading/frameTimeline";
import { buildInputHistoryView } from "../src/grading/inputHistoryView";
import { inputProfile, referenceRuleset } from "../src/index";

function buildTimeline(samples: InputSample[]): FrameTimeline {
  return samples.reduce((timeline, sample) => appendInputSample(timeline, sample), createFrameTimeline(256));
}

describe("input history view", () => {
  it("builds a versioned visible input history from the same shared frame timeline", () => {
    const timeline = buildTimeline([
      { timestampMs: 0, direction: { resolvedDirection: "neutral" }, buttons: [] },
      { timestampMs: 16.7, direction: { resolvedDirection: "down" }, buttons: [] },
      { timestampMs: 50.1, direction: { resolvedDirection: "down" }, buttons: ["LP"] },
    ]);

    const view = buildInputHistoryView({
      frames: timeline.frames,
      ruleset: referenceRuleset,
      inputProfile,
      limit: 10,
    });

    expect(view.view_version).toBe("sf6cm-input-history@1.0.0");
    expect(view.ruleset_version).toBe(referenceRuleset.ruleset_version);
    expect(view.input_profile).toBe(inputProfile.profile_id);
    expect(view.entries).toEqual([
      {
        direction: "neutral",
        held_buttons: [],
        start_frame: 0,
        end_frame: 0,
        hold_frames: 1,
      },
      {
        direction: "down",
        held_buttons: [],
        start_frame: 1,
        end_frame: 2,
        hold_frames: 2,
      },
      {
        direction: "down",
        held_buttons: ["LP"],
        start_frame: 3,
        end_frame: 3,
        hold_frames: 1,
      },
    ]);
  });
});

import { describe, expect, it } from "vitest";

import type { BuiltInDrill } from "../src/contracts/drill";
import type { FrameTimeline, InputSample } from "../src/grading/frameTimeline";
import { appendInputSample, createFrameTimeline } from "../src/grading/frameTimeline";
import { selectPrimaryFailure } from "../src/grading/failureSelection";
import { gradeAttempt } from "../src/grading/gradeAttempt";
import { coreDrillCatalog, inputProfile, referenceRuleset } from "../src/index";

function buildTimeline(samples: InputSample[]): FrameTimeline {
  return samples.reduce((timeline, sample) => appendInputSample(timeline, sample), createFrameTimeline(256));
}

function findDrill(drillId: string): BuiltInDrill {
  const drill = coreDrillCatalog.drills.find((entry) => entry.drill_id === drillId);

  if (!drill) {
    throw new Error(`Missing drill fixture: ${drillId}`);
  }

  return drill;
}

describe("grading core", () => {
  it("grades only the authored motion family instead of globally parsing every family", () => {
    const result = gradeAttempt({
      frames: buildTimeline([
        { timestampMs: 0, direction: { resolvedDirection: "down" }, buttons: [] },
        { timestampMs: 16.7, direction: { resolvedDirection: "down_forward" }, buttons: [] },
        { timestampMs: 33.4, direction: { resolvedDirection: "forward" }, buttons: ["LP"] },
      ]).frames,
      drill: findDrill("dpf_punch"),
      ruleset: referenceRuleset,
      inputProfile,
    });

    expect(result.passed).toBe(false);
    expect(result.primary_failure_key).toBe("missing_step");
    expect(result.match_kind).toBeNull();
  });

  it("prefers a canonical match over a later shortcut match within the same family", () => {
    const result = gradeAttempt({
      frames: buildTimeline([
        { timestampMs: 0, direction: { resolvedDirection: "down" }, buttons: [] },
        { timestampMs: 16.7, direction: { resolvedDirection: "down_forward" }, buttons: [] },
        { timestampMs: 33.4, direction: { resolvedDirection: "forward" }, buttons: [] },
        { timestampMs: 50.1, direction: { resolvedDirection: "forward" }, buttons: [] },
        { timestampMs: 66.8, direction: { resolvedDirection: "down" }, buttons: [] },
        { timestampMs: 83.5, direction: { resolvedDirection: "down_forward" }, buttons: ["LP"] },
      ]).frames,
      drill: findDrill("qcf_punch"),
      ruleset: referenceRuleset,
      inputProfile,
    });

    expect(result.passed).toBe(true);
    expect(result.match_kind).toBe("canonical");
    expect(result.primary_failure_key).toBeNull();
    expect(result.frame_span).toEqual({
      start_frame: 0,
      end_frame: 2,
      terminal_frame: 5,
    });
  });

  it("fails with terminal_input_mismatch when the motion is correct but the terminal attack is wrong", () => {
    const result = gradeAttempt({
      frames: buildTimeline([
        { timestampMs: 0, direction: { resolvedDirection: "down" }, buttons: [] },
        { timestampMs: 16.7, direction: { resolvedDirection: "down_forward" }, buttons: [] },
        { timestampMs: 33.4, direction: { resolvedDirection: "forward" }, buttons: ["HK"] },
      ]).frames,
      drill: findDrill("qcf_punch"),
      ruleset: referenceRuleset,
      inputProfile,
    });

    expect(result.passed).toBe(false);
    expect(result.primary_failure_key).toBe("terminal_input_mismatch");
  });

  it("fails with release_not_allowed when release is the latest terminal event under the default profile", () => {
    const result = gradeAttempt({
      frames: buildTimeline([
        { timestampMs: 0, direction: { resolvedDirection: "down" }, buttons: [] },
        { timestampMs: 16.7, direction: { resolvedDirection: "down_forward" }, buttons: [] },
        { timestampMs: 33.4, direction: { resolvedDirection: "forward" }, buttons: ["LP"] },
        { timestampMs: 50.1, direction: { resolvedDirection: "forward" }, buttons: [] },
      ]).frames,
      drill: findDrill("qcf_punch"),
      ruleset: referenceRuleset,
      inputProfile,
    });

    expect(result.passed).toBe(false);
    expect(result.primary_failure_key).toBe("release_not_allowed");
  });

  it("fails with extra_direction_break for representative rejected direction breaks", () => {
    const result = gradeAttempt({
      frames: buildTimeline([
        { timestampMs: 0, direction: { resolvedDirection: "down" }, buttons: [] },
        { timestampMs: 16.7, direction: { resolvedDirection: "back" }, buttons: [] },
        { timestampMs: 33.4, direction: { resolvedDirection: "down_forward" }, buttons: ["LP"] },
      ]).frames,
      drill: findDrill("qcf_punch"),
      ruleset: referenceRuleset,
      inputProfile,
    });

    expect(result.passed).toBe(false);
    expect(result.primary_failure_key).toBe("extra_direction_break");
  });

  it("fails with charge_insufficient when the held charge is shorter than the ruleset minimum", () => {
    const result = gradeAttempt({
      frames: buildTimeline([
        { timestampMs: 0, direction: { resolvedDirection: "back" }, buttons: [] },
        { timestampMs: 166.7, direction: { resolvedDirection: "forward" }, buttons: ["LP"] },
      ]).frames,
      drill: findDrill("charge_back_forward_punch"),
      ruleset: referenceRuleset,
      inputProfile,
    });

    expect(result.passed).toBe(false);
    expect(result.primary_failure_key).toBe("charge_insufficient");
  });

  it("selects the same primary failure key deterministically every time", () => {
    expect(
      selectPrimaryFailure([
        "missing_step",
        "terminal_input_mismatch",
        "charge_insufficient",
        "missing_step",
      ]),
    ).toBe("terminal_input_mismatch");
  });
});

import { describe, expect, it } from "vitest";

import type { BuiltInDrill } from "../src/contracts/drill";
import type { FrameTimeline, InputSample } from "../src/grading/frameTimeline";
import { appendInputSample, createFrameTimeline } from "../src/grading/frameTimeline";
import { buildRecentAttemptSummaryRecord, gradeAttempt } from "../src/grading/gradeAttempt";
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

describe("persistence records", () => {
  it("builds a narrow recent-attempt summary record without retaining raw trace data", () => {
    const drill = findDrill("qcf_punch");
    const result = gradeAttempt({
      frames: buildTimeline([
        { timestampMs: 0, direction: { resolvedDirection: "down" }, buttons: [] },
        { timestampMs: 16.7, direction: { resolvedDirection: "down_forward" }, buttons: [] },
        { timestampMs: 33.4, direction: { resolvedDirection: "forward" }, buttons: ["LP"] },
      ]).frames,
      drill,
      ruleset: referenceRuleset,
      inputProfile,
    });

    const record = buildRecentAttemptSummaryRecord({
      result,
      timestamp: "2026-03-16T12:00:00Z",
    });

    expect(Object.keys(record).sort()).toEqual([
      "canonical_or_shortcut",
      "drill_id",
      "frame_span_summary",
      "input_profile",
      "passed",
      "primary_failure_key",
      "ruleset_version",
      "terminal_requirement_kind",
      "timestamp",
    ]);
    expect(record).toEqual({
      drill_id: drill.drill_id,
      ruleset_version: referenceRuleset.ruleset_version,
      input_profile: inputProfile.profile_id,
      terminal_requirement_kind: drill.terminal_requirement_kind,
      passed: true,
      primary_failure_key: null,
      canonical_or_shortcut: "canonical",
      frame_span_summary: {
        start_frame: 0,
        end_frame: 2,
        terminal_frame: 2,
      },
      timestamp: "2026-03-16T12:00:00Z",
    });
  });
});

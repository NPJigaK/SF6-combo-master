import type { BuiltInDrill } from "../contracts/drill";
import type {
  FailureKey,
  FrameSpanSummary,
  InputProfile,
  MatchClassification,
  RecentAttemptSummaryRecord,
  ReferenceRuleset,
} from "../contracts/ruleset";

import { selectPrimaryFailure } from "./failureSelection";
import type { TimelineFrame } from "./frameTimeline";
import { detectTerminalEvents, type TerminalInputEvent } from "./terminalEvents";

interface DirectionRun {
  direction: string;
  start_frame: number;
  end_frame: number;
}

export interface GradeAttemptResult {
  drill_id: string;
  ruleset_version: string;
  input_profile: string;
  terminal_requirement_kind: BuiltInDrill["terminal_requirement_kind"];
  passed: boolean;
  primary_failure_key: FailureKey | null;
  match_kind: MatchClassification | null;
  frame_span: FrameSpanSummary | null;
  terminal_event: TerminalInputEvent | null;
}

interface MotionCandidate {
  kind: MatchClassification;
  span: FrameSpanSummary;
}

function buildDirectionRuns(frames: TimelineFrame[]): DirectionRun[] {
  const runs: DirectionRun[] = [];

  for (const frame of frames) {
    const previous = runs.at(-1);

    if (previous?.direction === frame.direction) {
      previous.end_frame = frame.frame;
      continue;
    }

    runs.push({
      direction: frame.direction,
      start_frame: frame.frame,
      end_frame: frame.frame,
    });
  }

  return runs;
}

function collectTerminalEvents(frames: TimelineFrame[], inputProfile: InputProfile): TerminalInputEvent[] {
  const events: TerminalInputEvent[] = [];

  for (let index = 0; index < frames.length; index += 1) {
    events.push(
      ...detectTerminalEvents(index > 0 ? frames[index - 1] ?? null : null, frames[index], inputProfile),
    );
  }

  return events;
}

function terminalMatches(drill: BuiltInDrill, event: TerminalInputEvent): boolean {
  switch (drill.terminal_requirement_kind) {
    case "any_attack":
      return true;
    case "button_family":
      return drill.terminal_requirement_value === "punch"
        ? ["LP", "MP", "HP", "PP"].includes(event.button)
        : ["LK", "MK", "HK", "KK"].includes(event.button);
    case "exact":
      return drill.terminal_requirement_value === event.button;
    default:
      return false;
  }
}

function isBetterCandidate(current: MotionCandidate, candidate: MotionCandidate): boolean {
  if (candidate.kind !== current.kind) {
    return candidate.kind === "canonical";
  }

  if (candidate.span.end_frame !== current.span.end_frame) {
    return candidate.span.end_frame > current.span.end_frame;
  }

  const currentSpan = current.span.end_frame - current.span.start_frame;
  const candidateSpan = candidate.span.end_frame - candidate.span.start_frame;

  return candidateSpan < currentSpan;
}

function matchPattern(
  runs: DirectionRun[],
  pattern: string[],
  terminalFrame: number,
  timing: ReferenceRuleset["motion_families"][keyof ReferenceRuleset["motion_families"]]["timing"],
): FrameSpanSummary | null {
  let best: FrameSpanSummary | null = null;

  for (let startIndex = 0; startIndex < runs.length; startIndex += 1) {
    if (runs[startIndex]?.direction !== pattern[0]) {
      continue;
    }

    const matchedRuns: DirectionRun[] = [];
    let patternIndex = 0;

    for (let runIndex = startIndex; runIndex < runs.length && patternIndex < pattern.length; runIndex += 1) {
      const run = runs[runIndex];
      const expected = pattern[patternIndex];

      if (run.direction !== expected) {
        break;
      }

      matchedRuns.push(run);
      patternIndex += 1;

      while (patternIndex < pattern.length && pattern[patternIndex] === run.direction) {
        patternIndex += 1;
      }
    }

    if (patternIndex !== pattern.length || matchedRuns.length === 0) {
      continue;
    }

    const firstRun = matchedRuns[0];
    const lastRun = matchedRuns.at(-1);

    if (!lastRun) {
      continue;
    }

    if (terminalFrame - firstRun.start_frame > timing.total_lookback_window_frames) {
      continue;
    }

    if (terminalFrame - lastRun.end_frame > timing.terminal_link_window_frames) {
      continue;
    }

    let continuityOkay = true;
    for (let index = 1; index < matchedRuns.length; index += 1) {
      const previous = matchedRuns[index - 1];
      const current = matchedRuns[index];
      const maxGap = timing.continuity_window_frames[index - 1] ?? timing.continuity_window_frames.at(-1) ?? 0;

      if (current.start_frame - previous.end_frame > maxGap) {
        continuityOkay = false;
        break;
      }
    }

    if (!continuityOkay) {
      continue;
    }

    if (timing.charge_minimum_frames) {
      const chargeFrames = firstRun.end_frame - firstRun.start_frame + 1;
      if (chargeFrames < timing.charge_minimum_frames) {
        continue;
      }
    }

    const candidate = {
      start_frame: firstRun.start_frame,
      end_frame: lastRun.start_frame,
      terminal_frame: terminalFrame,
    };

    if (
      !best ||
      candidate.end_frame > best.end_frame ||
      (candidate.end_frame === best.end_frame &&
        candidate.end_frame - candidate.start_frame < best.end_frame - best.start_frame)
    ) {
      best = candidate;
    }
  }

  return best;
}

function detectChargeInsufficient(
  runs: DirectionRun[],
  terminalFrame: number,
  familyRules: ReferenceRuleset["motion_families"][keyof ReferenceRuleset["motion_families"]],
): boolean {
  const chargeMinimum = familyRules.timing.charge_minimum_frames;
  const canonical = familyRules.canonical_paths[0];

  if (!chargeMinimum || !canonical || canonical.length < 2) {
    return false;
  }

  const chargeDirection = canonical[0];
  const releaseDirection = canonical.at(-1);

  for (let index = 0; index < runs.length; index += 1) {
    const run = runs[index];
    const next = runs[index + 1];

    if (!next || run.direction !== chargeDirection || next.direction !== releaseDirection) {
      continue;
    }

    const heldFrames = run.end_frame - run.start_frame + 1;
    if (
      heldFrames < chargeMinimum &&
      terminalFrame - run.start_frame <= familyRules.timing.total_lookback_window_frames &&
      terminalFrame - next.end_frame <= familyRules.timing.terminal_link_window_frames
    ) {
      return true;
    }
  }

  return false;
}

function detectExtraDirectionBreak(
  runs: DirectionRun[],
  familyRules: ReferenceRuleset["motion_families"][keyof ReferenceRuleset["motion_families"]],
): boolean {
  for (const pattern of familyRules.canonical_paths) {
    for (let startIndex = 0; startIndex < runs.length; startIndex += 1) {
      if (runs[startIndex]?.direction !== pattern[0]) {
        continue;
      }

      let patternIndex = 1;

      for (let runIndex = startIndex + 1; runIndex < runs.length && patternIndex < pattern.length; runIndex += 1) {
        const run = runs[runIndex];
        const expected = pattern[patternIndex];

        if (run.direction === expected) {
          patternIndex += 1;
          continue;
        }

        return true;
      }
    }
  }

  return false;
}

function evaluateMotion(
  frames: TimelineFrame[],
  terminalEvent: TerminalInputEvent,
  drill: BuiltInDrill,
  ruleset: ReferenceRuleset,
): { candidate: MotionCandidate | null; failures: FailureKey[] } {
  const familyRules = ruleset.motion_families[drill.motion_family_id];
  const framesInWindow = frames.filter(
    (frame) => frame.frame <= terminalEvent.frame && terminalEvent.frame - frame.frame <= familyRules.timing.total_lookback_window_frames,
  );
  const runs = buildDirectionRuns(framesInWindow);
  let bestCandidate: MotionCandidate | null = null;

  for (const canonicalPath of familyRules.canonical_paths) {
    const span = matchPattern(runs, canonicalPath, terminalEvent.frame, familyRules.timing);
    if (!span) {
      continue;
    }

    const candidate: MotionCandidate = { kind: "canonical", span };
    if (!bestCandidate || isBetterCandidate(bestCandidate, candidate)) {
      bestCandidate = candidate;
    }
  }

  for (const shortcutPath of familyRules.shortcut_variants) {
    const span = matchPattern(runs, shortcutPath, terminalEvent.frame, familyRules.timing);
    if (!span) {
      continue;
    }

    const candidate: MotionCandidate = { kind: "shortcut", span };
    if (!bestCandidate || isBetterCandidate(bestCandidate, candidate)) {
      bestCandidate = candidate;
    }
  }

  if (bestCandidate) {
    return { candidate: bestCandidate, failures: [] };
  }

  const failures: FailureKey[] = [];

  if (detectChargeInsufficient(runs, terminalEvent.frame, familyRules)) {
    failures.push("charge_insufficient");
  } else if (detectExtraDirectionBreak(runs, familyRules)) {
    failures.push("extra_direction_break");
  } else {
    failures.push("missing_step");
  }

  return { candidate: null, failures };
}

export function gradeAttempt({
  frames,
  drill,
  ruleset,
  inputProfile,
}: {
  frames: TimelineFrame[];
  drill: BuiltInDrill;
  ruleset: ReferenceRuleset;
  inputProfile: InputProfile;
}): GradeAttemptResult {
  const terminalEvents = collectTerminalEvents(frames, inputProfile);
  const terminalEvent = terminalEvents.at(-1) ?? null;

  if (!terminalEvent) {
    return {
      drill_id: drill.drill_id,
      ruleset_version: ruleset.ruleset_version,
      input_profile: inputProfile.profile_id,
      terminal_requirement_kind: drill.terminal_requirement_kind,
      passed: false,
      primary_failure_key: "missing_step",
      match_kind: null,
      frame_span: null,
      terminal_event: null,
    };
  }

  if (terminalEvent.kind === "release" && !inputProfile.button_release_input_enabled) {
    return {
      drill_id: drill.drill_id,
      ruleset_version: ruleset.ruleset_version,
      input_profile: inputProfile.profile_id,
      terminal_requirement_kind: drill.terminal_requirement_kind,
      passed: false,
      primary_failure_key: "release_not_allowed",
      match_kind: null,
      frame_span: null,
      terminal_event: terminalEvent,
    };
  }

  if (!terminalMatches(drill, terminalEvent)) {
    return {
      drill_id: drill.drill_id,
      ruleset_version: ruleset.ruleset_version,
      input_profile: inputProfile.profile_id,
      terminal_requirement_kind: drill.terminal_requirement_kind,
      passed: false,
      primary_failure_key: "terminal_input_mismatch",
      match_kind: null,
      frame_span: null,
      terminal_event: terminalEvent,
    };
  }

  const motionEvaluation = evaluateMotion(frames, terminalEvent, drill, ruleset);

  if (motionEvaluation.candidate) {
    return {
      drill_id: drill.drill_id,
      ruleset_version: ruleset.ruleset_version,
      input_profile: inputProfile.profile_id,
      terminal_requirement_kind: drill.terminal_requirement_kind,
      passed: true,
      primary_failure_key: null,
      match_kind: motionEvaluation.candidate.kind,
      frame_span: motionEvaluation.candidate.span,
      terminal_event: terminalEvent,
    };
  }

  return {
    drill_id: drill.drill_id,
    ruleset_version: ruleset.ruleset_version,
    input_profile: inputProfile.profile_id,
    terminal_requirement_kind: drill.terminal_requirement_kind,
    passed: false,
    primary_failure_key: selectPrimaryFailure(motionEvaluation.failures),
    match_kind: null,
    frame_span: null,
    terminal_event: terminalEvent,
  };
}

export function buildRecentAttemptSummaryRecord({
  result,
  timestamp,
}: {
  result: GradeAttemptResult;
  timestamp: string;
}): RecentAttemptSummaryRecord {
  return {
    drill_id: result.drill_id,
    ruleset_version: result.ruleset_version,
    input_profile: result.input_profile,
    terminal_requirement_kind: result.terminal_requirement_kind,
    passed: result.passed,
    primary_failure_key: result.primary_failure_key,
    canonical_or_shortcut: result.match_kind,
    frame_span_summary: result.frame_span,
    timestamp,
  };
}

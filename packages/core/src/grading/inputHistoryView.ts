import type { InputProfile, ReferenceRuleset } from "../contracts/ruleset";

import type { AttackButtonToken, TimelineFrame } from "./frameTimeline";
import type { ResolvedDirection } from "./directionResolution";

export interface InputHistoryEntry {
  direction: ResolvedDirection;
  held_buttons: AttackButtonToken[];
  start_frame: number;
  end_frame: number;
  hold_frames: number;
}

export interface InputHistoryView {
  view_version: string;
  ruleset_version: string;
  input_profile: string;
  entries: InputHistoryEntry[];
}

function sameButtons(left: AttackButtonToken[], right: AttackButtonToken[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((button, index) => button === right[index]);
}

export function buildInputHistoryView({
  frames,
  ruleset,
  inputProfile,
  limit = 20,
}: {
  frames: TimelineFrame[];
  ruleset: ReferenceRuleset;
  inputProfile: InputProfile;
  limit?: number;
}): InputHistoryView {
  const entries: InputHistoryEntry[] = [];

  for (const frame of frames) {
    const previous = entries.at(-1);

    if (previous && previous.direction === frame.direction && sameButtons(previous.held_buttons, frame.heldButtons)) {
      previous.end_frame = frame.frame;
      previous.hold_frames += 1;
      continue;
    }

    entries.push({
      direction: frame.direction,
      held_buttons: frame.heldButtons,
      start_frame: frame.frame,
      end_frame: frame.frame,
      hold_frames: 1,
    });
  }

  const limitedEntries = limit > 0 ? entries.slice(Math.max(0, entries.length - limit)) : [];

  return {
    view_version: ruleset.visible_input_history_version,
    ruleset_version: ruleset.ruleset_version,
    input_profile: inputProfile.profile_id,
    entries: limitedEntries,
  };
}

import type { InputProfile, TerminalEvent } from "../contracts/ruleset";

import type { AttackButtonToken, TimelineFrame } from "./frameTimeline";

export interface TerminalInputEvent {
  button: AttackButtonToken;
  frame: number;
  kind: TerminalEvent;
}

export function detectTerminalEvents(
  _previousFrame: TimelineFrame | null,
  currentFrame: TimelineFrame,
  profile: Pick<InputProfile, "available_terminal_events" | "default_terminal_event">,
): TerminalInputEvent[] {
  const events: TerminalInputEvent[] = [];

  if (profile.available_terminal_events.includes("press")) {
    for (const button of currentFrame.pressedButtons) {
      events.push({ button, frame: currentFrame.frame, kind: "press" });
    }
  }

  if (profile.available_terminal_events.includes("release")) {
    for (const button of currentFrame.releasedButtons) {
      events.push({ button, frame: currentFrame.frame, kind: "release" });
    }
  }

  return events;
}

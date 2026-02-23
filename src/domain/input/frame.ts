import { CANONICAL_BUTTONS, type CanonicalButton, type InputFrame, type InputSnapshot } from "./types";

const BUTTON_INDEX = new Map<CanonicalButton, number>(CANONICAL_BUTTONS.map((button, index) => [button, index]));

function sortButtons(buttons: Iterable<CanonicalButton>): CanonicalButton[] {
  return Array.from(new Set(buttons)).sort((left, right) => {
    return (BUTTON_INDEX.get(left) ?? Number.MAX_SAFE_INTEGER) - (BUTTON_INDEX.get(right) ?? Number.MAX_SAFE_INTEGER);
  });
}

export function buildInputFrame(frame: number, snapshot: InputSnapshot, previousFrame: InputFrame | null): InputFrame {
  const currentDown = sortButtons(snapshot.down);
  const previousDown = new Set(previousFrame?.down ?? []);
  const currentDownSet = new Set(currentDown);

  const pressed = currentDown.filter((button) => !previousDown.has(button));
  const released = (previousFrame?.down ?? []).filter((button) => !currentDownSet.has(button));

  return {
    frame,
    timestampMs: snapshot.timestampMs,
    direction: snapshot.direction,
    down: currentDown,
    pressed,
    released,
  };
}


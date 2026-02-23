import { CANONICAL_BUTTONS, PHYSICAL_BUTTONS, type CanonicalButton, type InputFrame, type InputSnapshot, type PhysicalButton } from "./types";

const BUTTON_INDEX = new Map<CanonicalButton, number>(CANONICAL_BUTTONS.map((button, index) => [button, index]));
const PHYSICAL_BUTTON_INDEX = new Map<PhysicalButton, number>(PHYSICAL_BUTTONS.map((button, index) => [button, index]));

function sortButtons(buttons: Iterable<CanonicalButton>): CanonicalButton[] {
  return Array.from(new Set(buttons)).sort((left, right) => {
    return (BUTTON_INDEX.get(left) ?? Number.MAX_SAFE_INTEGER) - (BUTTON_INDEX.get(right) ?? Number.MAX_SAFE_INTEGER);
  });
}

function sortPhysicalButtons(buttons: Iterable<PhysicalButton>): PhysicalButton[] {
  return Array.from(new Set(buttons)).sort((left, right) => {
    return (PHYSICAL_BUTTON_INDEX.get(left) ?? Number.MAX_SAFE_INTEGER) - (PHYSICAL_BUTTON_INDEX.get(right) ?? Number.MAX_SAFE_INTEGER);
  });
}

export function buildInputFrame(frame: number, snapshot: InputSnapshot, previousFrame: InputFrame | null): InputFrame {
  const currentDown = sortButtons(snapshot.down);
  const currentPhysicalDown = sortPhysicalButtons(snapshot.physicalDown);
  const previousDown = new Set(previousFrame?.down ?? []);
  const previousPhysicalDown = new Set(previousFrame?.physicalDown ?? []);
  const currentDownSet = new Set(currentDown);
  const currentPhysicalDownSet = new Set(currentPhysicalDown);

  const pressed = currentDown.filter((button) => !previousDown.has(button));
  const released = (previousFrame?.down ?? []).filter((button) => !currentDownSet.has(button));
  const physicalPressed = currentPhysicalDown.filter((button) => !previousPhysicalDown.has(button));
  const physicalReleased = (previousFrame?.physicalDown ?? []).filter((button) => !currentPhysicalDownSet.has(button));

  return {
    frame,
    timestampMs: snapshot.timestampMs,
    direction: snapshot.direction,
    physicalDown: currentPhysicalDown,
    physicalPressed,
    physicalReleased,
    down: currentDown,
    pressed,
    released,
  };
}

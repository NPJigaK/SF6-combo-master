import { PHYSICAL_BUTTONS, type InputFrame, type PhysicalButton } from "./types";

const PHYSICAL_BUTTON_INDEX = new Map<PhysicalButton, number>(PHYSICAL_BUTTONS.map((button, index) => [button, index]));

export type ResetTrialBinding = readonly PhysicalButton[];

export function normalizeResetTrialBinding(buttons: readonly PhysicalButton[]): PhysicalButton[] {
  return Array.from(new Set(buttons)).sort((left, right) => {
    return (PHYSICAL_BUTTON_INDEX.get(left) ?? Number.MAX_SAFE_INTEGER) - (PHYSICAL_BUTTON_INDEX.get(right) ?? Number.MAX_SAFE_INTEGER);
  });
}

export function isExactResetTrialBindingMatch(physicalDown: readonly PhysicalButton[], binding: ResetTrialBinding): boolean {
  if (binding.length === 0) {
    return false;
  }

  const normalizedDown = normalizeResetTrialBinding(physicalDown);
  const normalizedBinding = normalizeResetTrialBinding(binding);
  if (normalizedDown.length !== normalizedBinding.length) {
    return false;
  }

  return normalizedBinding.every((button, index) => normalizedDown[index] === button);
}

export function computeResetTrialPressTrigger(
  frame: InputFrame,
  binding: ResetTrialBinding,
  previousActive: boolean,
): { active: boolean; triggered: boolean } {
  const active = isExactResetTrialBindingMatch(frame.physicalDown, binding);
  const triggered = active && !previousActive && frame.physicalPressed.length > 0;
  return { active, triggered };
}

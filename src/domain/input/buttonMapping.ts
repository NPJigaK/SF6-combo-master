import {
  ATTACK_ACTION_IDS,
  CANONICAL_BUTTONS,
  PHYSICAL_BUTTONS,
  type AttackActionId,
  type ButtonBindings,
  type CanonicalButton,
  type PhysicalButton,
} from "./types";

export type AttackActionDefinition = {
  id: AttackActionId;
  label: string;
  buttons: CanonicalButton[];
};

export const PHYSICAL_BUTTON_LABELS: Record<PhysicalButton, string> = {
  South: "South (A / Cross)",
  East: "East (B / Circle)",
  West: "West (X / Square)",
  North: "North (Y / Triangle)",
  L1: "L1 / LB",
  R1: "R1 / RB",
  L2: "L2 / LT",
  R2: "R2 / RT",
  Select: "Select / Back",
  Start: "Start / Menu",
  L3: "L3",
  R3: "R3",
  DPadUp: "D-Pad Up",
  DPadDown: "D-Pad Down",
  DPadLeft: "D-Pad Left",
  DPadRight: "D-Pad Right",
};

export const ATTACK_ACTIONS: ReadonlyArray<AttackActionDefinition> = [
  { id: "LP", label: "LP", buttons: ["LP"] },
  { id: "MP", label: "MP", buttons: ["MP"] },
  { id: "HP", label: "HP", buttons: ["HP"] },
  { id: "LK", label: "LK", buttons: ["LK"] },
  { id: "MK", label: "MK", buttons: ["MK"] },
  { id: "HK", label: "HK", buttons: ["HK"] },
  { id: "LP+LK", label: "LP+LK", buttons: ["LP", "LK"] },
  { id: "MP+MK", label: "MP+MK", buttons: ["MP", "MK"] },
  { id: "HP+HK", label: "HP+HK", buttons: ["HP", "HK"] },
  { id: "LP+MP", label: "LP+MP", buttons: ["LP", "MP"] },
  { id: "LP+HP", label: "LP+HP", buttons: ["LP", "HP"] },
  { id: "MP+HP", label: "MP+HP", buttons: ["MP", "HP"] },
  { id: "LP+MP+HP", label: "LP+MP+HP", buttons: ["LP", "MP", "HP"] },
  { id: "LK+MK", label: "LK+MK", buttons: ["LK", "MK"] },
  { id: "LK+HK", label: "LK+HK", buttons: ["LK", "HK"] },
  { id: "MK+HK", label: "MK+HK", buttons: ["MK", "HK"] },
  { id: "LK+MK+HK", label: "LK+MK+HK", buttons: ["LK", "MK", "HK"] },
];

const ACTION_BY_ID = new Map<AttackActionId, AttackActionDefinition>(ATTACK_ACTIONS.map((action) => [action.id, action]));
const BUTTON_INDEX = new Map<CanonicalButton, number>(CANONICAL_BUTTONS.map((button, index) => [button, index]));

export const DEFAULT_BUTTON_BINDINGS: ButtonBindings = {
  LP: "West",
  MP: "North",
  HP: "R1",
  LK: "South",
  MK: "East",
  HK: "R2",
  "LP+LK": null,
  "MP+MK": "L2",
  "HP+HK": "L1",
  "LP+MP": null,
  "LP+HP": null,
  "MP+HP": null,
  "LP+MP+HP": null,
  "LK+MK": null,
  "LK+HK": null,
  "MK+HK": null,
  "LK+MK+HK": null,
};

export function createDefaultButtonBindings(): ButtonBindings {
  return { ...DEFAULT_BUTTON_BINDINGS };
}

export function normalizeButtonBindings(
  bindings: Partial<Record<AttackActionId, PhysicalButton | null | undefined>>,
): ButtonBindings {
  const next = createDefaultButtonBindings();

  for (const actionId of ATTACK_ACTION_IDS) {
    const candidate = bindings[actionId];
    if (candidate === null) {
      next[actionId] = null;
      continue;
    }

    if (candidate && PHYSICAL_BUTTONS.includes(candidate)) {
      next[actionId] = candidate;
    }
  }

  return dedupeBindings(next);
}

function dedupeBindings(bindings: ButtonBindings): ButtonBindings {
  const next = { ...bindings };
  const used = new Set<PhysicalButton>();

  for (const actionId of ATTACK_ACTION_IDS) {
    const physical = next[actionId];
    if (physical === null) {
      continue;
    }

    if (used.has(physical)) {
      next[actionId] = null;
      continue;
    }

    used.add(physical);
  }

  return next;
}

export function setBinding(
  bindings: ButtonBindings,
  actionId: AttackActionId,
  physical: PhysicalButton | null,
): ButtonBindings {
  const next = { ...bindings };

  if (physical !== null) {
    for (const key of ATTACK_ACTION_IDS) {
      if (key !== actionId && next[key] === physical) {
        next[key] = null;
      }
    }
  }

  next[actionId] = physical;
  return dedupeBindings(next);
}

function sortCanonicalButtons(buttons: Iterable<CanonicalButton>): CanonicalButton[] {
  return Array.from(new Set(buttons)).sort((left, right) => {
    return (BUTTON_INDEX.get(left) ?? Number.MAX_SAFE_INTEGER) - (BUTTON_INDEX.get(right) ?? Number.MAX_SAFE_INTEGER);
  });
}

export function mapPhysicalButtonsToCanonical(
  physicalDown: readonly PhysicalButton[],
  bindings: ButtonBindings,
): CanonicalButton[] {
  const physicalSet = new Set(physicalDown);
  const canonical = new Set<CanonicalButton>();

  for (const actionId of ATTACK_ACTION_IDS) {
    const boundPhysical = bindings[actionId];
    if (!boundPhysical || !physicalSet.has(boundPhysical)) {
      continue;
    }

    const action = ACTION_BY_ID.get(actionId);
    if (!action) {
      continue;
    }

    for (const button of action.buttons) {
      canonical.add(button);
    }
  }

  return sortCanonicalButtons(canonical);
}

import type { MasterMoveData } from "./compiler";
import type { ComboTrial, TrialStep, TrialStepMove } from "./schema";

type DamageAwareMasterMove = MasterMoveData & {
  official?: MasterMoveData["official"] & {
    columns?: {
      damage?: string | null;
    } | null;
  };
};

function isMoveStep(step: TrialStep): step is TrialStepMove {
  return "move" in step;
}

function parsePositiveInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  return Number.parseInt(value, 10);
}

export function parseMoveDamage(rawDamage: string | null | undefined): number | null {
  const trimmed = rawDamage?.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed === "-") {
    return 0;
  }

  const primary = trimmed.split("(")[0]?.trim() ?? "";
  if (!primary) {
    return null;
  }

  const multipliedMatch = primary.match(/^(\d+)\s*[xX*]\s*(\d+)$/);
  if (multipliedMatch) {
    const left = Number.parseInt(multipliedMatch[1], 10);
    const right = Number.parseInt(multipliedMatch[2], 10);
    return left * right;
  }

  if (/^\d{1,2},\d{3}$/.test(primary)) {
    const thousandStyle = Number.parseInt(primary.replace(",", ""), 10);
    return Number.isFinite(thousandStyle) ? thousandStyle : null;
  }

  if (/^\d+(?:\s*,\s*\d+)+$/.test(primary)) {
    const parts = primary.split(",").map((part) => part.trim());
    let total = 0;
    for (const part of parts) {
      const parsedPart = parsePositiveInteger(part);
      if (parsedPart === null) {
        return null;
      }
      total += parsedPart;
    }
    return total;
  }

  const integerOnly = parsePositiveInteger(primary);
  if (integerOnly !== null) {
    return integerOnly;
  }

  const firstInteger = primary.match(/\d+/)?.[0];
  if (!firstInteger) {
    return null;
  }

  return Number.parseInt(firstInteger, 10);
}

export function calculateTrialBaseDamage(
  trial: ComboTrial,
  masterMoves: readonly DamageAwareMasterMove[],
): number | null {
  const moveDamageById = new Map<string, number | null>();
  for (const move of masterMoves) {
    moveDamageById.set(move.moveId, parseMoveDamage(move.official?.columns?.damage));
  }

  let total = 0;
  for (const step of trial.steps) {
    if (!isMoveStep(step)) {
      continue;
    }

    const damage = moveDamageById.get(step.move);
    if (damage === null || damage === undefined) {
      return null;
    }

    total += damage;
  }

  return total;
}

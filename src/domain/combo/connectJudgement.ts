import type { TrialCancelKind } from "../trial/schema";
import type { NormalizedCancelValue, NormalizedValue, TriState } from "./frameNormalization";

export type LinkConnectionJudgement = {
  connect: "link";
  result: TriState;
  expression: "prev.onHitAdv >= next.startup";
  previousOnHitAdv: NormalizedValue<number>;
  nextStartup: NormalizedValue<number>;
  unknownReason?: string;
};

export type CancelConnectionJudgement = {
  connect: "cancel";
  cancelKind: TrialCancelKind;
  result: TriState;
  cancel: NormalizedCancelValue;
  unknownReason?: string;
};

function unknownReasonsForLink(
  previousOnHitAdv: NormalizedValue<number>,
  nextStartup: NormalizedValue<number>,
): string | undefined {
  const reasons: string[] = [];

  if (previousOnHitAdv.status === "unknown") {
    reasons.push(`prev.onHitAdv:${previousOnHitAdv.unknownReason}`);
  }
  if (nextStartup.status === "unknown") {
    reasons.push(`next.startup:${nextStartup.unknownReason}`);
  }

  return reasons.length > 0 ? reasons.join(",") : undefined;
}

export function judgeLinkConnection(
  previousOnHitAdv: NormalizedValue<number>,
  nextStartup: NormalizedValue<number>,
): LinkConnectionJudgement {
  if (previousOnHitAdv.status !== "known" || nextStartup.status !== "known") {
    return {
      connect: "link",
      result: "unknown",
      expression: "prev.onHitAdv >= next.startup",
      previousOnHitAdv,
      nextStartup,
      unknownReason: unknownReasonsForLink(previousOnHitAdv, nextStartup),
    };
  }

  return {
    connect: "link",
    result: previousOnHitAdv.value >= nextStartup.value,
    expression: "prev.onHitAdv >= next.startup",
    previousOnHitAdv,
    nextStartup,
  };
}

function pickCancelState(cancel: NormalizedCancelValue, cancelKind: TrialCancelKind): TriState {
  if (cancelKind === "special") {
    return cancel.special;
  }
  if (cancelKind === "super") {
    return cancel.super;
  }
  return cancel.dr;
}

export function judgeCancelConnection(
  cancel: NormalizedCancelValue,
  cancelKind: TrialCancelKind,
): CancelConnectionJudgement {
  const result = pickCancelState(cancel, cancelKind);

  return {
    connect: "cancel",
    cancelKind,
    result,
    cancel,
    unknownReason: result === "unknown" ? cancel.unknownReason ?? `cancel_${cancelKind}_unknown` : undefined,
  };
}

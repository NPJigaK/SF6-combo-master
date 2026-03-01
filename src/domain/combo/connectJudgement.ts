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

export type ChainConnectionJudgement = {
  connect: "chain";
  result: TriState;
  previousMisc: NormalizedValue<string>;
  targetMoveAliases: readonly string[];
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

const RAPID_CANCEL_PATTERN = /(can be rapid cancel(?:ed)?|rapid canceled|rapid cancel|連打キャンセル)/i;

function includesAlias(text: string, aliases: readonly string[]): boolean {
  const normalizedText = text.toLowerCase();
  return aliases.some((alias) => {
    const normalizedAlias = alias.trim().toLowerCase();
    return normalizedAlias.length > 0 && normalizedText.includes(normalizedAlias);
  });
}

export function judgeChainConnection(
  previousMisc: NormalizedValue<string>,
  targetMoveAliases: readonly string[],
): ChainConnectionJudgement {
  if (previousMisc.status !== "known") {
    return {
      connect: "chain",
      result: "unknown",
      previousMisc,
      targetMoveAliases,
      unknownReason: `prev.misc:${previousMisc.unknownReason}`,
    };
  }

  if (!RAPID_CANCEL_PATTERN.test(previousMisc.value)) {
    return {
      connect: "chain",
      result: false,
      previousMisc,
      targetMoveAliases,
    };
  }

  if (targetMoveAliases.length === 0) {
    return {
      connect: "chain",
      result: "unknown",
      previousMisc,
      targetMoveAliases,
      unknownReason: "chain_target_not_provided",
    };
  }

  if (includesAlias(previousMisc.value, targetMoveAliases)) {
    return {
      connect: "chain",
      result: true,
      previousMisc,
      targetMoveAliases,
    };
  }

  return {
    connect: "chain",
    result: "unknown",
    previousMisc,
    targetMoveAliases,
    unknownReason: "chain_target_not_explicit",
  };
}

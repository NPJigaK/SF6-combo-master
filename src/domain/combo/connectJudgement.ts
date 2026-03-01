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

export type TargetConnectionJudgement = {
  connect: "target";
  result: TriState;
  explicitTargetRoutes: readonly string[];
  targetMoveAliases: readonly string[];
  unknownReason?: string;
};

export type TierBJuggleProperties = {
  juggleStart?: string | null;
  juggleIncrease?: string | null;
  juggleLimit?: string | null;
};

export type JuggleConnectionJudgement = {
  connect: "juggle";
  result: TriState;
  previousMisc: NormalizedValue<string>;
  tierBJuggleProperties?: TierBJuggleProperties;
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

function normalizeAliases(aliases: readonly string[]): string[] {
  return aliases.map((alias) => alias.trim().toLowerCase()).filter((alias) => alias.length > 0);
}

function hasExplicitTargetRoute(routes: readonly string[], targetAliases: readonly string[]): boolean {
  return routes.some((route) => {
    const normalizedRoute = route.trim().toLowerCase();
    if (normalizedRoute.length === 0) {
      return false;
    }

    return targetAliases.some((alias) => normalizedRoute.includes(alias) || alias.includes(normalizedRoute));
  });
}

export function judgeTargetConnection(
  explicitTargetRoutes: readonly string[] | null | undefined,
  targetMoveAliases: readonly string[],
): TargetConnectionJudgement {
  const routes = normalizeAliases(explicitTargetRoutes ?? []);
  const aliases = normalizeAliases(targetMoveAliases);

  if (routes.length === 0) {
    return {
      connect: "target",
      result: "unknown",
      explicitTargetRoutes: routes,
      targetMoveAliases,
      unknownReason: "target_route_not_provided",
    };
  }

  if (aliases.length === 0) {
    return {
      connect: "target",
      result: "unknown",
      explicitTargetRoutes: routes,
      targetMoveAliases,
      unknownReason: "target_alias_not_provided",
    };
  }

  return {
    connect: "target",
    result: hasExplicitTargetRoute(routes, aliases),
    explicitTargetRoutes: routes,
    targetMoveAliases,
  };
}

const CONFIRMED_JUGGLE_PATTERN =
  /(forces? a juggle state|puts airborne opponents into (?:a )?limited juggle state|空中ヒット時に.*?浮かせ)/i;
const CANDIDATE_JUGGLE_PATTERN = /(juggle|mid-air opponent|airborne opponent|空中ヒット|空中)/i;

function parseOptionalInteger(rawValue: string | null | undefined): number | null {
  if (!rawValue) {
    return null;
  }

  const value = rawValue.trim();
  if (!/^-?\d+$/.test(value)) {
    return null;
  }

  return Number.parseInt(value, 10);
}

export function judgeJuggleConnection(
  previousMisc: NormalizedValue<string>,
  tierBJuggleProperties?: TierBJuggleProperties,
): JuggleConnectionJudgement {
  if (previousMisc.status !== "known") {
    return {
      connect: "juggle",
      result: "unknown",
      previousMisc,
      tierBJuggleProperties,
      unknownReason: `prev.misc:${previousMisc.unknownReason}`,
    };
  }

  const miscText = previousMisc.value;
  if (CONFIRMED_JUGGLE_PATTERN.test(miscText)) {
    return {
      connect: "juggle",
      result: true,
      previousMisc,
      tierBJuggleProperties,
    };
  }

  if (!CANDIDATE_JUGGLE_PATTERN.test(miscText)) {
    return {
      connect: "juggle",
      result: false,
      previousMisc,
      tierBJuggleProperties,
    };
  }

  const juggleLimit = parseOptionalInteger(tierBJuggleProperties?.juggleLimit);
  if (juggleLimit !== null && juggleLimit > 0) {
    return {
      connect: "juggle",
      result: true,
      previousMisc,
      tierBJuggleProperties,
    };
  }

  return {
    connect: "juggle",
    result: "unknown",
    previousMisc,
    tierBJuggleProperties,
    unknownReason: tierBJuggleProperties ? "tier_b_juggle_limit_insufficient" : "tier_b_juggle_limit_missing",
  };
}

import type { TrialCancelKind, TrialConnectType } from "../trial/schema";
import {
  judgeCancelConnection,
  judgeChainConnection,
  judgeJuggleConnection,
  judgeLinkConnection,
  judgeTargetConnection,
  type CancelConnectionJudgement,
  type ChainConnectionJudgement,
  type JuggleConnectionJudgement,
  type LinkConnectionJudgement,
  type TargetConnectionJudgement,
  type TierBAssistValues,
} from "./connectJudgement";
import { normalizeMoveFrame, type OfficialFrameColumns, type TriState } from "./frameNormalization";

export type ComboCandidateConfidence = "confirmed" | "candidate" | "unknown";

export type ComboCandidateConnectType = TrialConnectType | "juggle";

export type ComboCandidateMove = {
  moveId: string;
  official?: {
    moveName?: string;
    columns?: OfficialFrameColumns | null;
  } | null;
  supercomboExtras?: {
    details?: {
      hitstun?: string | null;
      hitstop?: string | null;
      afterDrOnhit?: string | null;
      afterDrOnblock?: string | null;
    } | null;
    properties?: {
      juggleStart?: string | null;
      juggleIncrease?: string | null;
      juggleLimit?: string | null;
    } | null;
    notes?: {
      rawText?: string | null;
    } | null;
  } | null;
};

export type ComboCandidateAssessmentInput = {
  connect: ComboCandidateConnectType;
  previousMove: ComboCandidateMove;
  nextMove?: ComboCandidateMove;
  cancelKind?: TrialCancelKind;
  targetMoveAliases?: readonly string[];
  explicitTargetRoutes?: readonly string[] | null;
};

export type ComboConnectionJudgement =
  | LinkConnectionJudgement
  | CancelConnectionJudgement
  | ChainConnectionJudgement
  | TargetConnectionJudgement
  | JuggleConnectionJudgement;

export type ComboCandidateAssessment = {
  connect: ComboCandidateConnectType;
  result: TriState;
  confidence: ComboCandidateConfidence;
  unknownReason?: string;
  sources: readonly string[];
  judgement: ComboConnectionJudgement;
};

type PreparedMove = {
  move: ComboCandidateMove;
  tierBSourceBase: string;
  normalized: ReturnType<typeof normalizeMoveFrame>;
  tierBAssistValues: TierBAssistValues;
  tierBAssistSources: {
    hitstun: string;
    hitstop: string;
    afterDrOnHit: string;
    afterDrOnBlock: string;
    juggleStart: string;
    juggleIncrease: string;
    juggleLimit: string;
  };
};

function toSourceBase(moveId: string): string {
  return `moves.master.${moveId}`;
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    deduped.push(trimmed);
  }

  return deduped;
}

function hasValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function buildDefaultTargetAliases(move: ComboCandidateMove | undefined): string[] {
  if (!move) {
    return [];
  }
  return unique([move.moveId, move.official?.moveName ?? ""]);
}

function requireNextMove(connect: ComboCandidateConnectType, nextMove: ComboCandidateMove | undefined): ComboCandidateMove {
  if (!nextMove) {
    throw new Error(`assessComboCandidate requires nextMove when connect="${connect}".`);
  }
  return nextMove;
}

function prepareMove(move: ComboCandidateMove): PreparedMove {
  const sourceBase = toSourceBase(move.moveId);
  const tierBSourceBase = `${sourceBase}.supercomboExtras`;
  const normalized = normalizeMoveFrame({
    moveId: move.moveId,
    officialColumns: move.official?.columns,
    supercomboExtras: move.supercomboExtras ? { notes: move.supercomboExtras.notes ?? null } : null,
    sources: {
      tierA: `${sourceBase}.official.columns`,
      tierB: tierBSourceBase,
    },
  });

  const tierBAssistValues: TierBAssistValues = {
    hitstun: move.supercomboExtras?.details?.hitstun ?? null,
    hitstop: move.supercomboExtras?.details?.hitstop ?? null,
    afterDrOnHit: move.supercomboExtras?.details?.afterDrOnhit ?? null,
    afterDrOnBlock: move.supercomboExtras?.details?.afterDrOnblock ?? null,
    juggleStart: move.supercomboExtras?.properties?.juggleStart ?? null,
    juggleIncrease: move.supercomboExtras?.properties?.juggleIncrease ?? null,
    juggleLimit: move.supercomboExtras?.properties?.juggleLimit ?? null,
  };

  return {
    move,
    tierBSourceBase,
    normalized,
    tierBAssistValues,
    tierBAssistSources: {
      hitstun: `${tierBSourceBase}.details.hitstun`,
      hitstop: `${tierBSourceBase}.details.hitstop`,
      afterDrOnHit: `${tierBSourceBase}.details.afterDrOnhit`,
      afterDrOnBlock: `${tierBSourceBase}.details.afterDrOnblock`,
      juggleStart: `${tierBSourceBase}.properties.juggleStart`,
      juggleIncrease: `${tierBSourceBase}.properties.juggleIncrease`,
      juggleLimit: `${tierBSourceBase}.properties.juggleLimit`,
    },
  };
}

function toConfidence(result: TriState, usedTierB: boolean): ComboCandidateConfidence {
  if (result !== true) {
    return "unknown";
  }
  return usedTierB ? "candidate" : "confirmed";
}

export function assessComboCandidate(input: ComboCandidateAssessmentInput): ComboCandidateAssessment {
  const previous = prepareMove(input.previousMove);
  const next = input.nextMove ? prepareMove(input.nextMove) : null;

  if (input.connect === "link") {
    const requiredNext = requireNextMove(input.connect, next?.move);
    const nextPrepared = next?.move.moveId === requiredNext.moveId ? next : prepareMove(requiredNext);
    const judgement = judgeLinkConnection(previous.normalized.tierA.onHitAdv, nextPrepared.normalized.tierA.startup);
    const sources = unique([
      judgement.previousOnHitAdv.source.source,
      judgement.nextStartup.source.source,
    ]);

    return {
      connect: input.connect,
      result: judgement.result,
      confidence: toConfidence(judgement.result, false),
      unknownReason: judgement.unknownReason,
      sources,
      judgement,
    };
  }

  if (input.connect === "cancel") {
    const cancelKind = input.cancelKind ?? "special";
    const judgement = judgeCancelConnection(previous.normalized.tierA.cancel, cancelKind);
    const sources = unique([judgement.cancel.source.source]);

    return {
      connect: input.connect,
      result: judgement.result,
      confidence: toConfidence(judgement.result, false),
      unknownReason: judgement.unknownReason,
      sources,
      judgement,
    };
  }

  if (input.connect === "chain") {
    const requiredNext = requireNextMove(input.connect, next?.move);
    const nextPrepared = next?.move.moveId === requiredNext.moveId ? next : prepareMove(requiredNext);
    const aliases = unique([...(input.targetMoveAliases ?? []), ...buildDefaultTargetAliases(nextPrepared.move)]);
    const judgement = judgeChainConnection(previous.normalized.tierA.misc, aliases);
    const sources = unique([judgement.previousMisc.source.source]);

    return {
      connect: input.connect,
      result: judgement.result,
      confidence: toConfidence(judgement.result, false),
      unknownReason: judgement.unknownReason,
      sources,
      judgement,
    };
  }

  if (input.connect === "target") {
    const requiredNext = requireNextMove(input.connect, next?.move);
    const nextPrepared = next?.move.moveId === requiredNext.moveId ? next : prepareMove(requiredNext);
    const aliases = unique([...(input.targetMoveAliases ?? []), ...buildDefaultTargetAliases(nextPrepared.move)]);
    const routes = unique(input.explicitTargetRoutes ?? []);
    const judgement = judgeTargetConnection(routes, aliases);
    const manualSources: string[] = [];
    if (routes.length > 0) {
      manualSources.push("manual.explicitTargetRoutes");
    }
    if (aliases.length > 0) {
      manualSources.push("manual.targetMoveAliases");
    }
    const sources = unique(manualSources);

    return {
      connect: input.connect,
      result: judgement.result,
      confidence: toConfidence(judgement.result, false),
      unknownReason: judgement.unknownReason,
      sources,
      judgement,
    };
  }

  const judgement = judgeJuggleConnection(previous.normalized.tierA.misc, previous.tierBAssistValues);
  const tierBSources: string[] = [];

  if (judgement.result === true && judgement.usedTierBAssist && hasValue(previous.tierBAssistValues.juggleLimit)) {
    tierBSources.push(previous.tierBAssistSources.juggleLimit);
  } else if (judgement.result === "unknown" && judgement.unknownReason?.startsWith("tier_b_juggle_limit")) {
    tierBSources.push(previous.tierBAssistSources.juggleLimit);
  }

  const sources = unique([judgement.previousMisc.source.source, ...tierBSources]);
  const usedTierB = judgement.result === true && judgement.usedTierBAssist;

  return {
    connect: input.connect,
    result: judgement.result,
    confidence: toConfidence(judgement.result, usedTierB),
    unknownReason: judgement.unknownReason,
    sources,
    judgement,
  };
}

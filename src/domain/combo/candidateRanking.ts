import type { TrialCancelKind, TrialConnectType } from "../trial/schema";
import {
  assessComboCandidate,
  type ComboCandidateAssessment,
  type ComboCandidateMove,
} from "./candidateAssessment";

export type RankedComboCandidateMove = {
  move: ComboCandidateMove;
  assessment: ComboCandidateAssessment;
};

export type RankComboCandidateMovesInput = {
  connect: TrialConnectType;
  previousMove: ComboCandidateMove;
  candidateMoves: readonly ComboCandidateMove[];
  cancelKind?: TrialCancelKind;
};

function resultPriority(result: ComboCandidateAssessment["result"]): number {
  if (result === true) {
    return 0;
  }
  if (result === "unknown") {
    return 1;
  }
  return 2;
}

function confidencePriority(confidence: ComboCandidateAssessment["confidence"]): number {
  if (confidence === "confirmed") {
    return 0;
  }
  if (confidence === "candidate") {
    return 1;
  }
  return 2;
}

export function rankComboCandidateMoves(input: RankComboCandidateMovesInput): RankedComboCandidateMove[] {
  const ranked = input.candidateMoves.map((move) => {
    const assessment = assessComboCandidate({
      connect: input.connect,
      previousMove: input.previousMove,
      nextMove: move,
      cancelKind: input.connect === "cancel" ? input.cancelKind : undefined,
    });

    return {
      move,
      assessment,
    };
  });

  ranked.sort((left, right) => {
    const resultOrder = resultPriority(left.assessment.result) - resultPriority(right.assessment.result);
    if (resultOrder !== 0) {
      return resultOrder;
    }

    const confidenceOrder =
      confidencePriority(left.assessment.confidence) - confidencePriority(right.assessment.confidence);
    if (confidenceOrder !== 0) {
      return confidenceOrder;
    }

    return left.move.moveId.localeCompare(right.move.moveId);
  });

  return ranked;
}

export function pickSuggestedComboCandidateMove(
  rankedCandidates: readonly RankedComboCandidateMove[],
): RankedComboCandidateMove | null {
  return (
    rankedCandidates.find((candidate) => candidate.assessment.result === true) ??
    rankedCandidates.find((candidate) => candidate.assessment.result === "unknown") ??
    rankedCandidates[0] ??
    null
  );
}

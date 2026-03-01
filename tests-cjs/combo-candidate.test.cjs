const assert = require("node:assert/strict");
const test = require("node:test");

const { assessComboCandidate } = require("../.test-dist/src/domain/combo/candidateAssessment.js");
const {
  rankComboCandidateMoves,
  pickSuggestedComboCandidateMove,
} = require("../.test-dist/src/domain/combo/candidateRanking.js");

test("assessComboCandidate returns confirmed for Tier A link success with evidence sources", () => {
  const result = assessComboCandidate({
    connect: "link",
    previousMove: {
      moveId: "sf6.jp.prev",
      official: {
        columns: {
          hitRecovery: "6",
        },
      },
    },
    nextMove: {
      moveId: "sf6.jp.next",
      official: {
        columns: {
          startUpFrame: "5",
        },
      },
    },
  });

  assert.equal(result.result, true);
  assert.equal(result.confidence, "confirmed");
  assert.deepEqual(result.sources, [
    "moves.master.sf6.jp.prev.official.columns.hitRecovery",
    "moves.master.sf6.jp.next.official.columns.startUpFrame",
  ]);
});

test("assessComboCandidate keeps unknown confidence for unresolved link judgement", () => {
  const result = assessComboCandidate({
    connect: "link",
    previousMove: {
      moveId: "sf6.jp.prev",
      official: {
        columns: {
          hitRecovery: "D",
        },
      },
    },
    nextMove: {
      moveId: "sf6.jp.next",
      official: {
        columns: {
          startUpFrame: "5",
        },
      },
    },
  });

  assert.equal(result.result, "unknown");
  assert.equal(result.confidence, "unknown");
  assert.match(result.unknownReason, /prev\.onHitAdv:knockdown_notation/);
  assert.deepEqual(result.sources, [
    "moves.master.sf6.jp.prev.official.columns.hitRecovery",
    "moves.master.sf6.jp.next.official.columns.startUpFrame",
  ]);
});

test("assessComboCandidate marks juggle as candidate when Tier B juggleLimit assistance is used", () => {
  const result = assessComboCandidate({
    connect: "juggle",
    previousMove: {
      moveId: "sf6.jp.prev",
      official: {
        columns: {
          miscellaneous: "Can juggle airborne opponent",
        },
      },
      supercomboExtras: {
        properties: {
          juggleLimit: "2",
        },
      },
    },
  });

  assert.equal(result.result, true);
  assert.equal(result.confidence, "candidate");
  assert.deepEqual(result.sources, [
    "moves.master.sf6.jp.prev.official.columns.miscellaneous",
    "moves.master.sf6.jp.prev.supercomboExtras.properties.juggleLimit",
  ]);
});

test("assessComboCandidate keeps juggle confirmed when Tier A evidence alone is explicit", () => {
  const result = assessComboCandidate({
    connect: "juggle",
    previousMove: {
      moveId: "sf6.jp.prev",
      official: {
        columns: {
          miscellaneous: "Forces a juggle state",
        },
      },
      supercomboExtras: {
        properties: {
          juggleLimit: "2",
        },
      },
    },
  });

  assert.equal(result.result, true);
  assert.equal(result.confidence, "confirmed");
  assert.deepEqual(result.sources, ["moves.master.sf6.jp.prev.official.columns.miscellaneous"]);
});

test("rankComboCandidateMoves prioritizes true over unknown over false", () => {
  const ranked = rankComboCandidateMoves({
    connect: "link",
    previousMove: {
      moveId: "sf6.jp.prev",
      official: {
        columns: {
          hitRecovery: "6",
        },
      },
    },
    candidateMoves: [
      {
        moveId: "sf6.jp.false",
        official: {
          columns: {
            startUpFrame: "9",
          },
        },
      },
      {
        moveId: "sf6.jp.unknown",
        official: {
          columns: {
            startUpFrame: "D",
          },
        },
      },
      {
        moveId: "sf6.jp.true",
        official: {
          columns: {
            startUpFrame: "5",
          },
        },
      },
    ],
  });

  assert.deepEqual(
    ranked.map((entry) => entry.move.moveId),
    ["sf6.jp.true", "sf6.jp.unknown", "sf6.jp.false"],
  );
  assert.deepEqual(
    ranked.map((entry) => entry.assessment.result),
    [true, "unknown", false],
  );
});

test("pickSuggestedComboCandidateMove falls back to unknown when no true result exists", () => {
  const ranked = rankComboCandidateMoves({
    connect: "link",
    previousMove: {
      moveId: "sf6.jp.prev",
      official: {
        columns: {
          hitRecovery: "3",
        },
      },
    },
    candidateMoves: [
      {
        moveId: "sf6.jp.false",
        official: {
          columns: {
            startUpFrame: "5",
          },
        },
      },
      {
        moveId: "sf6.jp.unknown",
        official: {
          columns: {
            startUpFrame: "D",
          },
        },
      },
    ],
  });

  const suggested = pickSuggestedComboCandidateMove(ranked);
  assert.ok(suggested);
  assert.equal(suggested.move.moveId, "sf6.jp.unknown");
  assert.equal(suggested.assessment.result, "unknown");
});

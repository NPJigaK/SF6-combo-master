const assert = require("node:assert/strict");
const test = require("node:test");

const { assessComboCandidate } = require("../.test-dist/src/domain/combo/candidateAssessment.js");

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

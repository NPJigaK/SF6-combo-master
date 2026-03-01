const assert = require("node:assert/strict");
const test = require("node:test");

const { normalizeTierAFrameData } = require("../.test-dist/src/domain/combo/frameNormalization.js");
const { judgeLinkConnection } = require("../.test-dist/src/domain/combo/connectJudgement.js");

function createTierA(overrides = {}) {
  return normalizeTierAFrameData(
    {
      startUpFrame: "6",
      hitRecovery: "4",
      blockRecovery: "-2",
      cancel: "C",
      miscellaneous: "Can be rapid canceled",
      ...overrides,
    },
    "data/jp/moves.master.json:official.columns",
  );
}

test("judgeLinkConnection returns true when on-hit advantage meets startup", () => {
  const previous = createTierA({ hitRecovery: "6" });
  const next = createTierA({ startUpFrame: "5" });

  const result = judgeLinkConnection(previous.onHitAdv, next.startup);
  assert.equal(result.result, true);
});

test("judgeLinkConnection returns false when on-hit advantage is insufficient", () => {
  const previous = createTierA({ hitRecovery: "4" });
  const next = createTierA({ startUpFrame: "5" });

  const result = judgeLinkConnection(previous.onHitAdv, next.startup);
  assert.equal(result.result, false);
});

test("judgeLinkConnection returns unknown when previous on-hit advantage is non-numeric", () => {
  const previous = createTierA({ hitRecovery: "D" });
  const next = createTierA({ startUpFrame: "5" });

  const result = judgeLinkConnection(previous.onHitAdv, next.startup);
  assert.equal(result.result, "unknown");
  assert.match(result.unknownReason, /prev\.onHitAdv:knockdown_notation/);
});

test("judgeLinkConnection returns unknown when next startup is non-numeric", () => {
  const previous = createTierA({ hitRecovery: "5" });
  const next = createTierA({ startUpFrame: "10-12" });

  const result = judgeLinkConnection(previous.onHitAdv, next.startup);
  assert.equal(result.result, "unknown");
  assert.match(result.unknownReason, /next\.startup:range_notation/);
});

test("judgeLinkConnection keeps both unknown reasons when both sides are unresolved", () => {
  const previous = createTierA({ hitRecovery: "D" });
  const next = createTierA({ startUpFrame: "total frames" });

  const result = judgeLinkConnection(previous.onHitAdv, next.startup);
  assert.equal(result.result, "unknown");
  assert.match(result.unknownReason, /prev\.onHitAdv:knockdown_notation/);
  assert.match(result.unknownReason, /next\.startup:total_frames_notation/);
});

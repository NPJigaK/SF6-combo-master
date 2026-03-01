const assert = require("node:assert/strict");
const test = require("node:test");

const {
  normalizeTierAFrameData,
  parseCancelCell,
} = require("../.test-dist/src/domain/combo/frameNormalization.js");
const {
  judgeLinkConnection,
  judgeCancelConnection,
  judgeChainConnection,
} = require("../.test-dist/src/domain/combo/connectJudgement.js");

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

test("judgeCancelConnection maps C to special super dr as true", () => {
  const cancel = parseCancelCell("C", {
    tier: "A",
    source: "official.columns.cancel",
  });

  assert.equal(judgeCancelConnection(cancel, "special").result, true);
  assert.equal(judgeCancelConnection(cancel, "super").result, true);
  assert.equal(judgeCancelConnection(cancel, "dr").result, true);
});

test("judgeCancelConnection maps SA tokens to super only", () => {
  const cancel = parseCancelCell("SA2", {
    tier: "A",
    source: "official.columns.cancel",
  });

  assert.equal(judgeCancelConnection(cancel, "special").result, false);
  assert.equal(judgeCancelConnection(cancel, "super").result, true);
  assert.equal(judgeCancelConnection(cancel, "dr").result, false);
});

test("judgeCancelConnection returns unknown for wildcard cancel routes", () => {
  const cancel = parseCancelCell("*", {
    tier: "A",
    source: "official.columns.cancel",
  });

  const special = judgeCancelConnection(cancel, "special");
  const superCancel = judgeCancelConnection(cancel, "super");
  const dr = judgeCancelConnection(cancel, "dr");

  assert.equal(special.result, "unknown");
  assert.equal(superCancel.result, "unknown");
  assert.equal(dr.result, "unknown");
  assert.match(special.unknownReason, /wildcard_cancel_destination/);
  assert.match(superCancel.unknownReason, /wildcard_cancel_destination/);
  assert.match(dr.unknownReason, /wildcard_cancel_destination/);
});

test("judgeChainConnection returns false when rapid cancel text is absent", () => {
  const previous = createTierA({ miscellaneous: "High" });
  const result = judgeChainConnection(previous.misc, ["crouching light punch"]);

  assert.equal(result.result, false);
});

test("judgeChainConnection returns unknown when rapid cancel target is not explicit", () => {
  const previous = createTierA({ miscellaneous: "Can be rapid canceled" });
  const result = judgeChainConnection(previous.misc, ["crouching light punch"]);

  assert.equal(result.result, "unknown");
  assert.equal(result.unknownReason, "chain_target_not_explicit");
});

test("judgeChainConnection returns true when rapid cancel target text is explicit", () => {
  const previous = createTierA({
    miscellaneous: "Can be rapid canceled into crouching light punch.",
  });
  const result = judgeChainConnection(previous.misc, ["crouching light punch"]);

  assert.equal(result.result, true);
});

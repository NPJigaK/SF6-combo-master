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
  judgeTargetConnection,
  judgeJuggleConnection,
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

test("judgeTargetConnection returns unknown when explicit route data is missing", () => {
  const result = judgeTargetConnection([], ["light stribog"]);

  assert.equal(result.result, "unknown");
  assert.equal(result.unknownReason, "target_route_not_provided");
});

test("judgeTargetConnection returns unknown when target alias is missing", () => {
  const result = judgeTargetConnection(["standing medium punch > medium stribog"], []);

  assert.equal(result.result, "unknown");
  assert.equal(result.unknownReason, "target_alias_not_provided");
});

test("judgeTargetConnection returns true when explicit route includes target alias", () => {
  const result = judgeTargetConnection(["standing medium punch > medium stribog"], ["medium stribog"]);

  assert.equal(result.result, true);
});

test("judgeTargetConnection returns false when explicit route excludes target alias", () => {
  const result = judgeTargetConnection(["standing medium punch > medium torbalan"], ["medium stribog"]);

  assert.equal(result.result, false);
});

test("judgeJuggleConnection returns false when misc has no juggle signal", () => {
  const previous = createTierA({ miscellaneous: "High" });
  const result = judgeJuggleConnection(previous.misc);

  assert.equal(result.result, false);
});

test("judgeJuggleConnection returns true when misc has confirmed juggle state text", () => {
  const previous = createTierA({
    miscellaneous: "Forces a juggle state when hitting a mid-air opponent.",
  });
  const result = judgeJuggleConnection(previous.misc);

  assert.equal(result.result, true);
});

test("judgeJuggleConnection uses tier B juggle limit when misc signal is only candidate-level", () => {
  const previous = createTierA({
    miscellaneous: "Has juggle potential after anti-air hit.",
  });
  const result = judgeJuggleConnection(previous.misc, {
    juggleStart: "1",
    juggleIncrease: "4",
    juggleLimit: "4",
  });

  assert.equal(result.result, true);
});

test("judgeJuggleConnection returns unknown when candidate misc signal lacks tier B juggle limit", () => {
  const previous = createTierA({
    miscellaneous: "Has juggle potential after anti-air hit.",
  });
  const result = judgeJuggleConnection(previous.misc);

  assert.equal(result.result, "unknown");
  assert.equal(result.unknownReason, "tier_b_juggle_limit_missing");
});

test("judgeJuggleConnection keeps tier A false even when tier B juggle limit is present", () => {
  const previous = createTierA({ miscellaneous: "High" });
  const result = judgeJuggleConnection(previous.misc, {
    juggleStart: "1",
    juggleIncrease: "1",
    juggleLimit: "4",
  });

  assert.equal(result.result, false);
});

test("judgeJuggleConnection keeps tier A confirmed true even when tier B juggle limit is insufficient", () => {
  const previous = createTierA({
    miscellaneous: "Forces a juggle state when hitting a mid-air opponent.",
  });
  const result = judgeJuggleConnection(previous.misc, {
    juggleStart: "1",
    juggleIncrease: "1",
    juggleLimit: "0",
  });

  assert.equal(result.result, true);
});

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  parseFrameNumberCell,
  parseCancelCell,
  normalizeTierAFrameData,
  normalizeMoveFrame,
} = require("../.test-dist/src/domain/combo/frameNormalization.js");

test("parseFrameNumberCell parses signed integer values", () => {
  const startup = parseFrameNumberCell("12", {
    tier: "A",
    source: "official.columns.startUpFrame",
  });
  const blockAdv = parseFrameNumberCell("-3", {
    tier: "A",
    source: "official.columns.blockRecovery",
  });

  assert.equal(startup.status, "known");
  assert.equal(startup.value, 12);
  assert.equal(blockAdv.status, "known");
  assert.equal(blockAdv.value, -3);
});

test("parseFrameNumberCell keeps D, total frames, and ranges as unknown", () => {
  const knockdown = parseFrameNumberCell("D", {
    tier: "A",
    source: "official.columns.hitRecovery",
  });
  const totalFrames = parseFrameNumberCell("total frames", {
    tier: "A",
    source: "official.columns.startUpFrame",
  });
  const range = parseFrameNumberCell("10-12", {
    tier: "A",
    source: "official.columns.startUpFrame",
  });

  assert.equal(knockdown.status, "unknown");
  assert.equal(knockdown.unknownReason, "knockdown_notation");
  assert.equal(totalFrames.status, "unknown");
  assert.equal(totalFrames.unknownReason, "total_frames_notation");
  assert.equal(range.status, "unknown");
  assert.equal(range.unknownReason, "range_notation");
});

test("parseCancelCell resolves true false unknown by cancel kind", () => {
  const all = parseCancelCell("C", {
    tier: "A",
    source: "official.columns.cancel",
  });
  const superOnly = parseCancelCell("SA3", {
    tier: "A",
    source: "official.columns.cancel",
  });
  const wildcard = parseCancelCell("*", {
    tier: "A",
    source: "official.columns.cancel",
  });
  const noCancel = parseCancelCell("", {
    tier: "A",
    source: "official.columns.cancel",
  });

  assert.deepEqual(
    { special: all.special, super: all.super, dr: all.dr },
    { special: true, super: true, dr: true },
  );
  assert.deepEqual(
    { special: superOnly.special, super: superOnly.super, dr: superOnly.dr },
    { special: false, super: true, dr: false },
  );
  assert.deepEqual(
    { special: wildcard.special, super: wildcard.super, dr: wildcard.dr },
    { special: "unknown", super: "unknown", dr: "unknown" },
  );
  assert.match(wildcard.unknownReason, /wildcard_cancel_destination/);
  assert.deepEqual(
    { special: noCancel.special, super: noCancel.super, dr: noCancel.dr },
    { special: false, super: false, dr: false },
  );
});

test("normalizeTierAFrameData stores tier source and unknown reasons per field", () => {
  const normalized = normalizeTierAFrameData(
    {
      startUpFrame: "10-12",
      hitRecovery: "D",
      blockRecovery: "-2",
      cancel: "*",
      miscellaneous: "Can be rapid canceled",
    },
    "data/jp/moves.master.json:official.columns",
  );

  assert.equal(normalized.tier, "A");
  assert.equal(normalized.startup.status, "unknown");
  assert.equal(normalized.startup.unknownReason, "range_notation");
  assert.equal(normalized.onHitAdv.status, "unknown");
  assert.equal(normalized.onHitAdv.unknownReason, "knockdown_notation");
  assert.equal(normalized.onBlockAdv.status, "known");
  assert.equal(normalized.onBlockAdv.value, -2);
  assert.equal(normalized.cancel.special, "unknown");
  assert.equal(normalized.cancel.super, "unknown");
  assert.equal(normalized.cancel.dr, "unknown");
  assert.equal(normalized.misc.status, "known");
  assert.equal(normalized.misc.value, "Can be rapid canceled");
});

test("normalizeMoveFrame keeps tier A and tier B records with sources", () => {
  const normalized = normalizeMoveFrame({
    moveId: "sf6.jp.standingLightPunch",
    officialColumns: {
      startUpFrame: "6",
      hitRecovery: "4",
      blockRecovery: "-2",
      cancel: "C",
      miscellaneous: "Can be rapid canceled",
    },
    supercomboExtras: {
      notes: {
        rawText: "Chains into 5LP/2LP/2LK",
      },
    },
    sources: {
      tierA: "data/jp/moves.master.json:official.columns",
      tierB: "data/jp/moves.master.json:supercomboExtras",
    },
  });

  assert.equal(normalized.moveId, "sf6.jp.standingLightPunch");
  assert.equal(normalized.tierA.tier, "A");
  assert.equal(normalized.tierA.startup.status, "known");
  assert.equal(normalized.tierA.startup.value, 6);

  assert.ok(normalized.tierB);
  assert.equal(normalized.tierB.tier, "B");
  assert.equal(normalized.tierB.startup.status, "unknown");
  assert.equal(normalized.tierB.startup.unknownReason, "tier_b_value_unavailable");
  assert.equal(normalized.tierB.misc.status, "known");
  assert.equal(normalized.tierB.misc.value, "Chains into 5LP/2LP/2LK");
  assert.equal(normalized.tierB.misc.source.source, "data/jp/moves.master.json:supercomboExtras.notes.rawText");
});

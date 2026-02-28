const assert = require("node:assert/strict");
const test = require("node:test");

const { compileTrial } = require("../.test-dist/src/domain/trial/compiler.js");

const MASTER_MOVES = [
  {
    moveId: "sf6.jp.standingLightPunch",
    official: {
      moveName: "立ち小P",
      command: { tokens: [{ type: "icon", file: "icon_punch_l.png" }] },
    },
  },
  {
    moveId: "sf6.jp.crouchingMediumPunch",
    official: {
      moveName: "しゃがみ中P",
      command: { tokens: [{ type: "icon", file: "icon_punch_m.png" }] },
    },
  },
];

function createBaseTrial() {
  return {
    id: "compiler-test",
    name: "compiler-test",
    steps: [
      { move: "sf6.jp.standingLightPunch" },
      { move: "sf6.jp.crouchingMediumPunch", connect: "link" },
    ],
  };
}

test("compileTrial resolves step expect from command tokens", () => {
  const compiled = compileTrial(createBaseTrial(), { masterMoves: MASTER_MOVES });

  assert.equal(compiled.steps.length, 2);
  assert.deepEqual(compiled.steps[0].expect.buttons, ["LP"]);
  assert.deepEqual(compiled.steps[1].expect.buttons, ["MP"]);
});

test("compileTrial assigns auto step ids", () => {
  const compiled = compileTrial(createBaseTrial(), { masterMoves: MASTER_MOVES });

  assert.equal(compiled.steps[0].id, "s0");
  assert.equal(compiled.steps[1].id, "s1");
});

test("compileTrial uses default link window when no window specified", () => {
  const compiled = compileTrial(createBaseTrial(), { masterMoves: MASTER_MOVES });

  assert.equal(compiled.steps[1].windowFromPrev.maxAfterPrevFrames, 24);
  assert.equal(compiled.steps[1].windowFromPrev.minAfterPrevFrames, 0);
  assert.equal(compiled.steps[1].windowFromPrev.source, "default");
});

test("compileTrial uses inline window override when specified", () => {
  const trial = {
    ...createBaseTrial(),
    steps: [
      { move: "sf6.jp.standingLightPunch" },
      { move: "sf6.jp.crouchingMediumPunch", connect: "link", window: { max: 5 } },
    ],
  };
  const compiled = compileTrial(trial, { masterMoves: MASTER_MOVES });

  assert.equal(compiled.steps[1].windowFromPrev.maxAfterPrevFrames, 5);
  assert.equal(compiled.steps[1].windowFromPrev.source, "inline_override");
});

test("compileTrial uses default cancel window for special cancel", () => {
  const trial = {
    id: "cancel-test",
    name: "cancel-test",
    steps: [
      { move: "sf6.jp.standingLightPunch" },
      { move: "sf6.jp.crouchingMediumPunch", connect: "cancel", cancelKind: "special" },
    ],
  };
  const compiled = compileTrial(trial, { masterMoves: MASTER_MOVES });

  assert.equal(compiled.steps[1].windowFromPrev.maxAfterPrevFrames, 40);
  assert.equal(compiled.steps[1].windowFromPrev.connect, "cancel");
  assert.equal(compiled.steps[1].windowFromPrev.cancelKind, "special");
});

test("compileTrial uses smaller default window for dr cancel", () => {
  const trial = {
    id: "dr-test",
    name: "dr-test",
    steps: [
      { move: "sf6.jp.standingLightPunch" },
      { move: "sf6.jp.crouchingMediumPunch", connect: "cancel", cancelKind: "dr" },
    ],
  };
  const compiled = compileTrial(trial, { masterMoves: MASTER_MOVES });

  assert.equal(compiled.steps[1].windowFromPrev.maxAfterPrevFrames, 12);
});

test("compileTrial window max=0 means frame-perfect timing", () => {
  const trial = {
    id: "fast-test",
    name: "fast-test",
    steps: [
      { move: "sf6.jp.standingLightPunch" },
      { move: "sf6.jp.crouchingMediumPunch", connect: "link", window: { max: 0 } },
    ],
  };
  const compiled = compileTrial(trial, { masterMoves: MASTER_MOVES });

  assert.equal(compiled.steps[1].windowFromPrev.maxAfterPrevFrames, 0);
  assert.equal(compiled.steps[1].windowFromPrev.minAfterPrevFrames, 0);
});

test("compileTrial derives label from official moveName when not specified", () => {
  const compiled = compileTrial(createBaseTrial(), { masterMoves: MASTER_MOVES });

  assert.equal(compiled.steps[0].label, "立ち小P");
  assert.equal(compiled.steps[1].label, "しゃがみ中P");
});

test("compileTrial uses explicit label override when specified", () => {
  const trial = {
    ...createBaseTrial(),
    steps: [
      { move: "sf6.jp.standingLightPunch", label: "LP" },
      { move: "sf6.jp.crouchingMediumPunch", connect: "link" },
    ],
  };
  const compiled = compileTrial(trial, { masterMoves: MASTER_MOVES });

  assert.equal(compiled.steps[0].label, "LP");
});

test("compileTrial fails on unknown moveId", () => {
  const trial = {
    id: "bad-trial",
    name: "bad-trial",
    steps: [{ move: "sf6.jp.unknownMove" }],
  };

  assert.throws(
    () => compileTrial(trial, { masterMoves: MASTER_MOVES }),
    /unknown moveId/i,
  );
});

test("compileTrial preserves trial id, name, notes, rules", () => {
  const trial = {
    ...createBaseTrial(),
    notes: ["テスト"],
    rules: { defaultMode: "stepper" },
  };
  const compiled = compileTrial(trial, { masterMoves: MASTER_MOVES });

  assert.equal(compiled.id, "compiler-test");
  assert.equal(compiled.name, "compiler-test");
  assert.deepEqual(compiled.notes, ["テスト"]);
  assert.deepEqual(compiled.rules, { defaultMode: "stepper" });
});

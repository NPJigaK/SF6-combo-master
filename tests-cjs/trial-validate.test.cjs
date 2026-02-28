const assert = require("node:assert/strict");
const test = require("node:test");

const { validateTrialConfiguration } = require("../.test-dist/src/domain/trial/validate.js");

function createValidTrial(overrides = {}) {
  return {
    id: "validate-trial",
    name: "validate-trial",
    steps: [
      { move: "sf6.jp.standingLightPunch" },
      { move: "sf6.jp.crouchingLightPunch", connect: "link" },
    ],
    ...overrides,
  };
}

test("validateTrialConfiguration rejects unknown top-level field", () => {
  const trial = {
    ...createValidTrial(),
    fps: 60,
  };

  assert.throws(() => validateTrialConfiguration(trial), /unknown field "fps"/i);
});

test("validateTrialConfiguration rejects schemaVersion field", () => {
  const trial = {
    ...createValidTrial(),
    schemaVersion: 2,
  };

  assert.throws(() => validateTrialConfiguration(trial), /unknown field "schemaVersion"/i);
});

test("validateTrialConfiguration rejects edges field (removed in new schema)", () => {
  const trial = {
    ...createValidTrial(),
    edges: [],
  };

  assert.throws(() => validateTrialConfiguration(trial), /unknown field "edges"/i);
});

test("validateTrialConfiguration rejects unsupported default mode", () => {
  const trial = createValidTrial({
    rules: {
      defaultMode: "invalid_mode",
    },
  });

  assert.throws(() => validateTrialConfiguration(trial), /unsupported defaultMode/i);
});

test("validateTrialConfiguration rejects unknown step field", () => {
  const trial = createValidTrial({
    steps: [
      {
        move: "sf6.jp.standingLightPunch",
        timing: { openAfterPrevFrames: 0 },
      },
      { move: "sf6.jp.crouchingLightPunch", connect: "link" },
    ],
  });

  assert.throws(() => validateTrialConfiguration(trial), /unknown field "timing"/i);
});

test("validateTrialConfiguration rejects missing connect on non-first step", () => {
  const trial = createValidTrial({
    steps: [
      { move: "sf6.jp.standingLightPunch" },
      { move: "sf6.jp.crouchingLightPunch" },
    ],
  });

  assert.throws(() => validateTrialConfiguration(trial), /requires "connect"/i);
});

test("validateTrialConfiguration rejects cancelKind without connect=cancel", () => {
  const trial = createValidTrial({
    steps: [
      { move: "sf6.jp.standingLightPunch" },
      { move: "sf6.jp.crouchingLightPunch", connect: "link", cancelKind: "special" },
    ],
  });

  assert.throws(() => validateTrialConfiguration(trial), /cancelKind is only valid when connect="cancel"/i);
});

test("validateTrialConfiguration rejects step without move or wait field", () => {
  const trial = createValidTrial({
    steps: [
      { type: "move", moveId: "sf6.jp.standingLightPunch" },
    ],
  });

  assert.throws(() => validateTrialConfiguration(trial), /must have either "move" or "wait" field/i);
});

test("validateTrialConfiguration rejects window.max < window.min", () => {
  const trial = createValidTrial({
    steps: [
      { move: "sf6.jp.standingLightPunch" },
      { move: "sf6.jp.crouchingLightPunch", connect: "link", window: { min: 10, max: 5 } },
    ],
  });

  assert.throws(() => validateTrialConfiguration(trial), /window\.max must be >= min/i);
});

test("validateTrialConfiguration accepts valid trial with rules", () => {
  const trial = createValidTrial({
    rules: {
      defaultMode: "timeline",
      allowModeOverride: true,
    },
  });

  assert.doesNotThrow(() => validateTrialConfiguration(trial));
});

test("validateTrialConfiguration accepts trial without rules (defaults apply)", () => {
  const trial = {
    id: "minimal",
    name: "minimal",
    steps: [{ move: "sf6.jp.standingLightPunch" }],
  };

  assert.doesNotThrow(() => validateTrialConfiguration(trial));
});

test("validateTrialConfiguration accepts window override on step", () => {
  const trial = createValidTrial({
    steps: [
      { move: "sf6.jp.standingLightPunch" },
      { move: "sf6.jp.crouchingLightPunch", connect: "link", window: { max: 5 } },
    ],
  });

  assert.doesNotThrow(() => validateTrialConfiguration(trial));
});

test("validateTrialConfiguration accepts cancel step with cancelKind", () => {
  const trial = createValidTrial({
    steps: [
      { move: "sf6.jp.standingLightPunch" },
      { move: "sf6.jp.crouchingLightPunch", connect: "cancel", cancelKind: "special" },
    ],
  });

  assert.doesNotThrow(() => validateTrialConfiguration(trial));
});

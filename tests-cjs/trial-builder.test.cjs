const assert = require("node:assert/strict");
const test = require("node:test");

const { buildComboTrial, createTrialIdFromName } = require("../.test-dist/src/domain/trial/builder.js");

test("createTrialIdFromName converts name to lowercase snake id", () => {
  assert.equal(createTrialIdFromName("JP Combo 2 - Light Route"), "jp_combo_2_light_route");
});

test("createTrialIdFromName falls back when no ascii slug can be created", () => {
  assert.equal(createTrialIdFromName("  右向きコンボ  "), "custom_trial");
});

test("buildComboTrial applies default connect for non-first steps", () => {
  const trial = buildComboTrial({
    name: "Builder Trial",
    steps: [
      { move: "sf6.jp.standingLightPunch", connect: "cancel", cancelKind: "special" },
      { move: "sf6.jp.crouchingMediumPunch" },
    ],
  });

  assert.equal(trial.id, "builder_trial");
  assert.equal(trial.steps[0].connect, undefined);
  assert.equal(trial.steps[0].cancelKind, undefined);
  assert.equal(trial.steps[1].connect, "link");
});

test("buildComboTrial only includes cancelKind when connect is cancel", () => {
  const trial = buildComboTrial({
    id: "custom-id",
    name: "Builder Trial",
    steps: [
      { move: "sf6.jp.standingLightPunch" },
      { move: "sf6.jp.crouchingMediumPunch", connect: "link", cancelKind: "super" },
      { move: "sf6.jp.lStribog", connect: "cancel", cancelKind: "dr" },
    ],
  });

  assert.equal(trial.id, "custom-id");
  assert.equal(trial.steps[1].cancelKind, undefined);
  assert.equal(trial.steps[2].cancelKind, "dr");
});

test("buildComboTrial parses notes and optional window values", () => {
  const trial = buildComboTrial({
    name: "Window Trial",
    notesText: "first note\n\nsecond note",
    steps: [
      { move: "sf6.jp.standingLightPunch", windowMax: 0 },
      { move: "sf6.jp.crouchingMediumPunch", connect: "target", windowMin: 1, windowMax: 5 },
    ],
    rules: { defaultMode: "stepper", allowModeOverride: true },
  });

  assert.deepEqual(trial.notes, ["first note", "second note"]);
  assert.deepEqual(trial.rules, { defaultMode: "stepper", allowModeOverride: true });
  assert.deepEqual(trial.steps[0].window, { max: 0 });
  assert.deepEqual(trial.steps[1].window, { min: 1, max: 5 });
});

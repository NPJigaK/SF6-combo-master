const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createDefaultButtonBindings,
  mapPhysicalButtonsToCanonical,
  normalizeButtonBindings,
  setBinding,
} = require("../.test-dist/src/domain/input/buttonMapping.js");
const { buildInputFrame } = require("../.test-dist/src/domain/input/frame.js");
const {
  computeResetTrialPressTrigger,
  isExactResetTrialBindingMatch,
  normalizeResetTrialBinding,
} = require("../.test-dist/src/domain/input/resetBinding.js");

test("default bindings expand combo actions to real button set", () => {
  const bindings = createDefaultButtonBindings();
  const down = mapPhysicalButtonsToCanonical(["West", "South", "L1", "L2"], bindings);

  assert.deepEqual(down, ["LP", "MP", "HP", "LK", "MK", "HK"]);
});

test("pressing HP and HK independently stays as HP+HK without DI alias", () => {
  const bindings = createDefaultButtonBindings();
  const down = mapPhysicalButtonsToCanonical(["R1", "R2"], bindings);

  assert.deepEqual(down, ["HP", "HK"]);
  assert.equal(down.includes("DI"), false);
  assert.equal(down.includes("PARry"), false);
});

test("combo action assignment expands to multi-button output", () => {
  const bindings = setBinding(createDefaultButtonBindings(), "LP+MP+HP", "DPadUp");
  const down = mapPhysicalButtonsToCanonical(["DPadUp"], bindings);

  assert.deepEqual(down, ["LP", "MP", "HP"]);
});

test("setBinding keeps unique physical assignment by clearing previous owner", () => {
  const bindings = createDefaultButtonBindings();
  const next = setBinding(bindings, "LP", "L1");

  assert.equal(next.LP, "L1");
  assert.equal(next["HP+HK"], null);
});

test("normalizeButtonBindings drops duplicate physical assignments", () => {
  const normalized = normalizeButtonBindings({
    LP: "South",
    LK: "South",
  });

  assert.equal(normalized.LP, "South");
  assert.equal(normalized.LK, null);
});

test("normalizeResetTrialBinding dedupes and sorts physical buttons", () => {
  const binding = normalizeResetTrialBinding(["Start", "Select", "Start", "West"]);

  assert.deepEqual(binding, ["West", "Select", "Start"]);
});

test("isExactResetTrialBindingMatch requires exact set equality", () => {
  const binding = normalizeResetTrialBinding(["Select", "Start"]);

  assert.equal(isExactResetTrialBindingMatch(["Select", "Start"], binding), true);
  assert.equal(isExactResetTrialBindingMatch(["Start", "Select"], binding), true);
  assert.equal(isExactResetTrialBindingMatch(["Select"], binding), false);
  assert.equal(isExactResetTrialBindingMatch(["Select", "Start", "L1"], binding), false);
  assert.equal(isExactResetTrialBindingMatch(["Select", "Start"], []), false);
});

test("computeResetTrialPressTrigger fires once per combo press", () => {
  const binding = normalizeResetTrialBinding(["Select", "Start"]);
  const samples = [["Select"], ["Select", "Start"], ["Select", "Start"], [], ["Select", "Start"]];

  let previousFrame = null;
  let previousActive = false;
  const triggeredHistory = [];

  for (let index = 0; index < samples.length; index += 1) {
    const frame = buildInputFrame(
      index,
      {
        timestampMs: index * 16.6667,
        direction: 5,
        physicalDown: samples[index],
        down: [],
      },
      previousFrame,
    );
    previousFrame = frame;

    const { active, triggered } = computeResetTrialPressTrigger(frame, binding, previousActive);
    previousActive = active;
    triggeredHistory.push(triggered);
  }

  assert.deepEqual(triggeredHistory, [false, true, false, false, true]);
});

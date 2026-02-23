const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createDefaultButtonBindings,
  mapPhysicalButtonsToCanonical,
  normalizeButtonBindings,
  setBinding,
} = require("../.test-dist/src/domain/input/buttonMapping.js");

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

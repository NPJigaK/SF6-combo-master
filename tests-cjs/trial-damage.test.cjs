const assert = require("node:assert/strict");
const test = require("node:test");

const {
  calculateTrialBaseDamage,
  parseMoveDamage,
} = require("../.test-dist/src/domain/trial/damage.js");

test("parseMoveDamage parses common damage notations", () => {
  assert.equal(parseMoveDamage("1200"), 1200);
  assert.equal(parseMoveDamage("-"), 0);
  assert.equal(parseMoveDamage("500x2"), 1000);
  assert.equal(parseMoveDamage("300,600"), 900);
  assert.equal(parseMoveDamage("600,400(2nd: 800)"), 1000);
  assert.equal(parseMoveDamage("1200 (2040)"), 1200);
  assert.equal(parseMoveDamage("500 recoverable"), 500);
  assert.equal(parseMoveDamage("D"), null);
});

test("calculateTrialBaseDamage sums all move-step damages", () => {
  const trial = {
    id: "trial_damage_sum",
    name: "Damage Sum",
    steps: [
      { move: "move.a" },
      { move: "move.b", connect: "link" },
      { move: "move.c", connect: "cancel", cancelKind: "special" },
    ],
  };

  const masterMoves = [
    { moveId: "move.a", official: { columns: { damage: "300" } } },
    { moveId: "move.b", official: { columns: { damage: "500x2" } } },
    { moveId: "move.c", official: { columns: { damage: "1200 (2040)" } } },
  ];

  assert.equal(calculateTrialBaseDamage(trial, masterMoves), 2500);
});

test("calculateTrialBaseDamage returns null when a move has unknown damage", () => {
  const trial = {
    id: "trial_damage_unknown",
    name: "Damage Unknown",
    steps: [{ move: "move.a" }, { move: "move.b", connect: "link" }],
  };

  const masterMoves = [
    { moveId: "move.a", official: { columns: { damage: "300" } } },
    { moveId: "move.b", official: { columns: { damage: "D" } } },
  ];

  assert.equal(calculateTrialBaseDamage(trial, masterMoves), null);
});

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  applyDirectionModeToInputFrame,
  mirrorDirection,
} = require("../.test-dist/src/domain/input/direction.js");

test("mirrorDirection flips horizontal numpad directions", () => {
  assert.equal(mirrorDirection(1), 3);
  assert.equal(mirrorDirection(3), 1);
  assert.equal(mirrorDirection(4), 6);
  assert.equal(mirrorDirection(6), 4);
  assert.equal(mirrorDirection(7), 9);
  assert.equal(mirrorDirection(9), 7);
});

test("mirrorDirection keeps neutral and vertical directions", () => {
  assert.equal(mirrorDirection(2), 2);
  assert.equal(mirrorDirection(5), 5);
  assert.equal(mirrorDirection(8), 8);
});

test("applyDirectionModeToInputFrame mirrors only direction field", () => {
  const frame = {
    frame: 10,
    timestampMs: 166.667,
    direction: 4,
    physicalDown: ["West"],
    physicalPressed: [],
    physicalReleased: [],
    down: ["LP"],
    pressed: [],
    released: [],
  };

  const mirrored = applyDirectionModeToInputFrame(frame, "mirrored");
  assert.equal(mirrored.direction, 6);
  assert.deepEqual(mirrored.down, ["LP"]);
  assert.deepEqual(mirrored.physicalDown, ["West"]);

  const normal = applyDirectionModeToInputFrame(frame, "normal");
  assert.equal(normal, frame);
});

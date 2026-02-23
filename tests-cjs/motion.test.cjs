const assert = require("node:assert/strict");
const test = require("node:test");

const { buildInputFrame } = require("../.test-dist/src/domain/input/frame.js");
const { detectMotion } = require("../.test-dist/src/domain/input/motion.js");

function buildDirectionFrames(directions) {
  let previousFrame = null;
  return directions.map((direction, frame) => {
    const currentFrame = buildInputFrame(
      frame,
      {
        timestampMs: frame * 16.6667,
        direction,
        down: [],
      },
      previousFrame,
    );
    previousFrame = currentFrame;
    return currentFrame;
  });
}

test("detectMotion finds 236 motion with neutral transitions", () => {
  const history = buildDirectionFrames([5, 2, 5, 3, 6]);
  const match = detectMotion(history, "236", 4);

  assert.ok(match);
  assert.equal(match.startFrame, 1);
  assert.equal(match.endFrame, 4);
});

test("detectMotion rejects diverging direction sequence", () => {
  const history = buildDirectionFrames([5, 2, 4, 6]);
  const match = detectMotion(history, "236", 3);

  assert.equal(match, null);
});

test("detectMotion prefers the latest valid motion", () => {
  const history = buildDirectionFrames([2, 3, 6, 5, 2, 3, 6]);
  const match = detectMotion(history, "236", 6);

  assert.ok(match);
  assert.equal(match.startFrame, 4);
  assert.equal(match.endFrame, 6);
});

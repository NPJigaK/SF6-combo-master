const assert = require("node:assert/strict");
const test = require("node:test");

const { buildInputFrame } = require("../.test-dist/src/domain/input/frame.js");
const { appendInputHistoryEntry, toDisplayHoldFrames } = require("../.test-dist/src/domain/input/history.js");

function buildFrames(samples) {
  let previousFrame = null;
  return samples.map((sample, index) => {
    const frame = buildInputFrame(
      index,
      {
        timestampMs: index * 16.6667,
        direction: sample.direction,
        physicalDown: sample.physicalDown ?? [],
        down: sample.down,
      },
      previousFrame,
    );
    previousFrame = frame;
    return frame;
  });
}

test("buildInputFrame reconstructs pressed/released from snapshots", () => {
  const [neutral, press, release] = buildFrames([
    { direction: 5, physicalDown: [], down: [] },
    { direction: 5, physicalDown: ["North", "West"], down: ["MP", "LP"] },
    { direction: 5, physicalDown: ["North"], down: ["MP"] },
  ]);

  assert.deepEqual(neutral.pressed, []);
  assert.deepEqual(neutral.released, []);
  assert.deepEqual(neutral.physicalPressed, []);
  assert.deepEqual(neutral.physicalReleased, []);

  assert.deepEqual(press.down, ["LP", "MP"]);
  assert.deepEqual(press.pressed, ["LP", "MP"]);
  assert.deepEqual(press.released, []);
  assert.deepEqual(press.physicalDown, ["West", "North"]);
  assert.deepEqual(press.physicalPressed, ["West", "North"]);
  assert.deepEqual(press.physicalReleased, []);

  assert.deepEqual(release.down, ["MP"]);
  assert.deepEqual(release.pressed, []);
  assert.deepEqual(release.released, ["LP"]);
  assert.deepEqual(release.physicalDown, ["North"]);
  assert.deepEqual(release.physicalPressed, []);
  assert.deepEqual(release.physicalReleased, ["West"]);
});

test("appendInputHistoryEntry compresses identical states into one entry", () => {
  const frames = buildFrames([
    { direction: 5, physicalDown: [], down: [] },
    { direction: 5, physicalDown: [], down: [] },
    { direction: 5, physicalDown: [], down: [] },
  ]);

  const entries = frames.reduce((previous, frame) => appendInputHistoryEntry(previous, frame, 24), []);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].startFrame, 0);
  assert.equal(entries[0].endFrame, 2);
  assert.equal(entries[0].holdFrames, 3);
  assert.equal(entries[0].isSaturated, false);
  assert.equal(toDisplayHoldFrames(entries[0].holdFrames), 3);
});

test("appendInputHistoryEntry splits entries on direction and button changes", () => {
  const frames = buildFrames([
    { direction: 6, physicalDown: ["North"], down: ["MP"] },
    { direction: 6, physicalDown: ["North"], down: ["MP"] },
    { direction: 6, physicalDown: ["North", "South"], down: ["MP", "LK"] },
    { direction: 5, physicalDown: [], down: [] },
    { direction: 4, physicalDown: [], down: [] },
  ]);

  const entries = frames.reduce((previous, frame) => appendInputHistoryEntry(previous, frame, 24), []);

  assert.equal(entries.length, 4);
  assert.deepEqual(entries.map((entry) => entry.holdFrames), [2, 1, 1, 1]);
  assert.deepEqual(
    entries.map((entry) => ({ direction: entry.direction, down: entry.down })),
    [
      { direction: 6, down: ["MP"] },
      { direction: 6, down: ["MP", "LK"] },
      { direction: 5, down: [] },
      { direction: 4, down: [] },
    ],
  );
});

test("appendInputHistoryEntry saturates display at 99 while preserving internal hold", () => {
  const frames = buildFrames(
    Array.from({ length: 120 }, () => ({
      direction: 5,
      physicalDown: [],
      down: [],
    })),
  );

  const entries = frames.reduce((previous, frame) => appendInputHistoryEntry(previous, frame, 24), []);
  const onlyEntry = entries[0];

  assert.equal(entries.length, 1);
  assert.equal(onlyEntry.holdFrames, 120);
  assert.equal(onlyEntry.isSaturated, true);
  assert.equal(toDisplayHoldFrames(onlyEntry.holdFrames), 99);
});

test("appendInputHistoryEntry enforces fixed entry limit", () => {
  const frames = buildFrames([
    { direction: 6, physicalDown: [], down: [] },
    { direction: 5, physicalDown: [], down: [] },
    { direction: 4, physicalDown: [], down: [] },
  ]);

  const entries = frames.reduce((previous, frame) => appendInputHistoryEntry(previous, frame, 2), []);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].direction, 5);
  assert.equal(entries[1].direction, 4);
});

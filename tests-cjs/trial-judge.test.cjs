const assert = require("node:assert/strict");
const test = require("node:test");

const { buildInputFrame } = require("../.test-dist/src/domain/input/frame.js");
const { TrialJudge } = require("../.test-dist/src/domain/trial/judge.js");

function advanceWithSamples(judge, samples) {
  let previousFrame = null;
  let snapshot = judge.getSnapshot();

  for (let frame = 0; frame < samples.length; frame += 1) {
    const sample = samples[frame];
    const inputFrame = buildInputFrame(
      frame,
      {
        timestampMs: frame * 16.6667,
        direction: sample.direction,
        down: sample.down,
      },
      previousFrame,
    );
    previousFrame = inputFrame;
    snapshot = judge.advance(inputFrame);
  }

  return snapshot;
}

test("TrialJudge succeeds for 2LK then 236LP sequence", () => {
  const trial = {
    id: "sample",
    name: "sample",
    fps: 60,
    steps: [
      {
        id: "step-1",
        expect: {
          direction: 2,
          buttons: ["LK"],
        },
        window: {
          openAfterPrevFrames: 0,
          closeAfterPrevFrames: 45,
        },
      },
      {
        id: "step-2",
        expect: {
          motion: "236",
          buttons: ["LP"],
          simultaneousWithinFrames: 2,
        },
        window: {
          openAfterPrevFrames: 0,
          closeAfterPrevFrames: 45,
        },
      },
    ],
  };

  const judge = new TrialJudge(trial);
  const snapshot = advanceWithSamples(judge, [
    { direction: 5, down: [] },
    { direction: 2, down: ["LK"] },
    { direction: 2, down: [] },
    { direction: 3, down: [] },
    { direction: 6, down: ["LP"] },
  ]);

  assert.equal(snapshot.status, "success");
  assert.equal(snapshot.currentStepIndex, 2);
  assert.equal(snapshot.lastMatchedFrame, 4);
});

test("TrialJudge fails when a step is missed within the window", () => {
  const trial = {
    id: "timeout",
    name: "timeout",
    fps: 60,
    steps: [
      {
        id: "step-1",
        expect: {
          direction: 6,
          buttons: ["LP"],
        },
        window: {
          openAfterPrevFrames: 0,
          closeAfterPrevFrames: 0,
        },
      },
    ],
  };

  const judge = new TrialJudge(trial);
  const snapshot = advanceWithSamples(judge, [
    { direction: 5, down: [] },
    { direction: 6, down: [] },
    { direction: 6, down: [] },
  ]);

  assert.equal(snapshot.status, "failed");
  assert.equal(snapshot.failedStepIndex, 0);
  assert.match(snapshot.failReason, /not completed within the window/i);
});

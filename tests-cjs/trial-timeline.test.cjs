const assert = require("node:assert/strict");
const test = require("node:test");

const { buildInputFrame } = require("../.test-dist/src/domain/input/frame.js");
const { createTrialEngine } = require("../.test-dist/src/domain/trial-engine/createTrialEngine.js");

function advanceWithSamples(engine, samples, options = {}) {
  let previousFrame = options.previousFrame ?? null;
  let nextFrame = options.startFrame ?? 0;
  let snapshot = engine.getSnapshot();

  for (let frame = 0; frame < samples.length; frame += 1) {
    const sample = samples[frame];
    const absoluteFrame = nextFrame + frame;
    const inputFrame = buildInputFrame(
      absoluteFrame,
      {
        timestampMs: absoluteFrame * 16.6667,
        direction: sample.direction,
        physicalDown: sample.physicalDown ?? [],
        down: sample.down,
      },
      previousFrame,
    );
    previousFrame = inputFrame;
    snapshot = engine.advance(inputFrame);
  }

  return snapshot;
}

test("Timeline mode records delta=0 on target frame", () => {
  const trial = {
    id: "timeline-delta-zero",
    name: "timeline-delta-zero",
    fps: 60,
    rules: {
      defaultMode: "timeline",
      timeline: {
        defaultToleranceFrames: 1,
        defaultMissAfterFrames: 6,
      },
    },
    steps: [
      {
        id: "step-1",
        expect: {
          buttons: ["LP"],
        },
        timeline: {
          targetAfterPrevFrames: 0,
          missAfterFrames: 6,
        },
      },
      {
        id: "step-2",
        expect: {
          buttons: ["MP"],
        },
        timeline: {
          targetAfterPrevFrames: 3,
          missAfterFrames: 6,
        },
      },
    ],
  };

  const engine = createTrialEngine(trial, { modeOverride: "timeline" });
  const snapshot = advanceWithSamples(engine, [
    { direction: 5, down: [] },
    { direction: 5, down: ["LP"] },
    { direction: 5, down: [] },
    { direction: 5, down: [] },
    { direction: 5, down: ["MP"] },
  ]);

  assert.equal(snapshot.status, "success");
  assert.equal(snapshot.assessments[0].deltaFrames, 0);
  assert.equal(snapshot.assessments[1].deltaFrames, 0);
});

test("Timeline mode records early/late delta and continues", () => {
  const trial = {
    id: "timeline-delta-early-late",
    name: "timeline-delta-early-late",
    fps: 60,
    rules: {
      defaultMode: "timeline",
      timeline: {
        defaultToleranceFrames: 1,
        defaultMissAfterFrames: 5,
      },
    },
    steps: [
      {
        id: "step-1",
        expect: {
          buttons: ["LP"],
        },
        timeline: {
          targetAfterPrevFrames: 0,
        },
      },
      {
        id: "step-2",
        expect: {
          buttons: ["MP"],
        },
        timeline: {
          targetAfterPrevFrames: 4,
        },
      },
      {
        id: "step-3",
        expect: {
          buttons: ["HP"],
        },
        timeline: {
          targetAfterPrevFrames: 4,
        },
      },
    ],
  };

  const engine = createTrialEngine(trial, { modeOverride: "timeline" });
  const snapshot = advanceWithSamples(engine, [
    { direction: 5, down: [] },
    { direction: 5, down: ["LP"] },
    { direction: 5, down: [] },
    { direction: 5, down: ["MP"] }, // early: target 5, actual 3 => -2
    { direction: 5, down: [] },
    { direction: 5, down: [] },
    { direction: 5, down: [] },
    { direction: 5, down: [] },
    { direction: 5, down: ["HP"] }, // late for step-3
  ]);

  assert.equal(snapshot.status, "success");
  assert.equal(snapshot.assessments[1].deltaFrames, -2);
  assert.equal(snapshot.assessments[2].deltaFrames > 0, true);
});

test("Timeline mode marks missed step and auto-advances", () => {
  const trial = {
    id: "timeline-miss",
    name: "timeline-miss",
    fps: 60,
    rules: {
      defaultMode: "timeline",
      timeline: {
        defaultToleranceFrames: 1,
        defaultMissAfterFrames: 2,
      },
    },
    steps: [
      {
        id: "step-1",
        expect: {
          buttons: ["LP"],
        },
        timeline: {
          targetAfterPrevFrames: 0,
        },
      },
      {
        id: "step-2",
        expect: {
          buttons: ["MP"],
        },
        timeline: {
          targetAfterPrevFrames: 2,
          missAfterFrames: 2,
        },
      },
      {
        id: "step-3",
        expect: {
          buttons: ["HP"],
        },
        timeline: {
          targetAfterPrevFrames: 0,
        },
      },
    ],
  };

  const engine = createTrialEngine(trial, { modeOverride: "timeline" });
  const snapshot = advanceWithSamples(engine, [
    { direction: 5, down: [] },
    { direction: 5, down: ["LP"] },
    { direction: 5, down: [] },
    { direction: 5, down: [] },
    { direction: 5, down: [] },
    { direction: 5, down: [] }, // step-2 miss happens here
    { direction: 5, down: [] },
    { direction: 5, down: ["HP"] }, // step-3 on next frame
  ]);

  assert.equal(snapshot.status, "success");
  assert.equal(snapshot.assessments[1].result, "missed");
  assert.equal(snapshot.assessments[2].result, "matched");
});

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

test("Stepper requires release before same-button reuse", () => {
  const trial = {
    id: "stepper-release-gate",
    name: "stepper-release-gate",
    fps: 60,
    rules: {
      defaultMode: "stepper",
      stepper: {
        timeoutFramesDefault: 30,
        requirePressedDefault: true,
        requireReleaseBeforeReuseDefault: true,
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
          buttons: ["LP"],
        },
        timeline: {
          targetAfterPrevFrames: 0,
        },
      },
    ],
  };

  const engine = createTrialEngine(trial, { modeOverride: "stepper" });
  const snapshot = advanceWithSamples(engine, [
    { direction: 5, down: [] },
    { direction: 5, down: ["LP"] }, // step-1
    { direction: 5, down: ["LP"] }, // hold only
    { direction: 5, down: ["LP"] }, // hold only
    { direction: 5, down: [] }, // release gate unlock
    { direction: 5, down: ["LP"] }, // step-2
  ]);

  assert.equal(snapshot.status, "success");
  assert.equal(snapshot.assessments[1].actualFrame, 5);
});

test("Stepper timeout creates retry event instead of fail", () => {
  const trial = {
    id: "stepper-timeout-retry",
    name: "stepper-timeout-retry",
    fps: 60,
    rules: {
      defaultMode: "stepper",
      stepper: {
        timeoutFramesDefault: 2,
      },
    },
    steps: [
      {
        id: "step-1",
        expect: {
          buttons: ["MP"],
        },
        timeline: {
          targetAfterPrevFrames: 0,
        },
      },
    ],
  };

  const engine = createTrialEngine(trial, { modeOverride: "stepper" });
  const snapshot = advanceWithSamples(engine, [
    { direction: 6, down: [] }, // start stepper trial
    { direction: 5, down: [] },
    { direction: 5, down: [] },
    { direction: 5, down: [] }, // timeout retry should happen here
    { direction: 5, down: ["MP"] },
  ]);

  assert.equal(snapshot.status, "success");
  assert.equal(snapshot.events.some((event) => event.type === "step_retry"), true);
  assert.equal(snapshot.assessments[0].attempts >= 2, true);
});

const assert = require("node:assert/strict");
const test = require("node:test");

const { buildInputFrame } = require("../.test-dist/src/domain/input/frame.js");
const { createTrialEngine } = require("../.test-dist/src/domain/trial-engine/createTrialEngine.js");

function advanceWithSamples(engine, samples, options = {}) {
  let previousFrame = options.previousFrame ?? null;
  const startFrame = options.startFrame ?? 0;
  let snapshot = engine.getSnapshot();

  for (let frame = 0; frame < samples.length; frame += 1) {
    const sample = samples[frame];
    const absoluteFrame = startFrame + frame;
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

function windowFromPrev(edgeId, fromStepId, minAfterPrevFrames, maxAfterPrevFrames, connect = "link") {
  return {
    edgeId,
    fromStepId,
    connect,
    minAfterPrevFrames,
    maxAfterPrevFrames,
    source: "edge_override",
  };
}

test("Timeline mode records delta=0 on window start", () => {
  const trial = {
    id: "timeline-delta-zero",
    name: "timeline-delta-zero",
    startPolicy: "immediate",
    rules: {
      defaultMode: "timeline",
    },
    steps: [
      {
        id: "step-1",
        kind: "move",
        moveId: "sf6.jp.standingLightPunch",
        expect: { buttons: ["LP"] },
      },
      {
        id: "step-2",
        kind: "move",
        moveId: "sf6.jp.crouchingMediumPunch",
        expect: { buttons: ["MP"] },
        windowFromPrev: windowFromPrev("e1", "step-1", 3, 3),
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
  assert.equal(snapshot.assessments[1].deltaFrames, 0);
});

test("Timeline mode marks missed step and continues from miss boundary", () => {
  const trial = {
    id: "timeline-miss",
    name: "timeline-miss",
    startPolicy: "immediate",
    rules: {
      defaultMode: "timeline",
    },
    steps: [
      {
        id: "step-1",
        kind: "move",
        moveId: "sf6.jp.standingLightPunch",
        expect: { buttons: ["LP"] },
      },
      {
        id: "step-2",
        kind: "move",
        moveId: "sf6.jp.crouchingMediumPunch",
        expect: { buttons: ["MP"] },
        windowFromPrev: windowFromPrev("e1", "step-1", 2, 2),
      },
      {
        id: "step-3",
        kind: "move",
        moveId: "sf6.jp.standingHeavyPunch",
        expect: { buttons: ["HP"] },
        windowFromPrev: windowFromPrev("e2", "step-2", 3, 6),
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
    { direction: 5, down: [] },
    { direction: 5, down: ["HP"] },
  ]);

  assert.equal(snapshot.status, "success");
  assert.equal(snapshot.assessments[1].result, "missed");
  assert.equal(snapshot.assessments[2].result, "matched");
  assert.equal(snapshot.assessments[2].actualFrame, 6);
});

test("Timeline mode accepts first step without explicit window", () => {
  const trial = {
    id: "timeline-first-step",
    name: "timeline-first-step",
    startPolicy: "immediate",
    rules: {
      defaultMode: "timeline",
    },
    steps: [
      {
        id: "step-1",
        kind: "move",
        moveId: "sf6.jp.standingLightPunch",
        expect: { buttons: ["LP"] },
      },
    ],
  };

  const engine = createTrialEngine(trial, { modeOverride: "timeline" });
  const snapshot = advanceWithSamples(engine, [
    { direction: 5, down: [] },
    { direction: 5, down: [] },
    { direction: 5, down: ["LP"] },
  ]);

  assert.equal(snapshot.status, "success");
  assert.equal(snapshot.assessments[0].result, "matched");
});

test("Timeline mode can mirror directional inputs for right-side play", () => {
  const trial = {
    id: "timeline-mirrored-motion",
    name: "timeline-mirrored-motion",
    startPolicy: "immediate",
    rules: {
      defaultMode: "timeline",
    },
    steps: [
      {
        id: "step-1",
        kind: "move",
        moveId: "sf6.jp.lStribog",
        expect: { motion: "236", buttons: ["LP"] },
      },
    ],
  };

  const engine = createTrialEngine(trial, { modeOverride: "timeline", directionMode: "mirrored" });
  const snapshot = advanceWithSamples(engine, [
    { direction: 5, down: [] },
    { direction: 2, down: [] },
    { direction: 1, down: [] },
    { direction: 4, down: [] },
    { direction: 4, down: ["LP"] },
  ]);

  assert.equal(snapshot.status, "success");
  assert.equal(snapshot.assessments[0].result, "matched");
});

const assert = require("node:assert/strict");
const test = require("node:test");

const { validateTrialConfiguration } = require("../.test-dist/src/domain/trial/validate.js");

function createMinimalTrial(overrides = {}) {
  return {
    id: "validate-trial",
    name: "validate-trial",
    fps: 60,
    steps: [
      {
        id: "step-1",
        expect: {
          buttons: ["LP"],
        },
        window: {
          openAfterPrevFrames: 0,
          closeAfterPrevFrames: 10,
        },
      },
    ],
    ...overrides,
  };
}

test("validateTrialConfiguration rejects unsupported default mode", () => {
  const trial = createMinimalTrial({
    rules: {
      defaultMode: "invalid_mode",
    },
  });

  assert.throws(() => validateTrialConfiguration(trial), /unsupported defaultMode invalid_mode/i);
});

test("validateTrialConfiguration accepts timeline or stepper defaults", () => {
  const timelineTrial = createMinimalTrial({
    rules: {
      defaultMode: "timeline",
    },
  });
  const stepperTrial = createMinimalTrial({
    rules: {
      defaultMode: "stepper",
    },
  });

  assert.doesNotThrow(() => validateTrialConfiguration(timelineTrial));
  assert.doesNotThrow(() => validateTrialConfiguration(stepperTrial));
});

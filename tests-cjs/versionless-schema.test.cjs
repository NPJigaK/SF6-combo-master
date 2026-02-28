const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { validateTrialConfiguration } = require("../.test-dist/src/domain/trial/validate.js");

function hasSchemaVersionKey(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((entry) => hasSchemaVersionKey(entry));
  }

  if (Object.prototype.hasOwnProperty.call(value, "schemaVersion")) {
    return true;
  }

  return Object.values(value).some((entry) => hasSchemaVersionKey(entry));
}

test("validateTrialConfiguration rejects schemaVersion in trial", () => {
  const trial = {
    id: "test",
    name: "test",
    schemaVersion: 1,
    steps: [{ move: "sf6.jp.standingLightPunch" }],
  };

  assert.throws(
    () => validateTrialConfiguration(trial),
    /unknown field "schemaVersion"/i,
  );
});

test("tracked data files are versionless", () => {
  const files = [
    "data/jp/moves.master.json",
    "data/jp/frame.supercombo.raw.json",
    "data/trials/jp/m2-crouch-lp-stand-lp-light-stribog.combo-trial.json",
    "data/trials/jp/m7-crouch-lp-stand-lp-light-stribog-fast.combo-trial.json",
  ];

  for (const relativePath of files) {
    const absolutePath = path.join(process.cwd(), relativePath);
    const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
    assert.equal(
      hasSchemaVersionKey(parsed),
      false,
      `${relativePath} still includes schemaVersion`,
    );
  }
});

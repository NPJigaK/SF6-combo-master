import fs from "node:fs/promises";
import path from "node:path";
import { normalizeHitAdvantage, normalizeStartup, type FrameComboRowLike } from "../src/domain/frameData/normalizer";
import type { ComboTrial } from "../src/domain/trial/schema";

type FrameComboData = {
  rows: FrameComboRowLike[];
};

type AnalyzeResult = {
  index: number;
  stepId: string;
  kind: string;
  message: string;
};

const DEFAULT_FRAME_DATA_PATH = path.join("data", "jp", "frame.combo.json");

function parseArgs(argv: readonly string[]): { trialPath: string; frameDataPath: string } {
  let trialPath = "";
  let frameDataPath = DEFAULT_FRAME_DATA_PATH;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--trial") {
      trialPath = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (value === "--frame-data") {
      frameDataPath = argv[index + 1] ?? DEFAULT_FRAME_DATA_PATH;
      index += 1;
      continue;
    }
  }

  if (!trialPath) {
    throw new Error("Usage: tsx tools/analyze-trial-link-window.ts --trial <path> [--frame-data <path>]");
  }

  return {
    trialPath,
    frameDataPath,
  };
}

function createRowIndex(rows: readonly FrameComboRowLike[]): Map<number, FrameComboRowLike> {
  const index = new Map<number, FrameComboRowLike>();
  for (const row of rows) {
    index.set(row.index, row);
  }
  return index;
}

function readManualWindow(step: ComboTrial["steps"][number]): { open: number; close: number } {
  if (step.timing) {
    return {
      open: step.timing.openAfterPrevFrames,
      close: step.timing.closeAfterPrevFrames,
    };
  }

  return {
    open: step.window.openAfterPrevFrames,
    close: step.window.closeAfterPrevFrames,
  };
}

function analyzeTrial(trial: ComboTrial, rowsByIndex: Map<number, FrameComboRowLike>): AnalyzeResult[] {
  const results: AnalyzeResult[] = [];

  for (let stepIndex = 0; stepIndex < trial.steps.length; stepIndex += 1) {
    const step = trial.steps[stepIndex];
    const timingKind = step.timing?.kind ?? "manual";

    if (timingKind !== "link") {
      continue;
    }

    const previousStep = trial.steps[stepIndex - 1];
    if (!previousStep) {
      results.push({
        index: stepIndex,
        stepId: step.id,
        kind: "warning",
        message: "link timing on first step is unsupported.",
      });
      continue;
    }

    if (!previousStep.moveRef || !step.moveRef) {
      results.push({
        index: stepIndex,
        stepId: step.id,
        kind: "warning",
        message: "moveRef is missing; keep manual window.",
      });
      continue;
    }

    const previousRow = rowsByIndex.get(previousStep.moveRef.rowIndex);
    const currentRow = rowsByIndex.get(step.moveRef.rowIndex);
    if (!previousRow || !currentRow) {
      results.push({
        index: stepIndex,
        stepId: step.id,
        kind: "warning",
        message: "frame row was not found; keep manual window.",
      });
      continue;
    }

    const normalizedHitAdvantage = normalizeHitAdvantage(previousRow.hitAdvantage);
    const normalizedStartup = normalizeStartup(currentRow.startup);
    if (normalizedHitAdvantage.kind !== "frames" || normalizedStartup.kind !== "frames") {
      const readableHitAdvantage = normalizedHitAdvantage.kind === "frames" ? String(normalizedHitAdvantage.value) : normalizedHitAdvantage.kind;
      const readableStartup = normalizedStartup.kind === "frames" ? String(normalizedStartup.value) : normalizedStartup.kind;
      results.push({
        index: stepIndex,
        stepId: step.id,
        kind: "warning",
        message: `link cannot be auto-derived (hitAdvantage=${readableHitAdvantage}, startup=${readableStartup}). Keep manual window.`,
      });
      continue;
    }

    const linkWindow = normalizedHitAdvantage.value - (normalizedStartup.value - 1);
    const recommendedOpen = 0;
    const recommendedClose = Math.max(0, linkWindow);
    const currentWindow = readManualWindow(step);

    results.push({
      index: stepIndex,
      stepId: step.id,
      kind: "info",
      message: [
        `prevHitAdv=${normalizedHitAdvantage.value}`,
        `nextStartup=${normalizedStartup.value}`,
        `linkWindow=${linkWindow}`,
        `recommendedWindow=+${recommendedOpen}..+${recommendedClose}`,
        `currentWindow=+${currentWindow.open}..+${currentWindow.close}`,
      ].join(" | "),
    });
  }

  return results;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const [trialFileText, frameDataFileText] = await Promise.all([
    fs.readFile(args.trialPath, "utf8"),
    fs.readFile(args.frameDataPath, "utf8"),
  ]);

  const trial = JSON.parse(trialFileText) as ComboTrial;
  const frameData = JSON.parse(frameDataFileText) as FrameComboData;
  const rowsByIndex = createRowIndex(frameData.rows ?? []);

  const results = analyzeTrial(trial, rowsByIndex);
  if (results.length === 0) {
    console.log("No link timing steps found. Nothing to analyze.");
    return;
  }

  console.log(`Trial: ${trial.id}`);
  for (const result of results) {
    console.log(`[${result.kind}] #${result.index + 1} ${result.stepId}: ${result.message}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[analyze-trial-link-window] failed: ${message}`);
  process.exitCode = 1;
});

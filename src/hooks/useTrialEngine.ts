import { useCallback, useEffect, useRef, useState } from "react";
import { appendInputHistoryEntry, type InputHistoryEntry } from "../domain/input/history";
import type { DirectionMode } from "../domain/input/direction";
import type { InputFrame } from "../domain/input/types";
import { createTrialEngine } from "../domain/trial-engine/createTrialEngine";
import type { TrialEngineSnapshot } from "../domain/trial-engine/core/types";
import type { CompiledTrial } from "../domain/trial/compiled";
import type { TrialMode } from "../domain/trial/schema";

const DEFAULT_INPUT_HISTORY_LIMIT = 24;
const DEFAULT_RAW_FRAME_LOG_LIMIT = 24;

export type UseTrialEngineOptions = {
  trial: CompiledTrial;
  modeOverride?: TrialMode;
  directionMode?: DirectionMode;
  inputHistoryLimit?: number;
  rawFrameLogLimit?: number;
};

export type UseTrialEngineResult = {
  snapshot: TrialEngineSnapshot;
  recentFrames: InputFrame[];
  inputHistory: InputHistoryEntry[];
  advanceFrame: (frame: InputFrame) => TrialEngineSnapshot;
  reset: () => void;
};

function createEngine(trial: CompiledTrial, modeOverride?: TrialMode, directionMode?: DirectionMode) {
  return createTrialEngine(trial, { modeOverride, directionMode });
}

export function useTrialEngine({
  trial,
  modeOverride,
  directionMode,
  inputHistoryLimit = DEFAULT_INPUT_HISTORY_LIMIT,
  rawFrameLogLimit = DEFAULT_RAW_FRAME_LOG_LIMIT,
}: UseTrialEngineOptions): UseTrialEngineResult {
  const engineRef = useRef(createEngine(trial, modeOverride, directionMode));
  const [snapshot, setSnapshot] = useState<TrialEngineSnapshot>(() => engineRef.current.getSnapshot());
  const [recentFrames, setRecentFrames] = useState<InputFrame[]>([]);
  const [inputHistory, setInputHistory] = useState<InputHistoryEntry[]>([]);

  useEffect(() => {
    engineRef.current = createEngine(trial, modeOverride, directionMode);
    setSnapshot(engineRef.current.getSnapshot());
    setRecentFrames([]);
    setInputHistory([]);
  }, [directionMode, modeOverride, trial]);

  const advanceFrame = useCallback(
    (frame: InputFrame): TrialEngineSnapshot => {
      const nextSnapshot = engineRef.current.advance(frame);
      setSnapshot(nextSnapshot);
      setRecentFrames((previous) => {
        const next = [...previous, frame];
        if (next.length > rawFrameLogLimit) {
          next.splice(0, next.length - rawFrameLogLimit);
        }
        return next;
      });
      setInputHistory((previous) => appendInputHistoryEntry(previous, frame, inputHistoryLimit));
      return nextSnapshot;
    },
    [inputHistoryLimit, rawFrameLogLimit],
  );

  const reset = useCallback(() => {
    engineRef.current.reset();
    setSnapshot(engineRef.current.getSnapshot());
    setRecentFrames([]);
    setInputHistory([]);
  }, []);

  return {
    snapshot,
    recentFrames,
    inputHistory,
    advanceFrame,
    reset,
  };
}

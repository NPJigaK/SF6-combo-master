import type { AttackButtonToken, DirectionalInput, InputSample } from "@sf6cm/core";
import type { PracticeInputAdapter, PracticeInputShellState } from "@sf6cm/practice-app";

export interface BrowserGamepadLike {
  index: number;
  mapping: string;
  axes: ArrayLike<number>;
  buttons: ArrayLike<{ pressed: boolean }>;
}

export interface BrowserGamepadSnapshot {
  sourceId: string;
  timestampMs: number;
  mapping: string;
  digitalDirection: DirectionalInput;
  analogDirection: DirectionalInput;
  buttons: AttackButtonToken[];
}

const BUTTON_INDEX_TO_TOKEN: Array<AttackButtonToken | null> = ["LK", "MK", "LP", "MP", "HP", "HK", "PP", "KK"];
const DIRECTION_BUTTON_INDEX = {
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;
const AXIS_THRESHOLD = 0.5;

function createReadyShellState(activeSourceId: string | null): PracticeInputShellState {
  return {
    mode: "ready",
    issues: [],
    activeSourceId,
    interruptionReason: null,
  };
}

function createWarnedShellState(
  issues: PracticeInputShellState["issues"],
  interruptionReason: PracticeInputShellState["interruptionReason"],
): PracticeInputShellState {
  return {
    mode: "warned_non_grading",
    issues,
    activeSourceId: null,
    interruptionReason,
  };
}

export function getBrowserGamepadSourceId(gamepad: Pick<BrowserGamepadLike, "index">): string {
  return `browser:${gamepad.index}`;
}

export function normalizeAnalogDirection([horizontalAxis, verticalAxis]: [number, number]): DirectionalInput {
  return {
    back: horizontalAxis <= -AXIS_THRESHOLD,
    forward: horizontalAxis >= AXIS_THRESHOLD,
    up: verticalAxis <= -AXIS_THRESHOLD,
    down: verticalAxis >= AXIS_THRESHOLD,
  };
}

export function normalizeDigitalDirection(buttons: ArrayLike<{ pressed: boolean }>): DirectionalInput {
  return {
    up: buttons[DIRECTION_BUTTON_INDEX.up]?.pressed ?? false,
    down: buttons[DIRECTION_BUTTON_INDEX.down]?.pressed ?? false,
    back: buttons[DIRECTION_BUTTON_INDEX.left]?.pressed ?? false,
    forward: buttons[DIRECTION_BUTTON_INDEX.right]?.pressed ?? false,
  };
}

export function mergeDirectionalInputs(...inputs: DirectionalInput[]): DirectionalInput {
  return inputs.reduce<DirectionalInput>(
    (merged, current) => ({
      up: merged.up || current.up || false,
      down: merged.down || current.down || false,
      back: merged.back || current.back || false,
      forward: merged.forward || current.forward || false,
      resolvedDirection: merged.resolvedDirection ?? current.resolvedDirection,
    }),
    { up: false, down: false, back: false, forward: false },
  );
}

function mapPressedButtons(buttons: ArrayLike<{ pressed: boolean }>): AttackButtonToken[] {
  return BUTTON_INDEX_TO_TOKEN.flatMap((token, index) => {
    if (!token || !buttons[index]?.pressed) {
      return [];
    }

    return [token];
  });
}

export function captureGamepadSnapshot(gamepad: BrowserGamepadLike, timestampMs = Date.now()): BrowserGamepadSnapshot | null {
  if (gamepad.mapping !== "standard") {
    return null;
  }

  return {
    sourceId: getBrowserGamepadSourceId(gamepad),
    timestampMs,
    mapping: gamepad.mapping,
    digitalDirection: normalizeDigitalDirection(gamepad.buttons),
    analogDirection: normalizeAnalogDirection([(gamepad.axes[0] ?? 0) as number, (gamepad.axes[1] ?? 0) as number]),
    buttons: mapPressedButtons(gamepad.buttons),
  };
}

export function normalizeBrowserGamepadSample(snapshot: BrowserGamepadSnapshot): InputSample {
  return {
    timestampMs: snapshot.timestampMs,
    direction: mergeDirectionalInputs(snapshot.digitalDirection, snapshot.analogDirection),
    buttons: snapshot.buttons,
  };
}

function isNeutralSample(sample: InputSample): boolean {
  const direction = sample.direction;

  return !direction.up && !direction.down && !direction.back && !direction.forward && sample.buttons.length === 0;
}

function createSampleSignature(sample: InputSample): string {
  return JSON.stringify({
    direction: {
      up: sample.direction.up ?? false,
      down: sample.direction.down ?? false,
      back: sample.direction.back ?? false,
      forward: sample.direction.forward ?? false,
    },
    buttons: sample.buttons,
  });
}

function shellStatesEqual(left: PracticeInputShellState, right: PracticeInputShellState): boolean {
  return (
    left.mode === right.mode &&
    left.activeSourceId === right.activeSourceId &&
    left.interruptionReason === right.interruptionReason &&
    left.issues.length === right.issues.length &&
    left.issues.every((issue, index) => issue === right.issues[index])
  );
}

export function createBrowserGamepadAdapter(): PracticeInputAdapter {
  const sampleListeners = new Set<(sample: InputSample) => void>();
  const statusListeners = new Set<(status: PracticeInputShellState) => void>();
  const previousSignaturesBySource = new Map<string, string>();
  let frameId = 0;
  let activeSourceId: string | null = null;
  let lockedSourceId: string | null = null;
  let currentStatus = createReadyShellState(null);

  const notifyStatus = (status: PracticeInputShellState) => {
    if (shellStatesEqual(currentStatus, status)) {
      return;
    }

    currentStatus = status;
    for (const listener of statusListeners) {
      listener(status);
    }
  };

  const stopPollingIfIdle = () => {
    if ((sampleListeners.size > 0 || statusListeners.size > 0) || typeof window === "undefined") {
      return;
    }

    window.cancelAnimationFrame(frameId);
    frameId = 0;
  };

  const poll = () => {
    if (typeof navigator !== "undefined") {
      const gamepads = Array.from(navigator.getGamepads?.() ?? []).filter((candidate): candidate is Gamepad => candidate !== null);
      const connectedSourceIds = new Set(gamepads.map((gamepad) => getBrowserGamepadSourceId(gamepad)));
      const supportedSnapshots = gamepads
        .map((gamepad) => captureGamepadSnapshot(gamepad, typeof performance !== "undefined" ? performance.now() : Date.now()))
        .filter((snapshot): snapshot is BrowserGamepadSnapshot => snapshot !== null);
      const supportedSourceIds = new Set(supportedSnapshots.map((snapshot) => snapshot.sourceId));
      const changedSnapshots: BrowserGamepadSnapshot[] = [];
      let sampleToEmit: InputSample | null = null;

      for (const snapshot of supportedSnapshots) {
        const sample = normalizeBrowserGamepadSample(snapshot);
        const signature = createSampleSignature(sample);
        const previousSignature = previousSignaturesBySource.get(snapshot.sourceId);

        if (previousSignature === undefined) {
          previousSignaturesBySource.set(snapshot.sourceId, signature);
          if (!isNeutralSample(sample)) {
            changedSnapshots.push(snapshot);
          }
          continue;
        }

        if (previousSignature !== signature) {
          previousSignaturesBySource.set(snapshot.sourceId, signature);
          changedSnapshots.push(snapshot);
        }
      }

      for (const sourceId of Array.from(previousSignaturesBySource.keys())) {
        if (!connectedSourceIds.has(sourceId)) {
          previousSignaturesBySource.delete(sourceId);
        }
      }

      if (lockedSourceId && !supportedSourceIds.has(lockedSourceId)) {
        notifyStatus(createWarnedShellState([], "source_disconnected"));
      } else if (lockedSourceId) {
        activeSourceId = lockedSourceId;
        notifyStatus(createReadyShellState(lockedSourceId));

        const lockedSnapshot = changedSnapshots.find((snapshot) => snapshot.sourceId === lockedSourceId);
        if (lockedSnapshot) {
          sampleToEmit = normalizeBrowserGamepadSample(lockedSnapshot);
        }
      } else {
        if (changedSnapshots.length > 0) {
          activeSourceId = changedSnapshots.at(-1)?.sourceId ?? activeSourceId;
        }

        if (activeSourceId && !supportedSourceIds.has(activeSourceId)) {
          activeSourceId = null;
        }

        if (gamepads.length > 0 && supportedSnapshots.length === 0) {
          notifyStatus(createWarnedShellState(["web.standard_mapping_required"], null));
        } else {
          notifyStatus(createReadyShellState(activeSourceId));
        }

        if (activeSourceId) {
          const activeSnapshot = changedSnapshots.find((snapshot) => snapshot.sourceId === activeSourceId);
          if (activeSnapshot) {
            sampleToEmit = normalizeBrowserGamepadSample(activeSnapshot);
          }
        }
      }

      if (sampleToEmit) {
        for (const listener of sampleListeners) {
          listener(sampleToEmit);
        }
      }
    }

    if (sampleListeners.size > 0 || statusListeners.size > 0) {
      frameId = typeof window !== "undefined" ? window.requestAnimationFrame(poll) : 0;
    }
  };

  return {
    subscribe(listener) {
      sampleListeners.add(listener);

      if (frameId === 0 && typeof window !== "undefined") {
        frameId = window.requestAnimationFrame(poll);
      }

      return () => {
        sampleListeners.delete(listener);
        stopPollingIfIdle();
      };
    },
    subscribeStatus(listener) {
      statusListeners.add(listener);

      if (frameId === 0 && typeof window !== "undefined") {
        frameId = window.requestAnimationFrame(poll);
      }

      return () => {
        statusListeners.delete(listener);
        stopPollingIfIdle();
      };
    },
    getStatus() {
      return currentStatus;
    },
    setActiveSourceLock(sourceId) {
      lockedSourceId = sourceId;
    },
  };
}

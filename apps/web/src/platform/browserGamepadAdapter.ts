import type { AttackButtonToken, DirectionalInput, InputSample } from "@sf6cm/core";
import type { PracticeInputAdapter } from "@sf6cm/practice-app";

export interface BrowserGamepadSnapshot {
  timestampMs: number;
  mapping: string;
  axes: [number, number];
  buttons: AttackButtonToken[];
}

const BUTTON_INDEX_TO_TOKEN: Array<AttackButtonToken | null> = ["LK", "MK", "LP", "MP", "HP", "HK", "PP", "KK"];
const AXIS_THRESHOLD = 0.5;

function normalizeAxisDirection([horizontalAxis, verticalAxis]: [number, number]): DirectionalInput {
  return {
    back: horizontalAxis <= -AXIS_THRESHOLD,
    forward: horizontalAxis >= AXIS_THRESHOLD,
    up: verticalAxis <= -AXIS_THRESHOLD,
    down: verticalAxis >= AXIS_THRESHOLD,
  };
}

function mapPressedButtons(buttons: GamepadButton[]): AttackButtonToken[] {
  return BUTTON_INDEX_TO_TOKEN.flatMap((token, index) => {
    if (!token || !buttons[index]?.pressed) {
      return [];
    }

    return [token];
  });
}

function captureGamepadSnapshot(gamepad: Gamepad): BrowserGamepadSnapshot | null {
  if (gamepad.mapping !== "standard") {
    return null;
  }

  return {
    timestampMs: performance.now(),
    mapping: gamepad.mapping,
    axes: [(gamepad.axes[0] ?? 0) as number, (gamepad.axes[1] ?? 0) as number],
    buttons: mapPressedButtons(Array.from(gamepad.buttons)),
  };
}

export function normalizeBrowserGamepadSample(snapshot: BrowserGamepadSnapshot): InputSample {
  return {
    timestampMs: snapshot.timestampMs,
    direction: normalizeAxisDirection(snapshot.axes),
    buttons: snapshot.buttons,
  };
}

export function createBrowserGamepadAdapter(): PracticeInputAdapter {
  const listeners = new Set<(sample: InputSample) => void>();
  let frameId = 0;
  let previousSignature = "";

  const poll = () => {
    if (typeof navigator !== "undefined") {
      const activeGamepad = Array.from(navigator.getGamepads?.() ?? []).find(
        (candidate): candidate is Gamepad => candidate !== null && candidate.mapping === "standard",
      );

      if (activeGamepad) {
        const snapshot = captureGamepadSnapshot(activeGamepad);
        if (snapshot) {
          const sample = normalizeBrowserGamepadSample(snapshot);
          const signature = JSON.stringify(sample);

          if (signature !== previousSignature) {
            previousSignature = signature;

            for (const listener of listeners) {
              listener(sample);
            }
          }
        }
      }
    }

    if (listeners.size > 0 && typeof window !== "undefined") {
      frameId = window.requestAnimationFrame(poll);
    }
  };

  return {
    subscribe(listener) {
      listeners.add(listener);

      if (listeners.size === 1 && typeof window !== "undefined") {
        frameId = window.requestAnimationFrame(poll);
      }

      return () => {
        listeners.delete(listener);

        if (listeners.size === 0 && typeof window !== "undefined") {
          window.cancelAnimationFrame(frameId);
          frameId = 0;
          previousSignature = "";
        }
      };
    },
  };
}

import { afterEach, describe, expect, it, vi } from "vitest";
import type { PracticeInputShellState } from "@sf6cm/practice-app";

import {
  captureGamepadSnapshot,
  createBrowserGamepadAdapter,
  normalizeBrowserGamepadSample,
} from "../../../apps/web/src/platform/browserGamepadAdapter";

function createButtons(pressedIndexes: number[] = []): Array<{ pressed: boolean }> {
  return Array.from({ length: 16 }, (_, index) => ({
    pressed: pressedIndexes.includes(index),
  }));
}

describe("platform shell conformance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("captures digital directional input from a standard-mapped gamepad", () => {
    const snapshot = captureGamepadSnapshot(
      {
        index: 0,
        mapping: "standard",
        axes: [0, 0],
        buttons: createButtons([13, 15]),
      },
      16.7,
    );

    expect(snapshot).not.toBeNull();
    expect(normalizeBrowserGamepadSample(snapshot!)).toEqual({
      timestampMs: 16.7,
      direction: {
        up: false,
        down: true,
        back: false,
        forward: true,
        resolvedDirection: undefined,
      },
      buttons: [],
    });
  });

  it("captures primary analog directional input with the shared half-axis threshold", () => {
    const snapshot = captureGamepadSnapshot(
      {
        index: 0,
        mapping: "standard",
        axes: [0.5, -0.5],
        buttons: createButtons(),
      },
      33.4,
    );

    expect(snapshot).not.toBeNull();
    expect(normalizeBrowserGamepadSample(snapshot!)).toEqual({
      timestampMs: 33.4,
      direction: {
        up: true,
        down: false,
        back: false,
        forward: true,
        resolvedDirection: undefined,
      },
      buttons: [],
    });
  });

  it("merges digital and primary analog direction without priority", () => {
    const snapshot = captureGamepadSnapshot(
      {
        index: 0,
        mapping: "standard",
        axes: [1, 0],
        buttons: createButtons([14]),
      },
      50.1,
    );

    expect(snapshot).not.toBeNull();
    expect(normalizeBrowserGamepadSample(snapshot!)).toEqual({
      timestampMs: 50.1,
      direction: {
        up: false,
        down: false,
        back: true,
        forward: true,
        resolvedDirection: undefined,
      },
      buttons: [],
    });
  });

  it("warns on unsupported mapping and only switches active source when a supported device changes canonically", () => {
    let gamepads = [
      {
        index: 0,
        mapping: "xinput",
        axes: [0, 0],
        buttons: createButtons(),
      },
    ];
    const frameCallbacks: Array<(timestamp: number) => void> = [];
    const statusHistory: PracticeInputShellState[] = [];
    const samples = [];

    vi.stubGlobal("window", {
      requestAnimationFrame(callback: (timestamp: number) => void) {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      },
      cancelAnimationFrame() {},
    });
    vi.stubGlobal("navigator", {
      getGamepads: () => gamepads,
    });

    const adapter = createBrowserGamepadAdapter();
    const unsubscribeStatus = adapter.subscribeStatus((status) => {
      statusHistory.push(status);
    });
    const unsubscribeSample = adapter.subscribe((sample) => {
      samples.push(sample);
    });
    const tick = () => {
      const callback = frameCallbacks.shift();

      if (!callback) {
        throw new Error("Missing scheduled browser poll.");
      }

      callback(0);
    };

    tick();
    expect(adapter.getStatus()).toEqual({
      mode: "warned_non_grading",
      issues: ["web.standard_mapping_required"],
      activeSourceId: null,
      interruptionReason: null,
    });
    expect(samples).toHaveLength(0);

    gamepads = [
      {
        index: 0,
        mapping: "standard",
        axes: [0, 0],
        buttons: createButtons(),
      },
      {
        index: 1,
        mapping: "standard",
        axes: [0, 0],
        buttons: createButtons(),
      },
    ];
    tick();
    expect(adapter.getStatus()).toEqual({
      mode: "ready",
      issues: [],
      activeSourceId: null,
      interruptionReason: null,
    });

    gamepads = [
      {
        index: 0,
        mapping: "standard",
        axes: [0, 1],
        buttons: createButtons(),
      },
      {
        index: 1,
        mapping: "standard",
        axes: [0, 0],
        buttons: createButtons(),
      },
    ];
    tick();
    expect(adapter.getStatus().activeSourceId).toBe("browser:0");
    expect(samples).toHaveLength(1);

    tick();
    expect(adapter.getStatus().activeSourceId).toBe("browser:0");
    expect(samples).toHaveLength(1);

    gamepads = [
      {
        index: 0,
        mapping: "standard",
        axes: [0, 1],
        buttons: createButtons(),
      },
      {
        index: 1,
        mapping: "standard",
        axes: [1, 0],
        buttons: createButtons(),
      },
    ];
    tick();
    expect(adapter.getStatus().activeSourceId).toBe("browser:1");
    expect(samples).toHaveLength(2);
    expect(statusHistory.at(-1)?.activeSourceId).toBe("browser:1");

    unsubscribeSample();
    unsubscribeStatus();
  });
});

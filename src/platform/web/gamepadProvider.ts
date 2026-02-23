import { buildInputFrame } from "../../domain/input/frame";
import type { CanonicalButton, Direction, InputFrame, InputProvider, InputSnapshot } from "../../domain/input/types";

const FRAME_DURATION_MS = 1000 / 60;
const STICK_DEADZONE = 0.5;
const TRIGGER_THRESHOLD = 0.5;

function toDirection(horizontal: -1 | 0 | 1, vertical: -1 | 0 | 1): Direction {
  if (horizontal === 0 && vertical === 0) {
    return 5;
  }
  if (horizontal === 1 && vertical === 0) {
    return 6;
  }
  if (horizontal === -1 && vertical === 0) {
    return 4;
  }
  if (horizontal === 0 && vertical === 1) {
    return 8;
  }
  if (horizontal === 0 && vertical === -1) {
    return 2;
  }
  if (horizontal === 1 && vertical === 1) {
    return 9;
  }
  if (horizontal === -1 && vertical === 1) {
    return 7;
  }
  if (horizontal === 1 && vertical === -1) {
    return 3;
  }
  return 1;
}

function getPrimaryGamepad(): Gamepad | null {
  const gamepads = navigator.getGamepads?.() ?? [];
  for (const gamepad of gamepads) {
    if (gamepad && gamepad.connected) {
      return gamepad;
    }
  }
  return null;
}

function isButtonDown(gamepad: Gamepad, index: number, threshold = TRIGGER_THRESHOLD): boolean {
  const button = gamepad.buttons[index];
  if (!button) {
    return false;
  }
  return button.pressed || button.value >= threshold;
}

function readSnapshot(timestampMs: number): InputSnapshot {
  const gamepad = getPrimaryGamepad();
  if (!gamepad) {
    return {
      timestampMs,
      direction: 5,
      down: [],
    };
  }

  const dpadUp = isButtonDown(gamepad, 12, 0.5);
  const dpadDown = isButtonDown(gamepad, 13, 0.5);
  const dpadLeft = isButtonDown(gamepad, 14, 0.5);
  const dpadRight = isButtonDown(gamepad, 15, 0.5);

  const stickHorizontal = gamepad.axes[0] ?? 0;
  const stickVertical = gamepad.axes[1] ?? 0;

  const horizontal = dpadRight
    ? 1
    : dpadLeft
      ? -1
      : stickHorizontal > STICK_DEADZONE
        ? 1
        : stickHorizontal < -STICK_DEADZONE
          ? -1
          : 0;

  const vertical = dpadUp ? 1 : dpadDown ? -1 : stickVertical < -STICK_DEADZONE ? 1 : stickVertical > STICK_DEADZONE ? -1 : 0;

  const downButtons: CanonicalButton[] = [];
  const a = isButtonDown(gamepad, 0);
  const b = isButtonDown(gamepad, 1);
  const x = isButtonDown(gamepad, 2);
  const y = isButtonDown(gamepad, 3);
  const leftShoulder = isButtonDown(gamepad, 4);
  const rightShoulder = isButtonDown(gamepad, 5);
  const leftTrigger = isButtonDown(gamepad, 6);
  const rightTrigger = isButtonDown(gamepad, 7);

  if (x) {
    downButtons.push("LP");
  }
  if (y) {
    downButtons.push("MP");
  }
  if (rightShoulder) {
    downButtons.push("HP");
  }
  if (a) {
    downButtons.push("LK");
  }
  if (b) {
    downButtons.push("MK");
  }
  if (rightTrigger) {
    downButtons.push("HK");
  }
  if (leftShoulder && rightShoulder) {
    downButtons.push("DI");
  }
  if (leftTrigger) {
    downButtons.push("PARry");
  }

  return {
    timestampMs,
    direction: toDirection(horizontal, vertical),
    down: downButtons,
  };
}

export class WebGamepadProvider implements InputProvider {
  public readonly kind = "web-gamepad" as const;

  private running = false;
  private subscribers = new Set<(frame: InputFrame) => void>();
  private rafId: number | null = null;
  private previousTimestamp = 0;
  private accumulatedMs = 0;
  private frameCounter = 0;
  private previousFrame: InputFrame | null = null;

  public async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    this.previousTimestamp = 0;
    this.accumulatedMs = 0;
    this.frameCounter = 0;
    this.previousFrame = null;

    const loop = (timestampMs: number): void => {
      if (!this.running) {
        return;
      }

      if (this.previousTimestamp === 0) {
        this.previousTimestamp = timestampMs;
      }

      this.accumulatedMs += timestampMs - this.previousTimestamp;
      this.previousTimestamp = timestampMs;

      while (this.accumulatedMs >= FRAME_DURATION_MS) {
        const sampleTimestamp = timestampMs - this.accumulatedMs + FRAME_DURATION_MS;
        const snapshot = readSnapshot(sampleTimestamp);
        const frame = buildInputFrame(this.frameCounter, snapshot, this.previousFrame);

        this.previousFrame = frame;
        this.frameCounter += 1;
        this.accumulatedMs -= FRAME_DURATION_MS;

        for (const callback of this.subscribers) {
          callback(frame);
        }
      }

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public subscribe(cb: (frame: InputFrame) => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }
}


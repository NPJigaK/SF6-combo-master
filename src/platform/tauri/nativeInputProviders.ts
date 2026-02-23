import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { mapPhysicalButtonsToCanonical } from "../../domain/input/buttonMapping";
import { buildInputFrame } from "../../domain/input/frame";
import {
  type ButtonBindings,
  type Direction,
  type InputFrame,
  type InputProvider,
  type InputProviderKind,
  type InputSnapshot,
  isPhysicalButton,
} from "../../domain/input/types";
import { WebGamepadProvider } from "../web/gamepadProvider";

type NativeInputMode = "xinput" | "hid";

type NativeInputDetectResult = {
  xinput: boolean;
  hid: boolean;
};

type NativeInputFramePayload = {
  frame: number;
  timestamp_ms: number;
  direction: number;
  physical_down: string[];
};

function toDirection(value: number): Direction {
  if (Number.isInteger(value) && value >= 1 && value <= 9) {
    return value as Direction;
  }
  return 5;
}

function toInputSnapshot(payload: NativeInputFramePayload, bindings: ButtonBindings): InputSnapshot {
  const physicalDown = payload.physical_down.filter(isPhysicalButton);
  return {
    timestampMs: payload.timestamp_ms,
    direction: toDirection(payload.direction),
    physicalDown,
    down: mapPhysicalButtonsToCanonical(physicalDown, bindings),
  };
}

function toInputFrame(
  payload: NativeInputFramePayload,
  previousFrame: InputFrame | null,
  bindings: ButtonBindings,
): InputFrame {
  return buildInputFrame(payload.frame, toInputSnapshot(payload, bindings), previousFrame);
}

abstract class TauriNativeModeProvider implements InputProvider {
  private readonly getButtonBindings: () => ButtonBindings;
  private readonly subscribers = new Set<(frame: InputFrame) => void>();
  private running = false;
  private unlisten: UnlistenFn | null = null;
  private previousFrame: InputFrame | null = null;

  protected abstract readonly nativeMode: NativeInputMode;
  protected abstract readonly providerKind: InputProviderKind;

  protected constructor(getButtonBindings: () => ButtonBindings) {
    this.getButtonBindings = getButtonBindings;
  }

  public get kind(): InputProviderKind {
    return this.providerKind;
  }

  public async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.previousFrame = null;
    this.unlisten = await listen<NativeInputFramePayload>("input/frame", (event) => {
      const frame = toInputFrame(event.payload, this.previousFrame, this.getButtonBindings());
      this.previousFrame = frame;
      for (const callback of this.subscribers) {
        callback(frame);
      }
    });

    try {
      await invoke("input_start", { mode: this.nativeMode });
      this.running = true;
    } catch (error) {
      if (this.unlisten) {
        const unlisten = this.unlisten;
        this.unlisten = null;
        await unlisten();
      }
      this.previousFrame = null;
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;
    await invoke("input_stop");

    if (this.unlisten) {
      const unlisten = this.unlisten;
      this.unlisten = null;
      await unlisten();
    }

    this.previousFrame = null;
  }

  public subscribe(cb: (frame: InputFrame) => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }
}

export class TauriNativeXInputProvider extends TauriNativeModeProvider {
  public constructor(getButtonBindings: () => ButtonBindings) {
    super(getButtonBindings);
  }

  protected readonly nativeMode = "xinput" as const;
  protected readonly providerKind = "tauri-native-xinput" as const;
}

export class TauriNativeHidProvider extends TauriNativeModeProvider {
  public constructor(getButtonBindings: () => ButtonBindings) {
    super(getButtonBindings);
  }

  protected readonly nativeMode = "hid" as const;
  protected readonly providerKind = "tauri-native-hid" as const;
}

export class TauriNativeAutoProvider implements InputProvider {
  private readonly getButtonBindings: () => ButtonBindings;
  private readonly subscribers = new Set<(frame: InputFrame) => void>();
  private running = false;
  private delegate: InputProvider | null = null;
  private unbindDelegate: (() => void) | null = null;

  public constructor(getButtonBindings: () => ButtonBindings) {
    this.getButtonBindings = getButtonBindings;
  }

  public get kind(): InputProviderKind {
    return this.delegate?.kind ?? "web-gamepad";
  }

  public async start(): Promise<void> {
    if (this.running) {
      return;
    }

    const detectResult = await invoke<NativeInputDetectResult>("input_detect");
    const delegate = detectResult.xinput
      ? new TauriNativeXInputProvider(this.getButtonBindings)
      : detectResult.hid
        ? new TauriNativeHidProvider(this.getButtonBindings)
        : new WebGamepadProvider(this.getButtonBindings);

    const unbindDelegate = delegate.subscribe((frame) => {
      for (const callback of this.subscribers) {
        callback(frame);
      }
    });

    try {
      await delegate.start();
      this.delegate = delegate;
      this.unbindDelegate = unbindDelegate;
      this.running = true;
    } catch (error) {
      unbindDelegate();
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.running || !this.delegate) {
      return;
    }

    this.running = false;

    try {
      await this.delegate.stop();
    } finally {
      if (this.unbindDelegate) {
        this.unbindDelegate();
        this.unbindDelegate = null;
      }
      this.delegate = null;
    }
  }

  public subscribe(cb: (frame: InputFrame) => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }
}

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { buildInputFrame } from "../../domain/input/frame";
import {
  isCanonicalButton,
  type Direction,
  type InputFrame,
  type InputProvider,
  type InputProviderKind,
  type InputSnapshot,
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
  down: string[];
};

function toDirection(value: number): Direction {
  if (Number.isInteger(value) && value >= 1 && value <= 9) {
    return value as Direction;
  }
  return 5;
}

function toInputSnapshot(payload: NativeInputFramePayload): InputSnapshot {
  return {
    timestampMs: payload.timestamp_ms,
    direction: toDirection(payload.direction),
    down: payload.down.filter(isCanonicalButton),
  };
}

function toInputFrame(payload: NativeInputFramePayload, previousFrame: InputFrame | null): InputFrame {
  return buildInputFrame(payload.frame, toInputSnapshot(payload), previousFrame);
}

abstract class TauriNativeModeProvider implements InputProvider {
  private readonly subscribers = new Set<(frame: InputFrame) => void>();
  private running = false;
  private unlisten: UnlistenFn | null = null;
  private previousFrame: InputFrame | null = null;

  protected abstract readonly nativeMode: NativeInputMode;
  protected abstract readonly providerKind: InputProviderKind;

  public get kind(): InputProviderKind {
    return this.providerKind;
  }

  public async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.previousFrame = null;
    this.unlisten = await listen<NativeInputFramePayload>("input/frame", (event) => {
      const frame = toInputFrame(event.payload, this.previousFrame);
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
  protected readonly nativeMode = "xinput" as const;
  protected readonly providerKind = "tauri-native-xinput" as const;
}

export class TauriNativeHidProvider extends TauriNativeModeProvider {
  protected readonly nativeMode = "hid" as const;
  protected readonly providerKind = "tauri-native-hid" as const;
}

export class TauriNativeAutoProvider implements InputProvider {
  private readonly subscribers = new Set<(frame: InputFrame) => void>();
  private running = false;
  private delegate: InputProvider | null = null;
  private unbindDelegate: (() => void) | null = null;

  public get kind(): InputProviderKind {
    return this.delegate?.kind ?? "web-gamepad";
  }

  public async start(): Promise<void> {
    if (this.running) {
      return;
    }

    const detectResult = await invoke<NativeInputDetectResult>("input_detect");
    const delegate = detectResult.xinput
      ? new TauriNativeXInputProvider()
      : detectResult.hid
        ? new TauriNativeHidProvider()
        : new WebGamepadProvider();

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

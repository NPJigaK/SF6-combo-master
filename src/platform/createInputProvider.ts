import type { InputMode, InputProvider } from "../domain/input/types";
import { TauriNativeAutoProvider, TauriNativeHidProvider, TauriNativeXInputProvider } from "./tauri/nativeInputProviders";
import { WebGamepadProvider } from "./web/gamepadProvider";

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return "__TAURI_INTERNALS__" in window;
}

export function createInputProvider(mode: InputMode): InputProvider {
  if (!isTauriRuntime()) {
    return new WebGamepadProvider();
  }

  switch (mode) {
    case "xinput":
      return new TauriNativeXInputProvider();
    case "hid":
      return new TauriNativeHidProvider();
    case "web":
      return new WebGamepadProvider();
    case "auto":
    default:
      return new TauriNativeAutoProvider();
  }
}


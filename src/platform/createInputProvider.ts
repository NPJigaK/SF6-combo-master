import { createDefaultButtonBindings } from "../domain/input/buttonMapping";
import type { ButtonBindings, InputMode, InputProvider } from "../domain/input/types";
import { TauriNativeAutoProvider, TauriNativeHidProvider, TauriNativeXInputProvider } from "./tauri/nativeInputProviders";
import { WebGamepadProvider } from "./web/gamepadProvider";

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return "__TAURI_INTERNALS__" in window;
}

export function createInputProvider(mode: InputMode, getButtonBindings?: () => ButtonBindings): InputProvider {
  const resolveBindings = getButtonBindings ?? (() => createDefaultButtonBindings());

  if (!isTauriRuntime()) {
    return new WebGamepadProvider(resolveBindings);
  }

  switch (mode) {
    case "xinput":
      return new TauriNativeXInputProvider(resolveBindings);
    case "hid":
      return new TauriNativeHidProvider(resolveBindings);
    case "web":
      return new WebGamepadProvider(resolveBindings);
    case "auto":
    default:
      return new TauriNativeAutoProvider(resolveBindings);
  }
}


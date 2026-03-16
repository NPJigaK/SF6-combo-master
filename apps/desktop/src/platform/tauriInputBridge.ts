import type { DirectionalInput, InputSample, AttackButtonToken } from "@sf6cm/core";
import type { PracticeInputAdapter } from "@sf6cm/practice-app";

export interface DesktopInputBridgeEvent {
  timestampMs: number;
  direction: DirectionalInput;
  buttons: AttackButtonToken[];
}

export function normalizeDesktopInputEvent(event: DesktopInputBridgeEvent): InputSample {
  return {
    timestampMs: event.timestampMs,
    direction: {
      up: event.direction.up ?? false,
      down: event.direction.down ?? false,
      back: event.direction.back ?? false,
      forward: event.direction.forward ?? false,
      resolvedDirection: event.direction.resolvedDirection,
    },
    buttons: event.buttons,
  };
}

export function createTauriInputBridge(): PracticeInputAdapter {
  const listeners = new Set<(sample: InputSample) => void>();
  let unlistenPromise: Promise<(() => void) | null> | null = null;

  return {
    subscribe(listener) {
      listeners.add(listener);

      if (listeners.size === 1 && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        unlistenPromise = import("@tauri-apps/api/event")
          .then(async ({ listen }) => {
            return listen<DesktopInputBridgeEvent>("sf6cm://input-sample", (event) => {
              const sample = normalizeDesktopInputEvent(event.payload);

              for (const currentListener of listeners) {
                currentListener(sample);
              }
            });
          })
          .catch(() => null);
      }

      return () => {
        listeners.delete(listener);

        if (listeners.size === 0 && unlistenPromise) {
          void unlistenPromise.then((unlisten) => {
            unlisten?.();
          });
          unlistenPromise = null;
        }
      };
    },
  };
}

import type { AttackButtonToken, DirectionalInput, InputSample } from "@sf6cm/core";
import type { PracticeInputAdapter, PracticeInputShellState, SupportIssueKey } from "@sf6cm/practice-app";

export interface DesktopInputBridgeEvent {
  sourceId: string;
  timestampMs: number;
  direction: DirectionalInput;
  buttons: AttackButtonToken[];
}

interface DesktopInputStatusEvent {
  mode: "ready" | "warned_non_grading";
  issues: SupportIssueKey[];
  activeSourceId: string | null;
  connectedSourceIds: string[];
}

function createShellState(
  mode: PracticeInputShellState["mode"],
  issues: SupportIssueKey[],
  activeSourceId: string | null,
  interruptionReason: PracticeInputShellState["interruptionReason"],
): PracticeInputShellState {
  return {
    mode,
    issues,
    activeSourceId,
    interruptionReason,
  };
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
  const sampleListeners = new Set<(sample: InputSample) => void>();
  const statusListeners = new Set<(status: PracticeInputShellState) => void>();
  let lockedSourceId: string | null = null;
  let backendStatus: DesktopInputStatusEvent = {
    mode: "warned_non_grading",
    issues: ["desktop.unsupported_device"],
    activeSourceId: null,
    connectedSourceIds: [],
  };
  let currentStatus = createShellState("warned_non_grading", ["desktop.unsupported_device"], null, null);
  let unlistenPromise: Promise<(() => void)[] | null> | null = null;

  const getEffectiveStatus = (): PracticeInputShellState => {
    if (lockedSourceId) {
      if (backendStatus.connectedSourceIds.includes(lockedSourceId)) {
        return createShellState("ready", [], lockedSourceId, null);
      }

      return createShellState("warned_non_grading", backendStatus.issues, null, "source_disconnected");
    }

    return createShellState(backendStatus.mode, backendStatus.issues, backendStatus.activeSourceId, null);
  };

  const publishStatus = () => {
    const nextStatus = getEffectiveStatus();

    if (shellStatesEqual(currentStatus, nextStatus)) {
      return;
    }

    currentStatus = nextStatus;
    for (const listener of statusListeners) {
      listener(nextStatus);
    }
  };

  const ensureListening = () => {
    if (unlistenPromise || typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }

    unlistenPromise = import("@tauri-apps/api/event")
      .then(async ({ listen }) => {
        const unlistenSample = await listen<DesktopInputBridgeEvent>("sf6cm://input-sample", (event) => {
          const effectiveStatus = getEffectiveStatus();
          const allowedSourceId = effectiveStatus.mode === "ready" ? effectiveStatus.activeSourceId : null;

          if (!allowedSourceId || event.payload.sourceId !== allowedSourceId) {
            return;
          }

          const sample = normalizeDesktopInputEvent(event.payload);
          for (const listener of sampleListeners) {
            listener(sample);
          }
        });
        const unlistenStatus = await listen<DesktopInputStatusEvent>("sf6cm://input-status", (event) => {
          backendStatus = event.payload;
          publishStatus();
        });

        return [unlistenSample, unlistenStatus];
      })
      .catch(() => null);
  };

  const stopListeningIfIdle = () => {
    if (sampleListeners.size > 0 || statusListeners.size > 0 || !unlistenPromise) {
      return;
    }

    void unlistenPromise.then((unlisten) => {
      for (const dispose of unlisten ?? []) {
        dispose();
      }
    });
    unlistenPromise = null;
  };

  return {
    subscribe(listener) {
      sampleListeners.add(listener);
      ensureListening();

      return () => {
        sampleListeners.delete(listener);
        stopListeningIfIdle();
      };
    },
    subscribeStatus(listener) {
      statusListeners.add(listener);
      ensureListening();

      return () => {
        statusListeners.delete(listener);
        stopListeningIfIdle();
      };
    },
    getStatus() {
      return currentStatus;
    },
    setActiveSourceLock(sourceId) {
      lockedSourceId = sourceId;
      publishStatus();
    },
  };
}

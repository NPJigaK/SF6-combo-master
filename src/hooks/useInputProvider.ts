import { useEffect, useRef, useState } from "react";
import type { ButtonBindings, InputFrame, InputMode, InputProviderKind } from "../domain/input/types";
import { createInputProvider } from "../platform/createInputProvider";

export type UseInputProviderOptions = {
  inputMode: InputMode;
  getButtonBindings: () => ButtonBindings;
  onFrame: (frame: InputFrame) => void;
};

export type UseInputProviderResult = {
  providerKind: InputProviderKind;
  providerLoading: boolean;
  providerError: string | null;
};

export function useInputProvider({ inputMode, getButtonBindings, onFrame }: UseInputProviderOptions): UseInputProviderResult {
  const [providerKind, setProviderKind] = useState<InputProviderKind>("web-gamepad");
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const getButtonBindingsRef = useRef(getButtonBindings);
  const onFrameRef = useRef(onFrame);

  useEffect(() => {
    getButtonBindingsRef.current = getButtonBindings;
  }, [getButtonBindings]);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    const provider = createInputProvider(inputMode, () => getButtonBindingsRef.current());
    setProviderKind(provider.kind);
    setProviderError(null);
    setProviderLoading(true);

    let mounted = true;
    let rafId: number | null = null;
    let startPromise: Promise<void> | null = null;
    const unsubscribe = provider.subscribe((frame) => {
      if (!mounted) {
        return;
      }
      onFrameRef.current(frame);
    });

    const startProvider = async () => {
      try {
        await provider.start();
        if (!mounted) {
          await provider.stop().catch(() => undefined);
          return;
        }
        setProviderKind(provider.kind);
      } catch (error) {
        if (mounted) {
          const message = error instanceof Error ? error.message : String(error);
          setProviderError(message);
        }
      } finally {
        if (mounted) {
          setProviderLoading(false);
        }
      }
    };

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        startPromise = startProvider();
      });
    } else {
      startPromise = startProvider();
    }

    return () => {
      mounted = false;
      if (typeof window !== "undefined" && rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      unsubscribe();
      void (async () => {
        if (startPromise) {
          await startPromise.catch(() => undefined);
        }
        await provider.stop().catch(() => undefined);
      })();
    };
  }, [inputMode]);

  return {
    providerKind,
    providerLoading,
    providerError,
  };
}

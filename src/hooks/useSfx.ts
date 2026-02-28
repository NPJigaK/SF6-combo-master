import { useCallback, useEffect, useRef } from "react";

export type SfxTone = {
  wave: OscillatorType;
  frequency: number;
  endFrequency?: number;
  delaySec: number;
  durationSec: number;
  gain: number;
};

type LegacyAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function scheduleTone(context: AudioContext, baseTime: number, tone: SfxTone): void {
  const startAt = baseTime + tone.delaySec;
  const endAt = startAt + tone.durationSec;
  const attackAt = startAt + Math.min(0.02, tone.durationSec * 0.5);

  const oscillator = context.createOscillator();
  oscillator.type = tone.wave;
  oscillator.frequency.setValueAtTime(tone.frequency, startAt);
  if (tone.endFrequency !== undefined) {
    oscillator.frequency.linearRampToValueAtTime(tone.endFrequency, endAt);
  }

  const gain = context.createGain();
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(tone.gain, attackAt);
  gain.gain.linearRampToValueAtTime(0, endAt);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(endAt + 0.01);
}

export function useSfx() {
  const contextRef = useRef<AudioContext | null>(null);

  const getSfxContext = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") {
      return null;
    }

    const browserWindow = window as LegacyAudioWindow;
    const AudioContextCtor = window.AudioContext ?? browserWindow.webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }

    if (!contextRef.current) {
      contextRef.current = new AudioContextCtor();
    }

    return contextRef.current;
  }, []);

  const playToneSequence = useCallback(
    (tones: SfxTone[]): void => {
      const context = getSfxContext();
      if (!context) {
        return;
      }

      const schedule = () => {
        const baseTime = context.currentTime + 0.01;
        for (const tone of tones) {
          scheduleTone(context, baseTime, tone);
        }
      };

      if (context.state === "suspended") {
        void context
          .resume()
          .then(() => {
            schedule();
          })
          .catch(() => undefined);
        return;
      }

      schedule();
    },
    [getSfxContext],
  );

  const playSuccess = useCallback(() => {
    playToneSequence([
      { wave: "triangle", frequency: 880, delaySec: 0, durationSec: 0.09, gain: 0.08 },
      { wave: "sine", frequency: 1320, delaySec: 0.08, durationSec: 0.15, gain: 0.1 },
    ]);
  }, [playToneSequence]);

  useEffect(() => {
    return () => {
      const context = contextRef.current;
      if (!context) {
        return;
      }
      contextRef.current = null;
      void context.close().catch(() => undefined);
    };
  }, []);

  return {
    playToneSequence,
    playSuccess,
  };
}

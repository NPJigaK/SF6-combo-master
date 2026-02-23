import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { appendInputHistoryEntry, toDisplayHoldFrames, type InputHistoryEntry } from "../domain/input/history";
import type { CanonicalButton, InputFrame, InputMode, InputProvider } from "../domain/input/types";
import { TrialJudge, type TrialJudgeSnapshot } from "../domain/trial/judge";
import type { ComboTrial, TrialStep } from "../domain/trial/schema";
import { createInputProvider } from "../platform/createInputProvider";

const INPUT_HISTORY_LIMIT = 24;
const RAW_FRAME_LOG_LIMIT = 24;
const INPUT_MODE_STORAGE_KEY = "sf6_input_mode";
const DIRECTION_DISPLAY_MODE_STORAGE_KEY = "sf6_direction_display_mode";
const DOWN_DISPLAY_MODE_STORAGE_KEY = "sf6_down_display_mode";
const INPUT_MODES: InputMode[] = ["auto", "xinput", "hid", "web"];
const DIRECTION_DISPLAY_MODES = ["number", "arrow"] as const;
const DOWN_DISPLAY_MODES = ["text", "icon"] as const;
const BUTTON_SEPARATOR_ICON_SRC = "/assets/controller/key-plus.png";

const BUTTON_ICON_BY_NAME: Partial<Record<CanonicalButton, string>> = {
  LP: "/assets/controller/icon_punch_l.png",
  MP: "/assets/controller/icon_punch_m.png",
  HP: "/assets/controller/icon_punch_h.png",
  LK: "/assets/controller/icon_kick_l.png",
  MK: "/assets/controller/icon_kick_m.png",
  HK: "/assets/controller/icon_kick_h.png",
};

type DirectionDisplayMode = (typeof DIRECTION_DISPLAY_MODES)[number];
type DownDisplayMode = (typeof DOWN_DISPLAY_MODES)[number];

type DirectionIconSpec = {
  src: string;
  alt: string;
  rotateDeg?: number;
};

function toDirectionIconSpec(direction: number): DirectionIconSpec | null {
  switch (direction) {
    case 1:
      return { src: "/assets/controller/key-dl.png", alt: "↙" };
    case 2:
      return { src: "/assets/controller/key-d.png", alt: "↓" };
    case 3:
      return { src: "/assets/controller/key-dr.png", alt: "↘" };
    case 4:
      return { src: "/assets/controller/key-l.png", alt: "←" };
    case 5:
      return { src: "/assets/controller/key-nutral.png", alt: "N" };
    case 6:
      return { src: "/assets/controller/key-r.png", alt: "→" };
    case 7:
      return { src: "/assets/controller/key-dr.png", alt: "↖", rotateDeg: 180 };
    case 8:
      return { src: "/assets/controller/key-d.png", alt: "↑", rotateDeg: 180 };
    case 9:
      return { src: "/assets/controller/key-dl.png", alt: "↗", rotateDeg: 180 };
    default:
      return null;
  }
}

function directionLabel(direction: number | undefined, mode: DirectionDisplayMode): ReactNode {
  if (!direction) {
    return "-";
  }

  if (mode === "number") {
    return String(direction);
  }

  switch (direction) {
    case 1:
      return "↙";
    case 2:
      return "↓";
    case 3:
      return "↘";
    case 4:
      return "←";
    case 5:
      return "N";
    case 6:
      return "→";
    case 7:
      return "↖";
    case 8:
      return "↑";
    case 9:
      return "↗";
    default:
      return "-";
  }
}

function renderDirectionValue(direction: number | undefined, mode: DirectionDisplayMode): ReactNode {
  if (!direction) {
    return "-";
  }

  if (mode === "number") {
    return directionLabel(direction, mode);
  }

  const iconSpec = toDirectionIconSpec(direction);
  if (!iconSpec) {
    return directionLabel(direction, mode);
  }

  return (
    <img
      className="dir-icon"
      src={iconSpec.src}
      alt={iconSpec.alt}
      title={iconSpec.alt}
      loading="lazy"
      style={iconSpec.rotateDeg ? { transform: `rotate(${iconSpec.rotateDeg}deg)` } : undefined}
    />
  );
}

function renderSingleButton(button: string): ReactNode {
  const iconSrc = BUTTON_ICON_BY_NAME[button as CanonicalButton];
  if (!iconSrc) {
    return (
      <span className="button-fallback" title={button}>
        {button}
      </span>
    );
  }

  return <img className="button-icon" src={iconSrc} alt={button} title={button} loading="lazy" />;
}

function renderButtonSet(buttons: readonly string[], mode: DownDisplayMode): ReactNode {
  if (buttons.length === 0) {
    return "-";
  }

  if (mode === "text") {
    return buttons.join("+");
  }

  return (
    <span className="input-buttons">
      {buttons.map((button, index) => (
        <Fragment key={`${button}-${index}`}>
          {index > 0 ? <img className="button-separator-icon" src={BUTTON_SEPARATOR_ICON_SRC} alt="+" title="+" loading="lazy" /> : null}
          {renderSingleButton(button)}
        </Fragment>
      ))}
    </span>
  );
}

function describeStep(step: TrialStep): string {
  const parts: string[] = [];

  if (step.expect.motion) {
    parts.push(`motion ${step.expect.motion}`);
  }
  if (step.expect.direction) {
    parts.push(`dir ${step.expect.direction}`);
  }
  if (step.expect.buttons?.length) {
    const buttonLabel = step.expect.buttons.join("+");
    if (step.expect.simultaneousWithinFrames !== undefined) {
      parts.push(`${buttonLabel} (${step.expect.simultaneousWithinFrames}F)`);
    } else {
      parts.push(buttonLabel);
    }
  }

  return parts.length > 0 ? parts.join(" + ") : "No expectation";
}

function statusLabel(snapshot: TrialJudgeSnapshot): string {
  if (snapshot.status === "success") {
    return "Success";
  }
  if (snapshot.status === "failed") {
    return "Failed";
  }
  return "Running";
}

function stepStateClass(stepIndex: number, snapshot: TrialJudgeSnapshot): string {
  if (snapshot.status === "failed" && snapshot.failedStepIndex === stepIndex) {
    return "is-failed";
  }
  if (stepIndex < snapshot.currentStepIndex) {
    return "is-completed";
  }
  if (stepIndex === snapshot.currentStepIndex && snapshot.status === "running") {
    return "is-active";
  }
  return "is-pending";
}

function isInputMode(value: string): value is InputMode {
  return INPUT_MODES.includes(value as InputMode);
}

function isDirectionDisplayMode(value: string): value is DirectionDisplayMode {
  return DIRECTION_DISPLAY_MODES.includes(value as DirectionDisplayMode);
}

function isDownDisplayMode(value: string): value is DownDisplayMode {
  return DOWN_DISPLAY_MODES.includes(value as DownDisplayMode);
}

function readStoredInputMode(): InputMode {
  if (typeof window === "undefined") {
    return "auto";
  }

  const stored = window.localStorage.getItem(INPUT_MODE_STORAGE_KEY);
  if (stored && isInputMode(stored)) {
    return stored;
  }

  return "auto";
}

function readStoredDirectionDisplayMode(): DirectionDisplayMode {
  if (typeof window === "undefined") {
    return "number";
  }

  const stored = window.localStorage.getItem(DIRECTION_DISPLAY_MODE_STORAGE_KEY);
  if (stored && isDirectionDisplayMode(stored)) {
    return stored;
  }

  return "number";
}

function readStoredDownDisplayMode(): DownDisplayMode {
  if (typeof window === "undefined") {
    return "text";
  }

  const stored = window.localStorage.getItem(DOWN_DISPLAY_MODE_STORAGE_KEY);
  if (stored && isDownDisplayMode(stored)) {
    return stored;
  }

  return "text";
}

function modeLabel(mode: InputMode): string {
  switch (mode) {
    case "auto":
      return "Auto";
    case "xinput":
      return "XInput";
    case "hid":
      return "HID";
    case "web":
      return "Web Gamepad";
    default:
      return mode;
  }
}

function directionDisplayModeLabel(mode: DirectionDisplayMode): string {
  switch (mode) {
    case "arrow":
      return "Icon";
    case "number":
    default:
      return "Number";
  }
}

function downDisplayModeLabel(mode: DownDisplayMode): string {
  switch (mode) {
    case "icon":
      return "Icon";
    case "text":
    default:
      return "Text";
  }
}

export function TrialRunnerPanel({ trial }: { trial: ComboTrial }) {
  const judgeRef = useRef<TrialJudge | null>(null);

  const [inputMode, setInputMode] = useState<InputMode>(() => readStoredInputMode());
  const [directionDisplayMode, setDirectionDisplayMode] = useState<DirectionDisplayMode>(() => readStoredDirectionDisplayMode());
  const [downDisplayMode, setDownDisplayMode] = useState<DownDisplayMode>(() => readStoredDownDisplayMode());
  const [providerKind, setProviderKind] = useState<InputProvider["kind"]>("web-gamepad");
  const [providerError, setProviderError] = useState<string | null>(null);
  const [judgeSnapshot, setJudgeSnapshot] = useState<TrialJudgeSnapshot>(() => {
    const judge = new TrialJudge(trial);
    return judge.getSnapshot();
  });
  const [recentFrames, setRecentFrames] = useState<InputFrame[]>([]);
  const [inputHistory, setInputHistory] = useState<InputHistoryEntry[]>([]);

  const handleInputModeChange = (value: string) => {
    if (!isInputMode(value)) {
      return;
    }
    setInputMode(value);
  };

  const handleDirectionDisplayModeChange = (value: string) => {
    if (!isDirectionDisplayMode(value)) {
      return;
    }
    setDirectionDisplayMode(value);
  };

  const handleDownDisplayModeChange = (value: string) => {
    if (!isDownDisplayMode(value)) {
      return;
    }
    setDownDisplayMode(value);
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(INPUT_MODE_STORAGE_KEY, inputMode);
    }
  }, [inputMode]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DIRECTION_DISPLAY_MODE_STORAGE_KEY, directionDisplayMode);
    }
  }, [directionDisplayMode]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DOWN_DISPLAY_MODE_STORAGE_KEY, downDisplayMode);
    }
  }, [downDisplayMode]);

  useEffect(() => {
    const provider = createInputProvider(inputMode);
    const judge = new TrialJudge(trial);
    judgeRef.current = judge;

    setProviderKind(provider.kind);
    setProviderError(null);
    setJudgeSnapshot(judge.getSnapshot());
    setRecentFrames([]);
    setInputHistory([]);

    let mounted = true;
    const unsubscribe = provider.subscribe((frame) => {
      if (!mounted) {
        return;
      }

      const snapshot = judge.advance(frame);
      setJudgeSnapshot(snapshot);
      setRecentFrames((previous) => {
        const next = [...previous, frame];
        if (next.length > RAW_FRAME_LOG_LIMIT) {
          next.splice(0, next.length - RAW_FRAME_LOG_LIMIT);
        }
        return next;
      });
      setInputHistory((previous) => appendInputHistoryEntry(previous, frame, INPUT_HISTORY_LIMIT));
    });

    provider
      .start()
      .then(() => {
        if (mounted) {
          setProviderKind(provider.kind);
        }
      })
      .catch((error) => {
        if (!mounted) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        setProviderError(message);
      });

    return () => {
      mounted = false;
      unsubscribe();
      provider.stop().catch(() => undefined);
    };
  }, [trial, inputMode]);

  const currentStep = useMemo(() => {
    return trial.steps[judgeSnapshot.currentStepIndex] ?? null;
  }, [judgeSnapshot.currentStepIndex, trial.steps]);

  const visibleFrames = useMemo(() => {
    return [...recentFrames].reverse();
  }, [recentFrames]);

  const visibleHistoryEntries = useMemo(() => {
    return [...inputHistory].reverse();
  }, [inputHistory]);

  const handleReset = () => {
    const judge = judgeRef.current;
    if (!judge) {
      return;
    }

    judge.reset();
    setJudgeSnapshot(judge.getSnapshot());
    setRecentFrames([]);
    setInputHistory([]);
  };

  return (
    <section className="trial-panel">
      <div className="trial-head">
        <div>
          <h2>Combo Trial (M1)</h2>
          <p>{trial.name}</p>
        </div>
        <div className="trial-actions">
          <span className={`trial-status is-${judgeSnapshot.status}`}>{statusLabel(judgeSnapshot)}</span>
          <button type="button" onClick={handleReset}>
            Reset Trial
          </button>
        </div>
      </div>

      <div className="input-mode-row">
        <label className="input-mode-control">
          <span>Input Mode</span>
          <select value={inputMode} onChange={(event) => handleInputModeChange(event.currentTarget.value)}>
            {INPUT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {modeLabel(mode)}
              </option>
            ))}
          </select>
        </label>
        <label className="input-mode-control">
          <span>Dir Display</span>
          <select value={directionDisplayMode} onChange={(event) => handleDirectionDisplayModeChange(event.currentTarget.value)}>
            {DIRECTION_DISPLAY_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {directionDisplayModeLabel(mode)}
              </option>
            ))}
          </select>
        </label>
        <label className="input-mode-control">
          <span>Down Display</span>
          <select value={downDisplayMode} onChange={(event) => handleDownDisplayModeChange(event.currentTarget.value)}>
            {DOWN_DISPLAY_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {downDisplayModeLabel(mode)}
              </option>
            ))}
          </select>
        </label>
        <p className="provider-line">
          Input Provider: <strong>{providerKind}</strong>
        </p>
      </div>

      {providerError ? (
        <div className="native-error">
          <h3>Input Error</h3>
          <p>{providerError}</p>
          <p>選択中モードで入力を開始できませんでした。コントローラー接続とモード設定を確認してください。</p>
        </div>
      ) : (
        <div className="trial-window">
          <p>
            Current Step: <strong>{currentStep ? `${judgeSnapshot.currentStepIndex + 1}/${trial.steps.length} ${currentStep.id}` : "Complete"}</strong>
          </p>
          <p>
            Window: <strong>{judgeSnapshot.currentWindowOpenFrame ?? "-"}F - {judgeSnapshot.currentWindowCloseFrame ?? "-"}F</strong>
          </p>
          <p>
            Last Match: <strong>{judgeSnapshot.lastMatchedFrame ?? "-"}</strong>
          </p>
          {judgeSnapshot.failReason ? (
            <p className="fail-reason">
              Reason: <strong>{judgeSnapshot.failReason}</strong>
            </p>
          ) : null}
        </div>
      )}

      <div className="trial-layout">
        <section className="trial-steps-panel">
          <h3>Steps</h3>
          <ol className="trial-steps">
            {trial.steps.map((step, stepIndex) => (
              <li key={step.id} className={`trial-step ${stepStateClass(stepIndex, judgeSnapshot)}`}>
                <div className="trial-step-head">
                  <strong>{step.id}</strong>
                  <span>
                    +{step.window.openAfterPrevFrames}F to +{step.window.closeAfterPrevFrames}F
                  </span>
                </div>
                <p>{describeStep(step)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="trial-log-panel">
          <h3>Input History</h3>
          <div className="frame-log-wrap">
            <table className="frame-log-table history-table">
              <thead>
                <tr>
                  <th>Hold</th>
                  <th>Dir</th>
                  <th>Down</th>
                </tr>
              </thead>
              <tbody>
                {visibleHistoryEntries.length > 0 ? (
                  visibleHistoryEntries.map((entry) => (
                    <tr key={`${entry.startFrame}-${entry.endFrame}`}>
                      <td>{toDisplayHoldFrames(entry.holdFrames)}</td>
                      <td>{renderDirectionValue(entry.direction, directionDisplayMode)}</td>
                      <td>{renderButtonSet(entry.down, downDisplayMode)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3}>No input history yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <details className="debug-frame-panel">
            <summary>Debug Raw Frames</summary>
            <div className="frame-log-wrap">
              <table className="frame-log-table">
                <thead>
                  <tr>
                    <th>F</th>
                    <th>Dir</th>
                    <th>Pressed</th>
                    <th>Down</th>
                    <th>Released</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleFrames.length > 0 ? (
                    visibleFrames.map((frame) => (
                      <tr key={frame.frame}>
                        <td>{frame.frame}</td>
                        <td>{renderDirectionValue(frame.direction, directionDisplayMode)}</td>
                        <td>{frame.pressed.join("+") || "-"}</td>
                        <td>{renderButtonSet(frame.down, downDisplayMode)}</td>
                        <td>{frame.released.join("+") || "-"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5}>No input frames yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      </div>
    </section>
  );
}

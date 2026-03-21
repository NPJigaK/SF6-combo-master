import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { InputSample, RecentAttemptSummaryRecord } from "@sf6cm/core";

import { App } from "./App";
import type {
  PracticeInputAdapter,
  PracticeInputShellState,
} from "./session/PracticeSessionController";
import type { DrillProgressRecord, PracticeSettings, PracticeStorage } from "./storage";

class TestInputAdapter implements PracticeInputAdapter {
  private readonly listeners = new Set<(sample: InputSample) => void>();

  private readonly statusListeners = new Set<(status: PracticeInputShellState) => void>();

  private status: PracticeInputShellState;

  lockCalls: Array<string | null> = [];

  private lockedSourceId: string | null = null;

  constructor(
    initialStatus: PracticeInputShellState = {
      mode: "warned_non_grading",
      issues: ["desktop.unsupported_device"],
      activeSourceId: null,
      interruptionReason: null,
    },
  ) {
    this.status = initialStatus;
  }

  subscribe(listener: (sample: InputSample) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeStatus(listener: (status: PracticeInputShellState) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  getStatus(): PracticeInputShellState {
    return this.status;
  }

  setActiveSourceLock(sourceId: string | null): void {
    this.lockedSourceId = sourceId;
    this.lockCalls.push(sourceId);
  }

  setStatus(status: PracticeInputShellState): void {
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  emit(sample: InputSample, sourceId = this.status.activeSourceId): void {
    if (this.lockedSourceId && sourceId !== this.lockedSourceId) {
      return;
    }

    for (const listener of this.listeners) {
      listener(sample);
    }
  }
}

class MemoryPracticeStorage implements PracticeStorage {
  settings: PracticeSettings | null = null;

  progress = new Map<string, DrillProgressRecord>();

  recentAttempts: RecentAttemptSummaryRecord[] = [];

  loadSettings(): PracticeSettings | null {
    return this.settings;
  }

  saveSettings(settings: PracticeSettings): void {
    this.settings = settings;
  }

  loadProgress(): Record<string, DrillProgressRecord> {
    return Object.fromEntries(this.progress.entries());
  }

  saveProgress(progress: Record<string, DrillProgressRecord>): void {
    this.progress = new Map(Object.entries(progress));
  }

  loadRecentAttempts(): RecentAttemptSummaryRecord[] {
    return this.recentAttempts;
  }

  saveRecentAttempts(records: RecentAttemptSummaryRecord[]): void {
    this.recentAttempts = records;
  }
}

describe("shared practice app", () => {
  afterEach(() => {
    cleanup();
  });

  it("localizes drill labels and failure messaging while persisting summary-only attempts", () => {
    const adapter = new TestInputAdapter({
      mode: "ready",
      issues: [],
      activeSourceId: "pad-a",
      interruptionReason: null,
    });
    const storage = new MemoryPracticeStorage();
    const timestamps = ["2026-03-17T10:00:00Z"];

    render(
      <App
        inputAdapter={adapter}
        storage={storage}
        now={() => timestamps.shift() ?? "2026-03-17T10:00:59Z"}
      />,
    );

    expect(screen.getByRole("heading", { name: "Quarter Circle Forward / QCF" })).toBeInTheDocument();
    expect(
      screen.getByText("Roll from down to forward, then finish with a punch-family attack."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Language"), {
      target: { value: "ja" },
    });

    expect(screen.getByRole("heading", { name: "波動 / QCF" })).toBeInTheDocument();
    expect(
      screen.getByText("キーボードは操作用のみで、採点付き練習には使えません。"),
    ).toBeInTheDocument();

    act(() => {
      adapter.emit({
        timestampMs: 0,
        direction: { resolvedDirection: "down" },
        buttons: [],
      });
      adapter.emit({
        timestampMs: 16.7,
        direction: { resolvedDirection: "down_forward" },
        buttons: [],
      });
      adapter.emit({
        timestampMs: 33.4,
        direction: { resolvedDirection: "forward" },
        buttons: ["HK"],
      });
    });

    expect(screen.getByText("最後の攻撃入力がドリル条件と一致しませんでした。")).toBeInTheDocument();

    const historyPanel = screen.getByTestId("input-history");
    expect(within(historyPanel).getAllByRole("listitem")).toHaveLength(3);

    expect(storage.settings).toEqual({
      locale: "ja",
      notation: "icon",
      activeProfile: "sf6cm-input-profile@1",
    });
    expect(storage.recentAttempts).toHaveLength(1);
    expect(storage.recentAttempts[0]).toMatchObject({
      drill_id: "qcf_punch",
      ruleset_version: "sf6cm-reference-ruleset@1.0.0",
      input_profile: "sf6cm-input-profile@1",
      terminal_requirement_kind: "button_family",
      passed: false,
      primary_failure_key: "terminal_input_mismatch",
      canonical_or_shortcut: null,
      frame_span_summary: null,
      timestamp: "2026-03-17T10:00:00Z",
    });
    expect(storage.progress.get("qcf_punch")).toEqual({
      drill_id: "qcf_punch",
      total_attempts: 1,
      total_successes: 0,
      current_streak: 0,
      best_streak: 0,
      success_rate: 0,
      last_practiced_at: "2026-03-17T10:00:00Z",
    });
  });

  it("shows warned non-grading state and ignores unsupported-path samples", () => {
    const adapter = new TestInputAdapter({
      mode: "warned_non_grading",
      issues: ["web.standard_mapping_required"],
      activeSourceId: null,
      interruptionReason: null,
    });
    const storage = new MemoryPracticeStorage();

    render(<App inputAdapter={adapter} storage={storage} />);

    expect(screen.getByText("Graded practice is paused.")).toBeInTheDocument();
    expect(screen.getByText("Web grading requires a standard-mapped gamepad.")).toBeInTheDocument();

    act(() => {
      adapter.emit({
        timestampMs: 0,
        direction: { resolvedDirection: "down" },
        buttons: [],
      });
      adapter.emit({
        timestampMs: 16.7,
        direction: { resolvedDirection: "down_forward" },
        buttons: [],
      });
      adapter.emit({
        timestampMs: 33.4,
        direction: { resolvedDirection: "forward" },
        buttons: ["LP"],
      });
    });

    expect(screen.getByText("Waiting for a graded terminal input.")).toBeInTheDocument();
    expect(within(screen.getByTestId("input-history")).queryAllByRole("listitem")).toHaveLength(0);
    expect(storage.recentAttempts).toHaveLength(0);
  });

  it("locks the active graded source per attempt and unlocks after the attempt ends", () => {
    const adapter = new TestInputAdapter({
      mode: "ready",
      issues: [],
      activeSourceId: "pad-a",
      interruptionReason: null,
    });
    const storage = new MemoryPracticeStorage();
    const timestamps = ["2026-03-17T10:00:00Z"];

    render(
      <App
        inputAdapter={adapter}
        storage={storage}
        now={() => timestamps.shift() ?? "2026-03-17T10:00:59Z"}
      />,
    );

    act(() => {
      adapter.emit({
        timestampMs: 0,
        direction: { resolvedDirection: "down" },
        buttons: [],
      }, "pad-a");

      adapter.setStatus({
        mode: "ready",
        issues: [],
        activeSourceId: "pad-b",
        interruptionReason: null,
      });

      adapter.emit({
        timestampMs: 16.7,
        direction: { resolvedDirection: "down_forward" },
        buttons: [],
      }, "pad-b");

      adapter.emit({
        timestampMs: 16.7,
        direction: { resolvedDirection: "down_forward" },
        buttons: [],
      }, "pad-a");
      adapter.emit({
        timestampMs: 33.4,
        direction: { resolvedDirection: "forward" },
        buttons: ["LP"],
      }, "pad-a");
    });

    expect(storage.recentAttempts).toHaveLength(1);
    expect(adapter.lockCalls).toEqual(["pad-a", null]);
  });

  it("voids the in-progress attempt when the active source disconnects", () => {
    const adapter = new TestInputAdapter({
      mode: "ready",
      issues: [],
      activeSourceId: "pad-a",
      interruptionReason: null,
    });
    const storage = new MemoryPracticeStorage();

    render(<App inputAdapter={adapter} storage={storage} />);

    act(() => {
      adapter.emit({
        timestampMs: 0,
        direction: { resolvedDirection: "down" },
        buttons: [],
      }, "pad-a");
      adapter.emit({
        timestampMs: 16.7,
        direction: { resolvedDirection: "down_forward" },
        buttons: [],
      }, "pad-a");
    });

    expect(within(screen.getByTestId("input-history")).getAllByRole("listitem")).toHaveLength(2);

    act(() => {
      adapter.setStatus({
        mode: "warned_non_grading",
        issues: ["desktop.unsupported_device"],
        activeSourceId: null,
        interruptionReason: "source_disconnected",
      });
    });

    expect(screen.getByText("The current graded attempt was cleared because the active source disconnected.")).toBeInTheDocument();
    expect(within(screen.getByTestId("input-history")).queryAllByRole("listitem")).toHaveLength(0);
    expect(storage.recentAttempts).toHaveLength(0);
    expect(adapter.lockCalls.at(-1)).toBeNull();
  });
});

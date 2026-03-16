import {
  appendInputSample,
  buildInputHistoryView,
  buildRecentAttemptSummaryRecord,
  coreDrillCatalog,
  gradeAttempt,
  inputProfile as defaultInputProfile,
  referenceRuleset as defaultRuleset,
  type BuiltInDrill,
  type BuiltInDrillCatalog,
  type GradeAttemptResult,
  type InputProfile,
  type InputSample,
  type InputHistoryView,
  type RecentAttemptSummaryRecord,
  type ReferenceRuleset,
} from "@sf6cm/core";

import type { SupportedLocale } from "../i18n";
import {
  createLocalPracticeStorage,
  type DrillProgressRecord,
  type PracticeSettings,
  type PracticeStorage,
} from "../storage";

export interface PracticeInputAdapter {
  subscribe(listener: (sample: InputSample) => void): () => void;
}

export interface PracticeSessionSnapshot {
  locale: SupportedLocale;
  notation: "icon" | "numpad";
  activeProfile: InputProfile;
  selectedDrillId: string;
  drills: BuiltInDrill[];
  latestResult: GradeAttemptResult | null;
  inputHistory: InputHistoryView;
  recentAttempts: RecentAttemptSummaryRecord[];
  progressByDrill: Record<string, DrillProgressRecord>;
}

function detectInitialLocale(): SupportedLocale {
  if (typeof navigator === "undefined") {
    return "en";
  }

  return navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
}

function createEmptyHistoryView(ruleset: ReferenceRuleset, inputProfile: InputProfile): InputHistoryView {
  return buildInputHistoryView({
    frames: [],
    ruleset,
    inputProfile,
  });
}

function updateDrillProgress(
  current: DrillProgressRecord | undefined,
  drillId: string,
  passed: boolean,
  timestamp: string,
): DrillProgressRecord {
  const totalAttempts = (current?.total_attempts ?? 0) + 1;
  const totalSuccesses = (current?.total_successes ?? 0) + (passed ? 1 : 0);
  const currentStreak = passed ? (current?.current_streak ?? 0) + 1 : 0;
  const bestStreak = passed ? Math.max(current?.best_streak ?? 0, currentStreak) : current?.best_streak ?? 0;

  return {
    drill_id: drillId,
    total_attempts: totalAttempts,
    total_successes: totalSuccesses,
    current_streak: currentStreak,
    best_streak: bestStreak,
    success_rate: totalSuccesses / totalAttempts,
    last_practiced_at: timestamp,
  };
}

export class PracticeSessionController {
  private readonly storage: PracticeStorage;

  private readonly ruleset: ReferenceRuleset;

  private readonly inputProfile: InputProfile;

  private readonly drillCatalog: BuiltInDrillCatalog;

  private readonly now: () => string;

  private readonly listeners = new Set<() => void>();

  private unsubscribeFromAdapter: (() => void) | null = null;

  private timeline = { capacity: 256, frames: [] } as ReturnType<typeof appendInputSample> | { capacity: number; frames: [] };

  private latestAttemptSignature: string | null = null;

  private snapshot: PracticeSessionSnapshot;

  constructor({
    inputAdapter,
    storage = createLocalPracticeStorage(),
    ruleset = defaultRuleset,
    inputProfile = defaultInputProfile,
    drillCatalog = coreDrillCatalog,
    now = () => new Date().toISOString(),
  }: {
    inputAdapter: PracticeInputAdapter;
    storage?: PracticeStorage;
    ruleset?: ReferenceRuleset;
    inputProfile?: InputProfile;
    drillCatalog?: BuiltInDrillCatalog;
    now?: () => string;
  }) {
    this.storage = storage;
    this.ruleset = ruleset;
    this.inputProfile = inputProfile;
    this.drillCatalog = drillCatalog;
    this.now = now;

    const storedSettings = this.storage.loadSettings();
    const locale = storedSettings?.locale ?? detectInitialLocale();
    const notation = storedSettings?.notation ?? inputProfile.default_notation;
    const selectedDrillId = drillCatalog.drills[0]?.drill_id ?? "";

    this.snapshot = {
      locale,
      notation,
      activeProfile: inputProfile,
      selectedDrillId,
      drills: drillCatalog.drills,
      latestResult: null,
      inputHistory: createEmptyHistoryView(ruleset, inputProfile),
      recentAttempts: [...this.storage.loadRecentAttempts()],
      progressByDrill: { ...this.storage.loadProgress() },
    };

    this.persistSettings();
    this.unsubscribeFromAdapter = inputAdapter.subscribe((sample) => {
      this.handleInputSample(sample);
    });
  }

  dispose(): void {
    this.unsubscribeFromAdapter?.();
    this.unsubscribeFromAdapter = null;
    this.listeners.clear();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): PracticeSessionSnapshot {
    return this.snapshot;
  }

  setLocale(locale: SupportedLocale): void {
    if (this.snapshot.locale === locale) {
      return;
    }

    this.snapshot = {
      ...this.snapshot,
      locale,
    };
    this.persistSettings();
    this.emitChange();
  }

  setNotation(notation: "icon" | "numpad"): void {
    if (this.snapshot.notation === notation) {
      return;
    }

    this.snapshot = {
      ...this.snapshot,
      notation,
    };
    this.persistSettings();
    this.emitChange();
  }

  setSelectedDrill(drillId: string): void {
    if (!this.drillCatalog.drills.some((drill) => drill.drill_id === drillId) || this.snapshot.selectedDrillId === drillId) {
      return;
    }

    this.timeline = { capacity: 256, frames: [] };
    this.latestAttemptSignature = null;
    this.snapshot = {
      ...this.snapshot,
      selectedDrillId: drillId,
      latestResult: null,
      inputHistory: createEmptyHistoryView(this.ruleset, this.inputProfile),
    };
    this.emitChange();
  }

  private handleInputSample(sample: InputSample): void {
    this.timeline = appendInputSample(this.timeline, sample);

    const drill = this.getSelectedDrill();
    const latestResult = gradeAttempt({
      frames: this.timeline.frames,
      drill,
      ruleset: this.ruleset,
      inputProfile: this.inputProfile,
    });
    const inputHistory = buildInputHistoryView({
      frames: this.timeline.frames,
      ruleset: this.ruleset,
      inputProfile: this.inputProfile,
    });

    let recentAttempts = this.snapshot.recentAttempts;
    let progressByDrill = this.snapshot.progressByDrill;

    const terminalEvent = latestResult.terminal_event;
    const attemptSignature = terminalEvent
      ? [drill.drill_id, terminalEvent.frame, terminalEvent.kind, terminalEvent.button].join(":")
      : null;

    if (attemptSignature && attemptSignature !== this.latestAttemptSignature) {
      this.latestAttemptSignature = attemptSignature;

      const timestamp = this.now();
      const record = buildRecentAttemptSummaryRecord({
        result: latestResult,
        timestamp,
      });

      recentAttempts = [...recentAttempts, record].slice(-20);
      progressByDrill = {
        ...progressByDrill,
        [drill.drill_id]: updateDrillProgress(progressByDrill[drill.drill_id], drill.drill_id, latestResult.passed, timestamp),
      };

      this.storage.saveRecentAttempts(recentAttempts);
      this.storage.saveProgress(progressByDrill);
    }

    this.snapshot = {
      ...this.snapshot,
      latestResult,
      inputHistory,
      recentAttempts,
      progressByDrill,
    };

    this.emitChange();
  }

  private getSelectedDrill(): BuiltInDrill {
    const selected = this.drillCatalog.drills.find((drill) => drill.drill_id === this.snapshot.selectedDrillId);

    if (!selected) {
      throw new Error(`Unknown drill id: ${this.snapshot.selectedDrillId}`);
    }

    return selected;
  }

  private persistSettings(): void {
    const settings: PracticeSettings = {
      locale: this.snapshot.locale,
      notation: this.snapshot.notation,
      activeProfile: this.inputProfile.profile_id,
    };

    this.storage.saveSettings(settings);
  }

  private emitChange(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

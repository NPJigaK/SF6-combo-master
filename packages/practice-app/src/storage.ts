import type { RecentAttemptSummaryRecord } from "@sf6cm/core";

import type { SupportedLocale } from "./i18n";

export interface PracticeSettings {
  locale: SupportedLocale;
  notation: "icon" | "numpad";
  activeProfile: string;
}

export interface DrillProgressRecord {
  drill_id: string;
  total_attempts: number;
  total_successes: number;
  current_streak: number;
  best_streak: number;
  success_rate: number;
  last_practiced_at: string;
}

export interface PracticeStorage {
  loadSettings(): PracticeSettings | null;
  saveSettings(settings: PracticeSettings): void;
  loadProgress(): Record<string, DrillProgressRecord>;
  saveProgress(progress: Record<string, DrillProgressRecord>): void;
  loadRecentAttempts(): RecentAttemptSummaryRecord[];
  saveRecentAttempts(records: RecentAttemptSummaryRecord[]): void;
}

function safeParseJson<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function createLocalPracticeStorage(namespace = "sf6cm.practice"): PracticeStorage {
  const memory = new Map<string, string>();

  function getStore(): Pick<Storage, "getItem" | "setItem"> {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }

    return {
      getItem(key: string): string | null {
        return memory.get(key) ?? null;
      },
      setItem(key: string, value: string): void {
        memory.set(key, value);
      },
    };
  }

  function key(suffix: string): string {
    return `${namespace}.${suffix}`;
  }

  return {
    loadSettings(): PracticeSettings | null {
      return safeParseJson<PracticeSettings | null>(getStore().getItem(key("settings")), null);
    },
    saveSettings(settings: PracticeSettings): void {
      getStore().setItem(key("settings"), JSON.stringify(settings));
    },
    loadProgress(): Record<string, DrillProgressRecord> {
      return safeParseJson<Record<string, DrillProgressRecord>>(getStore().getItem(key("progress")), {});
    },
    saveProgress(progress: Record<string, DrillProgressRecord>): void {
      getStore().setItem(key("progress"), JSON.stringify(progress));
    },
    loadRecentAttempts(): RecentAttemptSummaryRecord[] {
      return safeParseJson<RecentAttemptSummaryRecord[]>(getStore().getItem(key("recentAttempts")), []);
    },
    saveRecentAttempts(records: RecentAttemptSummaryRecord[]): void {
      getStore().setItem(key("recentAttempts"), JSON.stringify(records));
    },
  };
}

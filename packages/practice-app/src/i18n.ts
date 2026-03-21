import { localeCatalogs, type BuiltInDrill, type FailureKey } from "@sf6cm/core";

export type SupportedLocale = keyof typeof localeCatalogs;

export type SupportIssueKey =
  | "web.unsupported_browser"
  | "web.standard_mapping_required"
  | "desktop.unsupported_device"
  | "keyboard.graded_practice_unavailable";

interface UiCopy {
  appTitle: string;
  appSubtitle: string;
  drillCatalogTitle: string;
  inputHistoryTitle: string;
  settingsTitle: string;
  languageLabel: string;
  notationLabel: string;
  profileLabel: string;
  latestResultTitle: string;
  waitingForAttempt: string;
  passed: string;
  failed: string;
  canonicalTag: string;
  shortcutTag: string;
  recentAttemptsTitle: string;
  noAttemptsYet: string;
  notationIcon: string;
  notationNumpad: string;
  gradingPaused: string;
  sourceDisconnectedReset: string;
}

const uiCopy: Record<SupportedLocale, UiCopy> = {
  en: {
    appTitle: "SF6 Combo Master",
    appSubtitle: "Shared input trainer core with frozen SF6-style grading.",
    drillCatalogTitle: "Drill Catalog",
    inputHistoryTitle: "Input History",
    settingsTitle: "Session Settings",
    languageLabel: "Language",
    notationLabel: "Notation",
    profileLabel: "Input Profile",
    latestResultTitle: "Latest Attempt",
    waitingForAttempt: "Waiting for a graded terminal input.",
    passed: "Passed",
    failed: "Try again",
    canonicalTag: "Canonical",
    shortcutTag: "Shortcut",
    recentAttemptsTitle: "Recent Attempts",
    noAttemptsYet: "No graded attempts yet.",
    notationIcon: "Icon / motion tokens",
    notationNumpad: "Numpad",
    gradingPaused: "Graded practice is paused.",
    sourceDisconnectedReset: "The current graded attempt was cleared because the active source disconnected.",
  },
  ja: {
    appTitle: "SF6 Combo Master",
    appSubtitle: "共有グレーディングコアで入力練習を行います。",
    drillCatalogTitle: "ドリル一覧",
    inputHistoryTitle: "入力履歴",
    settingsTitle: "セッション設定",
    languageLabel: "言語",
    notationLabel: "表記",
    profileLabel: "入力プロファイル",
    latestResultTitle: "直近の判定",
    waitingForAttempt: "採点対象の終端入力を待っています。",
    passed: "成功",
    failed: "再挑戦",
    canonicalTag: "正規入力",
    shortcutTag: "ショートカット",
    recentAttemptsTitle: "直近の履歴",
    noAttemptsYet: "まだ採点済みの入力はありません。",
    notationIcon: "アイコン / モーション表記",
    notationNumpad: "テンキー",
    gradingPaused: "採点付き練習は一時停止中です。",
    sourceDisconnectedReset: "アクティブな入力元が切断されたため、進行中の採点をクリアしました。",
  },
};

const numpadMotionTokens: Record<string, string> = {
  QCF: "236",
  QCB: "214",
  DPF: "623",
  DPB: "421",
  charge_back_forward: "[4]6",
  charge_down_up: "[2]8",
  double_QCF: "236236",
  double_QCB: "214214",
};

export function getUiCopy(locale: SupportedLocale): UiCopy {
  return uiCopy[locale];
}

export function getLocaleCatalog(locale: SupportedLocale) {
  return localeCatalogs[locale];
}

export function getDrillTitle(locale: SupportedLocale, drill: BuiltInDrill): string {
  return getLocaleCatalog(locale).drills[drill.title_key] ?? drill.drill_id;
}

export function getDrillDescription(locale: SupportedLocale, drill: BuiltInDrill): string {
  return getLocaleCatalog(locale).drills[drill.short_description_key] ?? drill.short_description_key;
}

export function getProfileLabel(locale: SupportedLocale, labelKey: string): string {
  return getLocaleCatalog(locale).drills[labelKey] ?? labelKey;
}

export function getFailureMessage(locale: SupportedLocale, failureKey: FailureKey): string {
  return getLocaleCatalog(locale).failure_messages[failureKey];
}

export function getSupportMessage(locale: SupportedLocale, issue: SupportIssueKey): string {
  const catalog = getLocaleCatalog(locale).support_messages;

  switch (issue) {
    case "web.unsupported_browser":
      return catalog.web.unsupported_browser;
    case "web.standard_mapping_required":
      return catalog.web.standard_mapping_required;
    case "desktop.unsupported_device":
      return catalog.desktop.unsupported_device;
    case "keyboard.graded_practice_unavailable":
      return catalog.keyboard.graded_practice_unavailable;
    default:
      return issue;
  }
}

export function formatNotationTokens(drill: BuiltInDrill, notation: "icon" | "numpad"): string[] {
  if (notation === "icon") {
    return drill.notation_tokens;
  }

  const motionToken = numpadMotionTokens[drill.motion_family_id] ?? drill.motion_family_id;

  return [motionToken, "+", drill.terminal_requirement_value.toString()];
}

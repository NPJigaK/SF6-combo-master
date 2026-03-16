export const motionFamilyIds = [
  "QCF",
  "QCB",
  "DPF",
  "DPB",
  "charge_back_forward",
  "charge_down_up",
  "double_QCF",
  "double_QCB",
] as const;

export type MotionFamilyId = (typeof motionFamilyIds)[number];

export const failureKeys = [
  "missing_step",
  "extra_direction_break",
  "window_expired",
  "charge_insufficient",
  "terminal_input_mismatch",
  "release_not_allowed",
  "shortcut_not_whitelisted",
] as const;

export type FailureKey = (typeof failureKeys)[number];
export type MatchClassification = "canonical" | "shortcut";

export type TerminalEvent = "press" | "release";

export interface RetailBaselineMetadata {
  retail_platform_label: string;
  comparison_snapshot_label: string;
  comparison_build_record_source: string;
  comparison_build_id: number;
  comparison_build_built_utc: string;
  comparison_build_updated_utc: string;
  verification_date: string;
  control_assumptions: string[];
  button_release_input_status: string;
  calibration_notes: string[];
}

export interface MotionFamilyTiming {
  total_lookback_window_frames: number;
  continuity_window_frames: number[];
  terminal_link_window_frames: number;
  charge_minimum_frames?: number;
}

export interface MotionFamilyRules {
  canonical_paths: string[][];
  shortcut_variants: string[][];
  representative_rejections: string[];
  timing: MotionFamilyTiming;
}

export interface ReferenceRuleset {
  ruleset_version: string;
  visible_input_history_version: string;
  baseline_metadata: RetailBaselineMetadata;
  button_release_input_supported: boolean;
  failure_keys: FailureKey[];
  motion_families: Record<MotionFamilyId, MotionFamilyRules>;
}

export interface InputProfile {
  profile_id: string;
  label_key: string;
  default_terminal_event: TerminalEvent;
  available_terminal_events: TerminalEvent[];
  button_release_input_enabled: boolean;
  default_notation: "icon" | "numpad";
}

export interface SupportMessageCatalog {
  web: {
    unsupported_browser: string;
    standard_mapping_required: string;
  };
  desktop: {
    unsupported_device: string;
  };
  keyboard: {
    graded_practice_unavailable: string;
  };
}

export interface LocaleCatalog {
  locale: "en" | "ja";
  motion_family_labels: Record<MotionFamilyId, string>;
  drills: Record<string, string>;
  failure_messages: Record<FailureKey, string>;
  support_messages: SupportMessageCatalog;
}

export interface FrameSpanSummary {
  start_frame: number;
  end_frame: number;
  terminal_frame: number;
}

export interface RecentAttemptSummaryRecord {
  drill_id: string;
  ruleset_version: string;
  input_profile: string;
  terminal_requirement_kind: string;
  passed: boolean;
  primary_failure_key: FailureKey | null;
  canonical_or_shortcut: MatchClassification | null;
  frame_span_summary: FrameSpanSummary | null;
  timestamp: string;
}

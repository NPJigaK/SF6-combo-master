import type { MotionFamilyId } from "./ruleset";

export const terminalRequirementKinds = ["exact", "button_family", "any_attack"] as const;

export type TerminalRequirementKind = (typeof terminalRequirementKinds)[number];

export type ExactTerminalToken = "LP" | "MP" | "HP" | "LK" | "MK" | "HK" | "PP" | "KK";
export type ButtonFamily = "punch" | "kick";

export interface BuiltInDrill {
  drill_id: string;
  reference_ruleset_version: string;
  motion_family_id: MotionFamilyId;
  terminal_requirement_kind: TerminalRequirementKind;
  terminal_requirement_value: ExactTerminalToken | ButtonFamily | "any_attack";
  notation_tokens: string[];
  title_key: string;
  short_description_key: string;
  curriculum: {
    track_id: "core-v1";
    family_label_key: string;
    sort_order: number;
  };
}

export interface BuiltInDrillCatalog {
  catalog_id: string;
  drills: BuiltInDrill[];
}

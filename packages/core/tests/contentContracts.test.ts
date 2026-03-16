import { describe, expect, it } from "vitest";

import * as core from "../src/index";

const REQUIRED_MOTION_FAMILIES = [
  "QCF",
  "QCB",
  "DPF",
  "DPB",
  "charge_back_forward",
  "charge_down_up",
  "double_QCF",
  "double_QCB",
] as const;

const REQUIRED_FAILURE_KEYS = [
  "missing_step",
  "extra_direction_break",
  "window_expired",
  "charge_insufficient",
  "terminal_input_mismatch",
  "release_not_allowed",
  "shortcut_not_whitelisted",
] as const;

const EXACT_TERMINAL_TOKENS = ["LP", "MP", "HP", "LK", "MK", "HK", "PP", "KK"];

function flattenLeafPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => flattenLeafPaths(child, prefix ? `${prefix}.${key}` : key))
    .sort();
}

describe("content contracts", () => {
  it("freezes the approved ruleset scope and version ids", () => {
    const baseline = core.referenceRuleset.baseline_metadata as Record<string, unknown>;

    expect(core.referenceRuleset.ruleset_version).toBe("sf6cm-reference-ruleset@1.0.0");
    expect(core.inputProfile.profile_id).toBe("sf6cm-input-profile@1");
    expect(core.motionFamilyIds).toEqual(REQUIRED_MOTION_FAMILIES);
    expect(Object.keys(core.referenceRuleset.motion_families)).toEqual(REQUIRED_MOTION_FAMILIES);
    expect(baseline).toEqual({
      retail_platform_label: "Steam / Windows",
      comparison_snapshot_label: "Street Fighter 6 retail Steam public branch",
      comparison_build_record_source: "SteamDB public branch record",
      comparison_build_id: 21420575,
      comparison_build_built_utc: "2026-01-08T08:20:23Z",
      comparison_build_updated_utc: "2026-01-30T07:00:24Z",
      verification_date: "2026-03-16",
      control_assumptions: [
        "Steam public branch retail build running on Windows",
        "Calibration uses the shared 60Hz logical frame timeline rather than raw backend timestamps",
        "Shipped MVP drills are graded with the default press-first input profile",
      ],
      button_release_input_status:
        "Official toggle exists; shipped app default profile remains off",
      calibration_notes: [
        "Visible Input History semantics were calibrated against the Street Fighter 6 retail Steam public branch comparison baseline.",
        "Command-window behavior was calibrated against the Street Fighter 6 retail Steam public branch comparison baseline.",
      ],
    });
  });

  it("keeps release input explicit and off in the shipped default profile", () => {
    expect(core.inputProfile.default_terminal_event).toBe("press");
    expect(core.inputProfile.available_terminal_events).toEqual(["press", "release"]);
    expect(core.inputProfile.button_release_input_enabled).toBe(false);
  });

  it("ships only the approved built-in drill scope and terminal requirement policy", () => {
    expect(core.coreDrillCatalog.catalog_id).toBe("sf6cm-core-drills@1");
    expect(core.coreDrillCatalog.drills).toHaveLength(REQUIRED_MOTION_FAMILIES.length);

    const seenFamilies = new Set<string>();

    for (const drill of core.coreDrillCatalog.drills) {
      expect(drill.reference_ruleset_version).toBe(core.referenceRuleset.ruleset_version);
      expect(drill.drill_id).toMatch(/^[a-z0-9][a-z0-9_-]+$/);
      expect(drill.motion_family_id).toMatch(/^[a-z0-9_]+$/i);
      expect(REQUIRED_MOTION_FAMILIES).toContain(drill.motion_family_id);
      expect(drill.notation_tokens.length).toBeGreaterThan(0);
      expect(drill.terminal_requirement_kind).not.toBe("any_attack");
      expect(core.localeCatalogs.en.drills[drill.title_key]).toEqual(expect.any(String));
      expect(core.localeCatalogs.ja.drills[drill.title_key]).toEqual(expect.any(String));
      expect(core.localeCatalogs.en.drills[drill.short_description_key]).toEqual(expect.any(String));
      expect(core.localeCatalogs.ja.drills[drill.short_description_key]).toEqual(expect.any(String));

      if (drill.terminal_requirement_kind === "button_family") {
        expect(["punch", "kick"]).toContain(drill.terminal_requirement_value);
      }

      if (drill.terminal_requirement_kind === "exact") {
        expect(EXACT_TERMINAL_TOKENS).toContain(drill.terminal_requirement_value);
      }

      seenFamilies.add(drill.motion_family_id);
    }

    expect([...seenFamilies]).toHaveLength(REQUIRED_MOTION_FAMILIES.length);
  });

  it("ships stable failure keys and mirrored english or japanese locale structure", () => {
    expect(core.failureKeys).toEqual(REQUIRED_FAILURE_KEYS);
    expect(Object.keys(core.localeCatalogs).sort()).toEqual(["en", "ja"]);
    expect(Object.keys(core.localeCatalogs.en.failure_messages)).toEqual(REQUIRED_FAILURE_KEYS);
    expect(Object.keys(core.localeCatalogs.ja.failure_messages)).toEqual(REQUIRED_FAILURE_KEYS);
    expect(flattenLeafPaths(core.localeCatalogs.en)).toEqual(flattenLeafPaths(core.localeCatalogs.ja));
  });

  it("keeps support messaging within the approved MVP environment boundaries", () => {
    expect(Object.keys(core.localeCatalogs.en.support_messages)).toEqual([
      "web",
      "desktop",
      "keyboard",
    ]);
    expect(Object.keys(core.localeCatalogs.en.support_messages.web)).toEqual([
      "unsupported_browser",
      "standard_mapping_required",
    ]);
    expect(Object.keys(core.localeCatalogs.en.support_messages.desktop)).toEqual([
      "unsupported_device",
    ]);
    expect(Object.keys(core.localeCatalogs.en.support_messages.keyboard)).toEqual([
      "graded_practice_unavailable",
    ]);
  });
});

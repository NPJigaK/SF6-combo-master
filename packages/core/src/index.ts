import type { BuiltInDrillCatalog } from "./contracts/drill";
import {
  type InputProfile,
  type LocaleCatalog,
  type ReferenceRuleset,
} from "./contracts/ruleset";

import coreDrillCatalogData from "./content/drills/core-v1.json";
import enLocaleData from "./content/locales/en.json";
import jaLocaleData from "./content/locales/ja.json";
import inputProfileData from "./content/profiles/sf6cm-input-profile.v1.json";
import referenceRulesetData from "./content/rulesets/sf6cm-reference-ruleset.v1.json";

export { terminalRequirementKinds, type BuiltInDrill, type BuiltInDrillCatalog } from "./contracts/drill";
export {
  failureKeys,
  motionFamilyIds,
  type FailureKey,
  type InputProfile,
  type LocaleCatalog,
  type MotionFamilyId,
  type ReferenceRuleset,
  type TerminalEvent,
} from "./contracts/ruleset";

export const referenceRuleset = referenceRulesetData as ReferenceRuleset;
export const inputProfile = inputProfileData as InputProfile;
export const coreDrillCatalog = coreDrillCatalogData as BuiltInDrillCatalog;
export const localeCatalogs = {
  en: enLocaleData as LocaleCatalog,
  ja: jaLocaleData as LocaleCatalog,
} as const;

export {
  appendInputSample,
  createFrameTimeline,
  quantizeTimestampToFrame,
  type AttackButtonToken,
  type FrameTimeline,
  type InputSample,
  type TimelineFrame,
} from "./grading/frameTimeline";
export {
  resolveDirectionState,
  type DirectionalInput,
  type ResolvedDirection,
} from "./grading/directionResolution";
export { detectTerminalEvents, type TerminalInputEvent } from "./grading/terminalEvents";
export {
  buildRecentAttemptSummaryRecord,
  gradeAttempt,
  type GradeAttemptResult,
} from "./grading/gradeAttempt";
export { selectPrimaryFailure } from "./grading/failureSelection";
export {
  buildInputHistoryView,
  type InputHistoryEntry,
  type InputHistoryView,
} from "./grading/inputHistoryView";

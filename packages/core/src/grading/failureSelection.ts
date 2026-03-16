import type { FailureKey } from "../contracts/ruleset";

const FAILURE_PRIORITY: FailureKey[] = [
  "release_not_allowed",
  "terminal_input_mismatch",
  "charge_insufficient",
  "shortcut_not_whitelisted",
  "extra_direction_break",
  "window_expired",
  "missing_step",
];

export function selectPrimaryFailure(failures: FailureKey[]): FailureKey {
  const seen = new Set(failures);

  for (const failure of FAILURE_PRIORITY) {
    if (seen.has(failure)) {
      return failure;
    }
  }

  return "missing_step";
}

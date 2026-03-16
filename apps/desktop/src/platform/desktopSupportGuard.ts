import type { SupportIssueKey } from "@sf6cm/practice-app";

export function getDesktopSupportIssues({
  isXInputDevice,
}: {
  isXInputDevice?: boolean | null;
} = {}): SupportIssueKey[] {
  if (isXInputDevice === false) {
    return ["desktop.unsupported_device"];
  }

  return [];
}

import type { SupportIssueKey } from "@sf6cm/practice-app";

function isSupportedBrowser(userAgent: string): boolean {
  const normalized = userAgent.toLowerCase();
  const isFirefox = normalized.includes("firefox");
  const isChromium = normalized.includes("chrome") || normalized.includes("chromium") || normalized.includes("edg");
  const isSafariOnly = normalized.includes("safari") && !isChromium;

  return isFirefox || (isChromium && !isSafariOnly);
}

export function getBrowserSupportIssues({
  userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "",
  mapping,
}: {
  userAgent?: string;
  mapping?: string;
} = {}): SupportIssueKey[] {
  const issues: SupportIssueKey[] = [];

  if (!isSupportedBrowser(userAgent)) {
    issues.push("web.unsupported_browser");
  }

  if (mapping && mapping !== "standard") {
    issues.push("web.standard_mapping_required");
  }

  return issues;
}

import type { GradeAttemptResult } from "@sf6cm/core";

import { getFailureMessage, getUiCopy, type SupportedLocale } from "../i18n";

export function ResultBanner({
  locale,
  result,
}: {
  locale: SupportedLocale;
  result: GradeAttemptResult | null;
}) {
  const ui = getUiCopy(locale);

  if (!result) {
    return (
      <section aria-labelledby="latest-result-title">
        <header>
          <h2 id="latest-result-title">{ui.latestResultTitle}</h2>
        </header>
        <p>{ui.waitingForAttempt}</p>
      </section>
    );
  }

  const title = result.passed ? ui.passed : ui.failed;
  const detail = result.passed
    ? result.match_kind === "shortcut"
      ? ui.shortcutTag
      : ui.canonicalTag
    : result.primary_failure_key
      ? getFailureMessage(locale, result.primary_failure_key)
      : ui.waitingForAttempt;

  return (
    <section
      aria-labelledby="latest-result-title"
      style={{
        padding: "1rem 1.1rem",
        borderRadius: "1.25rem",
        background: result.passed ? "linear-gradient(135deg, #dcfce7, #bbf7d0)" : "linear-gradient(135deg, #fee2e2, #fecaca)",
        border: result.passed ? "1px solid #4ade80" : "1px solid #f87171",
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
        <h2 id="latest-result-title" style={{ margin: 0 }}>
          {ui.latestResultTitle}
        </h2>
        <strong>{title}</strong>
      </header>
      <p style={{ margin: "0.65rem 0 0" }}>{detail}</p>
    </section>
  );
}

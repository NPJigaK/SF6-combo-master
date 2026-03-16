import { startTransition, useEffect, useState, useSyncExternalStore } from "react";

import { formatNotationTokens, getDrillTitle, getSupportMessage, getUiCopy, type SupportIssueKey } from "./i18n";
import { DrillCatalog } from "./components/DrillCatalog";
import { InputHistoryPanel } from "./components/InputHistoryPanel";
import { ResultBanner } from "./components/ResultBanner";
import { SettingsPanel } from "./components/SettingsPanel";
import { PracticeSessionController, type PracticeInputAdapter } from "./session/PracticeSessionController";
import { createLocalPracticeStorage, type PracticeStorage } from "./storage";

export function App({
  inputAdapter,
  storage = createLocalPracticeStorage(),
  supportIssues = [],
  now,
}: {
  inputAdapter: PracticeInputAdapter;
  storage?: PracticeStorage;
  supportIssues?: SupportIssueKey[];
  now?: () => string;
}) {
  const [controller] = useState(
    () =>
      new PracticeSessionController({
        inputAdapter,
        storage,
        now,
      }),
  );

  const snapshot = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getSnapshot(),
    () => controller.getSnapshot(),
  );

  useEffect(() => () => controller.dispose(), [controller]);

  const ui = getUiCopy(snapshot.locale);
  const selectedDrill = snapshot.drills.find((drill) => drill.drill_id === snapshot.selectedDrillId) ?? snapshot.drills[0];

  if (!selectedDrill) {
    return null;
  }

  const allSupportIssues = ["keyboard.graded_practice_unavailable", ...supportIssues] as const;
  const latestAttempt = snapshot.recentAttempts.at(-1) ?? null;

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "2rem",
        background:
          "radial-gradient(circle at top left, rgba(251,191,36,0.18), transparent 35%), linear-gradient(180deg, #fff7ed 0%, #fafaf9 52%, #f5f5f4 100%)",
        color: "#1c1917",
        fontFamily: '"Segoe UI", "Hiragino Sans", sans-serif',
      }}
    >
      <section
        style={{
          display: "grid",
          gap: "1.5rem",
          gridTemplateColumns: "minmax(18rem, 24rem) minmax(0, 1fr)",
          alignItems: "start",
        }}
      >
        <aside style={{ display: "grid", gap: "1rem" }}>
          <header
            style={{
              padding: "1.25rem",
              borderRadius: "1.4rem",
              background: "linear-gradient(145deg, #111827, #0f766e)",
              color: "#f8fafc",
            }}
          >
            <p style={{ margin: 0, letterSpacing: "0.08em", textTransform: "uppercase", fontSize: "0.8rem" }}>
              {ui.appTitle}
            </p>
            <h1 style={{ margin: "0.45rem 0 0.6rem", fontSize: "2rem" }}>{getDrillTitle(snapshot.locale, selectedDrill)}</h1>
            <p style={{ margin: 0, maxWidth: "36rem", color: "#d1fae5" }}>{ui.appSubtitle}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "1rem" }}>
              {formatNotationTokens(selectedDrill, snapshot.notation).map((token, index) => (
                <span
                  key={`${token}-${index}`}
                  style={{
                    padding: "0.35rem 0.6rem",
                    borderRadius: "999px",
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.16)",
                  }}
                >
                  {token}
                </span>
              ))}
            </div>
          </header>
          <SettingsPanel
            locale={snapshot.locale}
            notation={snapshot.notation}
            activeProfile={snapshot.activeProfile}
            onLocaleChange={(locale) => {
              startTransition(() => {
                controller.setLocale(locale);
              });
            }}
            onNotationChange={(notation) => {
              startTransition(() => {
                controller.setNotation(notation);
              });
            }}
          />
          <DrillCatalog
            drills={snapshot.drills}
            locale={snapshot.locale}
            selectedDrillId={snapshot.selectedDrillId}
            onSelect={(drillId) => {
              startTransition(() => {
                controller.setSelectedDrill(drillId);
              });
            }}
          />
        </aside>
        <section style={{ display: "grid", gap: "1rem" }}>
          <ResultBanner locale={snapshot.locale} result={snapshot.latestResult} />
          <section
            aria-label="support notes"
            style={{
              padding: "1rem 1.1rem",
              borderRadius: "1.25rem",
              background: "#fffbeb",
              border: "1px solid #fcd34d",
            }}
          >
            <ul style={{ margin: 0, paddingLeft: "1rem", display: "grid", gap: "0.45rem" }}>
              {allSupportIssues.map((issue) => (
                <li key={issue}>{getSupportMessage(snapshot.locale, issue)}</li>
              ))}
            </ul>
          </section>
          <InputHistoryPanel locale={snapshot.locale} view={snapshot.inputHistory} />
          <section
            aria-labelledby="recent-attempts-title"
            style={{
              padding: "1rem 1.1rem",
              borderRadius: "1.25rem",
              background: "#ffffff",
              border: "1px solid #e7e5e4",
            }}
          >
            <header style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center" }}>
              <h2 id="recent-attempts-title" style={{ margin: 0 }}>
                {ui.recentAttemptsTitle}
              </h2>
              <span>{snapshot.recentAttempts.length}</span>
            </header>
            {latestAttempt ? (
              <p style={{ margin: "0.65rem 0 0" }}>
                {latestAttempt.drill_id} · {latestAttempt.passed ? ui.passed : ui.failed}
              </p>
            ) : (
              <p style={{ margin: "0.65rem 0 0" }}>{ui.noAttemptsYet}</p>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}

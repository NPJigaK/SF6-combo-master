import type { BuiltInDrill } from "@sf6cm/core";

import { getDrillDescription, getDrillTitle, getUiCopy, type SupportedLocale } from "../i18n";

export function DrillCatalog({
  drills,
  locale,
  selectedDrillId,
  onSelect,
}: {
  drills: BuiltInDrill[];
  locale: SupportedLocale;
  selectedDrillId: string;
  onSelect: (drillId: string) => void;
}) {
  const ui = getUiCopy(locale);

  return (
    <section aria-labelledby="drill-catalog-title">
      <header>
        <p>{ui.drillCatalogTitle}</p>
        <h2 id="drill-catalog-title">{ui.drillCatalogTitle}</h2>
      </header>
      <ul style={{ display: "grid", gap: "0.75rem", padding: 0, listStyle: "none" }}>
        {drills.map((drill) => {
          const selected = drill.drill_id === selectedDrillId;

          return (
            <li key={drill.drill_id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(drill.drill_id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "0.9rem 1rem",
                  borderRadius: "1rem",
                  border: selected ? "2px solid #0f766e" : "1px solid #d6d3d1",
                  background: selected ? "#f0fdfa" : "#fffaf0",
                }}
              >
                <strong>{getDrillTitle(locale, drill)}</strong>
                <p style={{ margin: "0.35rem 0 0", color: "#57534e" }}>{getDrillDescription(locale, drill)}</p>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import comboData from "../data/jp/frame.combo.json";
import "./App.css";

type CommandToken =
  | {
      type: "text";
      value: string;
    }
  | {
      type: "icon";
      src: string;
      file: string;
      alt: string;
    };

type CommandInput = {
  commandText: string;
  iconFiles: string[];
  localIconPaths?: string[];
  tokens: CommandToken[];
};

type ComboRow = {
  index: number;
  section: string | null;
  skillName: string;
  startup: string;
  active: string;
  recovery: string;
  hitAdvantage: string;
  guardAdvantage: string;
  cancel: string;
  damage: string;
  comboCorrection: string;
  driveGaugeGainHit: string;
  driveGaugeLossGuard: string;
  driveGaugeLossPunishCounter: string;
  saGaugeGain: string;
  attribute: string;
  notes: string;
  commandInput?: CommandInput;
};

type ComboData = {
  rows: ComboRow[];
};

const parsed = comboData as ComboData;
const rows = parsed.rows ?? [];

const FIELD_ROWS: Array<{ label: string; key: keyof ComboRow }> = [
  { label: "Startup", key: "startup" },
  { label: "Active", key: "active" },
  { label: "Recovery", key: "recovery" },
  { label: "Hit Advantage", key: "hitAdvantage" },
  { label: "Guard Advantage", key: "guardAdvantage" },
  { label: "Cancel", key: "cancel" },
  { label: "Damage", key: "damage" },
  { label: "Combo Correction", key: "comboCorrection" },
  { label: "Drive Gain (Hit)", key: "driveGaugeGainHit" },
  { label: "Drive Loss (Guard)", key: "driveGaugeLossGuard" },
  { label: "Drive Loss (Punish)", key: "driveGaugeLossPunishCounter" },
  { label: "SA Gauge Gain", key: "saGaugeGain" },
  { label: "Attribute", key: "attribute" },
  { label: "Notes", key: "notes" },
];

function iconPathFromToken(token: Extract<CommandToken, { type: "icon" }>): string {
  return `/assets/controller/${token.file}`;
}

function App() {
  const sections = useMemo(() => {
    return ["ALL", ...Array.from(new Set(rows.map((row) => row.section ?? "Unsectioned")))];
  }, []);

  const [selectedSection, setSelectedSection] = useState<string>("ALL");
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(rows[0]?.index ?? -1);

  const filteredRows = useMemo(() => {
    if (selectedSection === "ALL") {
      return rows;
    }
    return rows.filter((row) => (row.section ?? "Unsectioned") === selectedSection);
  }, [selectedSection]);

  useEffect(() => {
    if (filteredRows.length === 0) {
      setSelectedRowIndex(-1);
      return;
    }

    const exists = filteredRows.some((row) => row.index === selectedRowIndex);
    if (!exists) {
      setSelectedRowIndex(filteredRows[0].index);
    }
  }, [filteredRows, selectedRowIndex]);

  const selectedRow = useMemo(() => {
    return filteredRows.find((row) => row.index === selectedRowIndex) ?? null;
  }, [filteredRows, selectedRowIndex]);

  return (
    <main className="app">
      <header className="app-header">
        <h1>SF6 Command Preview</h1>
        <p>Pick a move and verify that command icons render from combo.json + /public/assets/controller.</p>
      </header>

      <section className="controls">
        <label className="control">
          <span>Section</span>
          <select value={selectedSection} onChange={(event) => setSelectedSection(event.currentTarget.value)}>
            {sections.map((section) => (
              <option key={section} value={section}>
                {section}
              </option>
            ))}
          </select>
        </label>

        <label className="control grow">
          <span>Move</span>
          <select
            value={selectedRowIndex}
            onChange={(event) => setSelectedRowIndex(Number(event.currentTarget.value))}
            disabled={filteredRows.length === 0}
          >
            {filteredRows.map((row) => (
              <option key={row.index} value={row.index}>
                {row.skillName}
              </option>
            ))}
          </select>
        </label>
      </section>

      {selectedRow ? (
        <section className="preview">
          <div className="preview-head">
            <h2>{selectedRow.skillName}</h2>
            <span className="chip">{selectedRow.section ?? "Unsectioned"}</span>
          </div>

          <div className="command-box">
            {selectedRow.commandInput?.tokens?.length ? (
              <div className="command-strip">
                {selectedRow.commandInput.tokens.map((token, tokenIndex) => {
                  if (token.type === "text") {
                    return (
                      <span key={`text-${tokenIndex}`} className="command-text">
                        {token.value}
                      </span>
                    );
                  }

                  return (
                    <img
                      key={`icon-${tokenIndex}-${token.file}`}
                      className="command-icon"
                      src={iconPathFromToken(token)}
                      alt={token.alt || token.file}
                      loading="lazy"
                    />
                  );
                })}
              </div>
            ) : (
              <p className="empty">No command token in this row.</p>
            )}
            <code className="command-raw">{selectedRow.commandInput?.commandText ?? "(no commandText)"}</code>
          </div>

          <dl className="stats-grid">
            {FIELD_ROWS.map((field) => (
              <div key={field.key} className="stats-item">
                <dt>{field.label}</dt>
                <dd>{(selectedRow[field.key] as string) || "-"}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : (
        <p className="empty">No rows in the selected section.</p>
      )}
    </main>
  );
}

export default App;

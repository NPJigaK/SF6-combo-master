import { useEffect, useMemo, useState } from "react";

type CommandToken =
  | {
      type: "text";
      value?: string;
    }
  | {
      type: "icon";
      src?: string;
      file?: string;
      alt?: string;
    };

type CommandInput = {
  commandText?: string;
  iconFiles?: string[];
  localIconPaths?: string[];
  tokens?: CommandToken[];
};

type SupercomboUnique = {
  hitconfirm?: string;
  punishAdv?: string;
  perfparryAdv?: string;
  drCancelOnhit?: string;
  drCancelOnblock?: string;
  afterDrOnhit?: string;
  afterDrOnblock?: string;
  hitstun?: string;
  blockstun?: string;
  hitstop?: string;
  chip?: string;
  invuln?: string;
  armor?: string;
  airborne?: string;
  range?: string;
  juggleStart?: string;
  juggleIncrease?: string;
  juggleLimit?: string;
};

type SupercomboExtras = {
  matched?: boolean;
  general?: {
    hitconfirm?: string | null;
  } | null;
  details?: {
    punishAdv?: string | null;
    perfparryAdv?: string | null;
    drCancelOnhit?: string | null;
    drCancelOnblock?: string | null;
    afterDrOnhit?: string | null;
    afterDrOnblock?: string | null;
    hitstun?: string | null;
    blockstun?: string | null;
    hitstop?: string | null;
    chip?: string | null;
  } | null;
  properties?: {
    invuln?: string | null;
    armor?: string | null;
    airborne?: string | null;
    range?: string | null;
    juggleStart?: string | null;
    juggleIncrease?: string | null;
    juggleLimit?: string | null;
  } | null;
};

type ComboRow = {
  moveId: string;
  rowIndex: number;
  sectionHeading: string;
  moveName: string;
  moveNameEn: string;
  startUpFrame: string;
  activeFrame: string;
  recoveryFrame: string;
  hitRecovery: string;
  blockRecovery: string;
  cancel: string;
  damage: string;
  comboScaling: string;
  hitDriveGaugeIncrease: string;
  blockDriveGaugeDecrease: string;
  punishCounterDriveGaugeDecrease: string;
  superArtGaugeIncrease: string;
  properties: string;
  miscellaneous: string;
  commandInput?: CommandInput;
  supercomboUnique: SupercomboUnique;
};

type ComboData = {
  moves?: Array<{
    moveId: string;
    official?: {
      rowIndex: number;
      sectionHeading: string | null;
      moveName: string;
      command?: CommandInput;
      columns?: Partial<
        Pick<
          ComboRow,
          | "moveName"
          | "startUpFrame"
          | "activeFrame"
          | "recoveryFrame"
          | "hitRecovery"
          | "blockRecovery"
          | "cancel"
          | "damage"
          | "comboScaling"
          | "hitDriveGaugeIncrease"
          | "blockDriveGaugeDecrease"
          | "punishCounterDriveGaugeDecrease"
          | "superArtGaugeIncrease"
          | "properties"
          | "miscellaneous"
        >
      >;
      localization?: {
        ja?: {
          moveName?: string;
          comboScaling?: string;
          properties?: string;
          miscellaneous?: string;
        };
      };
    };
    supercomboExtras?: SupercomboExtras;
  }>;
};

type MasterMove = NonNullable<ComboData["moves"]>[number];

function toSectionLabel(sectionHeading: string | null): string {
  return sectionHeading ?? "Unsectioned";
}

function sanitizeText(rawValue: string | null | undefined): string | undefined {
  const value = rawValue?.trim();
  if (!value) {
    return undefined;
  }
  return value;
}

function pickSupercomboUnique(supercomboExtras: SupercomboExtras | undefined): SupercomboUnique {
  const unique: SupercomboUnique = {};
  if (supercomboExtras?.matched !== true) {
    return unique;
  }

  const addValue = <K extends keyof SupercomboUnique>(key: K, rawValue: string | null | undefined): void => {
    const value = sanitizeText(rawValue);
    if (value) {
      unique[key] = value;
    }
  };

  addValue("hitconfirm", supercomboExtras.general?.hitconfirm);
  addValue("punishAdv", supercomboExtras.details?.punishAdv);
  addValue("perfparryAdv", supercomboExtras.details?.perfparryAdv);
  addValue("drCancelOnhit", supercomboExtras.details?.drCancelOnhit);
  addValue("drCancelOnblock", supercomboExtras.details?.drCancelOnblock);
  addValue("afterDrOnhit", supercomboExtras.details?.afterDrOnhit);
  addValue("afterDrOnblock", supercomboExtras.details?.afterDrOnblock);
  addValue("hitstun", supercomboExtras.details?.hitstun);
  addValue("blockstun", supercomboExtras.details?.blockstun);
  addValue("hitstop", supercomboExtras.details?.hitstop);
  addValue("chip", supercomboExtras.details?.chip);
  addValue("invuln", supercomboExtras.properties?.invuln);
  addValue("armor", supercomboExtras.properties?.armor);
  addValue("airborne", supercomboExtras.properties?.airborne);
  addValue("range", supercomboExtras.properties?.range);
  addValue("juggleStart", supercomboExtras.properties?.juggleStart);
  addValue("juggleIncrease", supercomboExtras.properties?.juggleIncrease);
  addValue("juggleLimit", supercomboExtras.properties?.juggleLimit);

  return unique;
}

function toComboRow(move: MasterMove): ComboRow | null {
  const official = move?.official;
  if (!official) {
    return null;
  }

  const columns = official.columns ?? {};
  const ja = official.localization?.ja;
  return {
    moveId: move.moveId,
    rowIndex: official.rowIndex,
    sectionHeading: toSectionLabel(official.sectionHeading ?? null),
    moveName: ja?.moveName || official.moveName,
    moveNameEn: official.moveName,
    startUpFrame: columns.startUpFrame ?? "",
    activeFrame: columns.activeFrame ?? "",
    recoveryFrame: columns.recoveryFrame ?? "",
    hitRecovery: columns.hitRecovery ?? "",
    blockRecovery: columns.blockRecovery ?? "",
    cancel: columns.cancel ?? "",
    damage: columns.damage ?? "",
    comboScaling: ja?.comboScaling || columns.comboScaling || "",
    hitDriveGaugeIncrease: columns.hitDriveGaugeIncrease ?? "",
    blockDriveGaugeDecrease: columns.blockDriveGaugeDecrease ?? "",
    punishCounterDriveGaugeDecrease: columns.punishCounterDriveGaugeDecrease ?? "",
    superArtGaugeIncrease: columns.superArtGaugeIncrease ?? "",
    properties: ja?.properties || columns.properties || "",
    miscellaneous: ja?.miscellaneous || columns.miscellaneous || "",
    commandInput: official.command,
    supercomboUnique: pickSupercomboUnique(move.supercomboExtras),
  };
}

function parseCharacterIdFromMasterPath(path: string): string | null {
  const match = path.match(/\/data\/([^/]+)\/moves\.master\.json$/);
  return match?.[1] ?? null;
}

const masterModules = import.meta.glob("../../../data/*/moves.master.json", {
  eager: true,
  import: "default",
}) as Record<string, ComboData>;

const rowsByCharacter = new Map<string, ComboRow[]>();
for (const [path, rawData] of Object.entries(masterModules)) {
  const characterId = parseCharacterIdFromMasterPath(path);
  if (!characterId) {
    continue;
  }

  const rows = (rawData.moves ?? [])
    .map((move) => toComboRow(move))
    .filter((row): row is ComboRow => row !== null)
    .sort((left, right) => left.rowIndex - right.rowIndex);

  rowsByCharacter.set(characterId, rows);
}

const FIELD_ROWS: Array<{ label: string; key: keyof ComboRow }> = [
  { label: "Startup (Frames)", key: "startUpFrame" },
  { label: "Active (Frames)", key: "activeFrame" },
  { label: "Recovery (Frames)", key: "recoveryFrame" },
  { label: "Hit Recovery", key: "hitRecovery" },
  { label: "Block Recovery", key: "blockRecovery" },
  { label: "Cancel", key: "cancel" },
  { label: "Damage", key: "damage" },
  { label: "Combo Scaling", key: "comboScaling" },
  { label: "Drive Gain (Hit)", key: "hitDriveGaugeIncrease" },
  { label: "Drive Loss (Block)", key: "blockDriveGaugeDecrease" },
  { label: "Drive Loss (Punish Counter)", key: "punishCounterDriveGaugeDecrease" },
  { label: "SA Gain", key: "superArtGaugeIncrease" },
  { label: "Properties", key: "properties" },
  { label: "Misc", key: "miscellaneous" },
];

const SUPERCOMBO_UNIQUE_FIELDS: Array<{ label: string; key: keyof SupercomboUnique }> = [
  { label: "Hitconfirm", key: "hitconfirm" },
  { label: "Punish Adv", key: "punishAdv" },
  { label: "Perfect Parry Adv", key: "perfparryAdv" },
  { label: "DR Cancel Adv (Hit)", key: "drCancelOnhit" },
  { label: "DR Cancel Adv (Block)", key: "drCancelOnblock" },
  { label: "After DR Adv (Hit)", key: "afterDrOnhit" },
  { label: "After DR Adv (Block)", key: "afterDrOnblock" },
  { label: "Hitstun", key: "hitstun" },
  { label: "Blockstun", key: "blockstun" },
  { label: "Hitstop", key: "hitstop" },
  { label: "Chip", key: "chip" },
  { label: "Invuln", key: "invuln" },
  { label: "Armor", key: "armor" },
  { label: "Airborne", key: "airborne" },
  { label: "Range", key: "range" },
  { label: "Juggle Start", key: "juggleStart" },
  { label: "Juggle Increase", key: "juggleIncrease" },
  { label: "Juggle Limit", key: "juggleLimit" },
];

function iconPathFromToken(token: Extract<CommandToken, { type: "icon" }>): string {
  if (token.file) {
    return `/assets/controller/${token.file}`;
  }
  return token.src ?? "";
}

export function MoveBrowserFeature({ characterId }: { characterId: string }) {
  const rows = useMemo(() => {
    return rowsByCharacter.get(characterId) ?? [];
  }, [characterId]);

  const sections = useMemo(() => {
    return ["All", ...Array.from(new Set(rows.map((row) => row.sectionHeading)))];
  }, [rows]);

  const [selectedSection, setSelectedSection] = useState<string>("All");
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(-1);

  useEffect(() => {
    setSelectedSection("All");
    setSelectedRowIndex(-1);
  }, [characterId]);

  const filteredRows = useMemo(() => {
    if (selectedSection === "All") {
      return rows;
    }
    return rows.filter((row) => row.sectionHeading === selectedSection);
  }, [selectedSection]);

  useEffect(() => {
    if (filteredRows.length === 0) {
      setSelectedRowIndex(-1);
      return;
    }

    const exists = filteredRows.some((row) => row.rowIndex === selectedRowIndex);
    if (!exists) {
      setSelectedRowIndex(filteredRows[0].rowIndex);
    }
  }, [filteredRows, selectedRowIndex]);

  const selectedRow = useMemo(() => {
    return filteredRows.find((row) => row.rowIndex === selectedRowIndex) ?? null;
  }, [filteredRows, selectedRowIndex]);

  const selectedSupercomboFields = useMemo(() => {
    if (!selectedRow) {
      return [];
    }

    return SUPERCOMBO_UNIQUE_FIELDS.filter((field) => Boolean(selectedRow.supercomboUnique[field.key]));
  }, [selectedRow]);

  return (
    <>
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
              <option key={row.rowIndex} value={row.rowIndex}>
                {row.moveName}
              </option>
            ))}
          </select>
        </label>
      </section>

      {selectedRow ? (
        <section className="preview">
          <div className="preview-head">
            <h2>{selectedRow.moveName}</h2>
            <span className="chip">{selectedRow.sectionHeading}</span>
          </div>

          {selectedRow.moveNameEn && selectedRow.moveNameEn !== selectedRow.moveName ? (
            <p className="command-raw">{selectedRow.moveNameEn}</p>
          ) : null}

          <div className="command-box">
            {selectedRow.commandInput?.tokens?.length ? (
              <div className="command-strip">
                {selectedRow.commandInput.tokens.map((token, tokenIndex) => {
                  if (token.type === "text") {
                    return (
                      <span key={`text-${tokenIndex}`} className="command-text">
                        {token.value ?? ""}
                      </span>
                    );
                  }

                  return (
                    <img
                      key={`icon-${tokenIndex}-${token.file ?? token.src ?? "icon"}`}
                      className="command-icon"
                      src={iconPathFromToken(token)}
                      alt={token.alt || token.file || "icon"}
                      loading="lazy"
                    />
                  );
                })}
              </div>
            ) : (
              <p className="empty">No command tokens available.</p>
            )}

            <code className="command-raw">{selectedRow.commandInput?.commandText ?? ""}</code>
          </div>

          <dl className="stats-grid">
            {FIELD_ROWS.map((field) => (
              <div key={field.key} className="stats-item">
                <dt>{field.label}</dt>
                <dd>{(selectedRow[field.key] as string) || "-"}</dd>
              </div>
            ))}
          </dl>

          <section className="supercombo-unique">
            <h3>Supercombo Extras</h3>
            {selectedSupercomboFields.length ? (
              <dl className="stats-grid">
                {selectedSupercomboFields.map((field) => (
                  <div key={field.key} className="stats-item">
                    <dt>{field.label}</dt>
                    <dd>{selectedRow.supercomboUnique[field.key]}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="empty">No extra fields matched.</p>
            )}
          </section>
        </section>
      ) : (
        <p className="empty">{`No move found for ${characterId.toUpperCase()}.`}</p>
      )}
    </>
  );
}

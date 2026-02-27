import { useEffect, useMemo, useState } from "react";
import masterData from "../data/jp/moves.master.json";
import trialM2 from "../data/trials/jp/m2-crouch-lp-stand-lp-light-stribog.combo-trial.json";
import trialM3 from "../data/trials/jp/m3-lp-lp-cancel-lp-crouch-mp-medium-stribog.combo-trial.json";
import trialM4 from "../data/trials/jp/m4-lp-lp-cancel-lp-back-mp-target-medium-stribog.combo-trial.json";
import trialM5 from "../data/trials/jp/m5-corner-route-strong-vihat.combo-trial.json";
import trialM6 from "../data/trials/jp/m6-corner-route-od-vihat.combo-trial.json";
import { TrialRunnerPanel } from "./components/TrialRunnerPanel";
import type { ComboTrial } from "./domain/trial/schema";
import "./App.css";

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
  commandText: string;
  iconFiles: string[];
  localIconPaths?: string[];
  tokens: CommandToken[];
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
  rowIndex: number;
  sectionHeading: string | null;
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

type TrialOption = {
  id: string;
  label: string;
  trial: ComboTrial;
};

function toSectionLabel(sectionHeading: string | null): string {
  const key = sectionHeading ?? "Unsectioned";
  const map: Record<string, string> = {
    "Normal Moves": "通常技",
    "Unique Attacks": "特殊技",
    "Target Combos": "ターゲットコンボ",
    "Special Moves": "必殺技",
    "Super Arts": "スーパーアーツ",
    Throws: "投げ",
    "Common Moves": "共通システム",
    Unsectioned: "未分類",
  };
  return map[key] ?? key;
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

const parsed = masterData as ComboData;
const rows = (parsed.moves ?? [])
  .map((move) => toComboRow(move))
  .filter((row): row is ComboRow => row !== null)
  .sort((left, right) => left.rowIndex - right.rowIndex);
const TRIAL_OPTIONS: TrialOption[] = [
  { id: (trialM2 as ComboTrial).id, label: (trialM2 as ComboTrial).name, trial: trialM2 as ComboTrial },
  { id: (trialM3 as ComboTrial).id, label: (trialM3 as ComboTrial).name, trial: trialM3 as ComboTrial },
  { id: (trialM4 as ComboTrial).id, label: (trialM4 as ComboTrial).name, trial: trialM4 as ComboTrial },
  { id: (trialM5 as ComboTrial).id, label: (trialM5 as ComboTrial).name, trial: trialM5 as ComboTrial },
  { id: (trialM6 as ComboTrial).id, label: (trialM6 as ComboTrial).name, trial: trialM6 as ComboTrial },
];

const FIELD_ROWS: Array<{ label: string; key: keyof ComboRow }> = [
  { label: "発生 (Frame)", key: "startUpFrame" },
  { label: "持続 (Frame)", key: "activeFrame" },
  { label: "全体/硬直 (Frame)", key: "recoveryFrame" },
  { label: "ヒット時 (Recovery)", key: "hitRecovery" },
  { label: "ガード時 (Recovery)", key: "blockRecovery" },
  { label: "キャンセル", key: "cancel" },
  { label: "ダメージ", key: "damage" },
  { label: "コンボ補正", key: "comboScaling" },
  { label: "Drive増加 (Hit)", key: "hitDriveGaugeIncrease" },
  { label: "Drive減少 (Block)", key: "blockDriveGaugeDecrease" },
  { label: "Drive減少 (Punish Counter)", key: "punishCounterDriveGaugeDecrease" },
  { label: "SAゲージ増加", key: "superArtGaugeIncrease" },
  { label: "属性", key: "properties" },
  { label: "備考", key: "miscellaneous" },
];

const SUPERCOMBO_UNIQUE_FIELDS: Array<{ label: string; key: keyof SupercomboUnique }> = [
  { label: "ヒット確認猶予", key: "hitconfirm" },
  { label: "Punish時有利", key: "punishAdv" },
  { label: "ジャストパリィ後有利", key: "perfparryAdv" },
  { label: "DRキャンセル時有利 (ヒット)", key: "drCancelOnhit" },
  { label: "DRキャンセル時有利 (ガード)", key: "drCancelOnblock" },
  { label: "DR後有利 (ヒット)", key: "afterDrOnhit" },
  { label: "DR後有利 (ガード)", key: "afterDrOnblock" },
  { label: "ヒット硬直", key: "hitstun" },
  { label: "ガード硬直", key: "blockstun" },
  { label: "ヒットストップ", key: "hitstop" },
  { label: "削り", key: "chip" },
  { label: "無敵", key: "invuln" },
  { label: "アーマー", key: "armor" },
  { label: "空中判定", key: "airborne" },
  { label: "リーチ", key: "range" },
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

function App() {
  const sections = useMemo(() => {
    return ["すべて", ...Array.from(new Set(rows.map((row) => row.sectionHeading ?? "未分類")))];
  }, []);

  const [selectedTrialId, setSelectedTrialId] = useState<string>(TRIAL_OPTIONS[0]?.id ?? "");
  const [selectedSection, setSelectedSection] = useState<string>("すべて");
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(rows[0]?.rowIndex ?? -1);

  const selectedTrial = useMemo(() => {
    return TRIAL_OPTIONS.find((option) => option.id === selectedTrialId)?.trial ?? TRIAL_OPTIONS[0]?.trial ?? null;
  }, [selectedTrialId]);

  const filteredRows = useMemo(() => {
    if (selectedSection === "すべて") {
      return rows;
    }
    return rows.filter((row) => (row.sectionHeading ?? "未分類") === selectedSection);
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
    <main className="app">
      <header className="app-header">
        <h1>SF6 技データプレビュー</h1>
        <p>moves.master.json を参照して、技入力とフレーム情報を表示します。</p>
      </header>

      <section className="controls">
        <label className="control grow">
          <span>トライアル</span>
          <select value={selectedTrialId} onChange={(event) => setSelectedTrialId(event.currentTarget.value)}>
            {TRIAL_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="control">
          <span>分類</span>
          <select value={selectedSection} onChange={(event) => setSelectedSection(event.currentTarget.value)}>
            {sections.map((section) => (
              <option key={section} value={section}>
                {section}
              </option>
            ))}
          </select>
        </label>

        <label className="control grow">
          <span>技</span>
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

      {selectedTrial ? <TrialRunnerPanel trial={selectedTrial} frameRows={rows} /> : <p className="empty">トライアルデータがありません。</p>}

      {selectedRow ? (
        <section className="preview">
          <div className="preview-head">
            <h2>{selectedRow.moveName}</h2>
            <span className="chip">{selectedRow.sectionHeading ?? "未分類"}</span>
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
              <p className="empty">この技にはコマンド表示がありません。</p>
            )}
            <code className="command-raw">{selectedRow.commandInput?.commandText ?? "（commandText なし）"}</code>
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
            <h3>Supercombo独自データ</h3>
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
              <p className="empty">この技にはSupercombo独自データがありません。</p>
            )}
          </section>
        </section>
      ) : (
        <p className="empty">選択中の分類に技データがありません。</p>
      )}
    </main>
  );
}

export default App;

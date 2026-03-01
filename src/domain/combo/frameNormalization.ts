export type FrameDataTier = "A" | "B";

export type TriState = true | false | "unknown";

export type FrameValueSource = {
  tier: FrameDataTier;
  source: string;
};

export type NormalizedKnownValue<T> = {
  status: "known";
  value: T;
  raw: string | null;
  source: FrameValueSource;
};

export type NormalizedUnknownValue = {
  status: "unknown";
  value: null;
  raw: string | null;
  source: FrameValueSource;
  unknownReason: string;
};

export type NormalizedValue<T> = NormalizedKnownValue<T> | NormalizedUnknownValue;

export type NormalizedCancelValue = {
  source: FrameValueSource;
  raw: string | null;
  special: TriState;
  super: TriState;
  dr: TriState;
  unknownReason?: string;
};

export type NormalizedFrameTierData = {
  tier: FrameDataTier;
  startup: NormalizedValue<number>;
  onHitAdv: NormalizedValue<number>;
  onBlockAdv: NormalizedValue<number>;
  cancel: NormalizedCancelValue;
  misc: NormalizedValue<string>;
};

export type NormalizedMoveFrame = {
  moveId: string;
  tierA: NormalizedFrameTierData;
  tierB?: NormalizedFrameTierData;
};

export type OfficialFrameColumns = {
  startUpFrame?: string | null;
  hitRecovery?: string | null;
  blockRecovery?: string | null;
  cancel?: string | null;
  miscellaneous?: string | null;
};

export type SupercomboFrameExtras = {
  notes?: {
    rawText?: string | null;
  } | null;
};

export type NormalizeMoveFrameInput = {
  moveId: string;
  officialColumns?: OfficialFrameColumns | null;
  supercomboExtras?: SupercomboFrameExtras | null;
  sources?: {
    tierA?: string;
    tierB?: string;
  };
};

const SUPER_CANCEL_TOKENS = new Set(["SA", "SA1", "SA2", "SA3"]);

function sanitizeCellValue(rawValue: string | null | undefined): string | null {
  const trimmed = rawValue?.trim();
  return trimmed ? trimmed : null;
}

function createKnownValue<T>(source: FrameValueSource, raw: string | null, value: T): NormalizedKnownValue<T> {
  return {
    status: "known",
    value,
    raw,
    source,
  };
}

function createUnknownValue(source: FrameValueSource, raw: string | null, unknownReason: string): NormalizedUnknownValue {
  return {
    status: "unknown",
    value: null,
    raw,
    source,
    unknownReason,
  };
}

function isRangeNotation(value: string): boolean {
  return /^\d+\s*-\s*\d+$/.test(value);
}

function isSignedInteger(value: string): boolean {
  return /^[+-]?\d+$/.test(value);
}

function toFieldSource(tier: FrameDataTier, sourceBase: string, field: string): FrameValueSource {
  return {
    tier,
    source: `${sourceBase}.${field}`,
  };
}

function setUnknownIfNotConfirmed(current: TriState): TriState {
  return current === true ? true : "unknown";
}

export function parseFrameNumberCell(rawValue: string | null | undefined, source: FrameValueSource): NormalizedValue<number> {
  const value = sanitizeCellValue(rawValue);
  if (value === null) {
    return createUnknownValue(source, value, "empty");
  }

  if (isSignedInteger(value)) {
    return createKnownValue(source, value, Number.parseInt(value, 10));
  }

  if (/^d$/i.test(value)) {
    return createUnknownValue(source, value, "knockdown_notation");
  }

  if (/total\s*frames?/i.test(value)) {
    return createUnknownValue(source, value, "total_frames_notation");
  }

  if (isRangeNotation(value)) {
    return createUnknownValue(source, value, "range_notation");
  }

  return createUnknownValue(source, value, "non_numeric");
}

export function parseCancelCell(rawValue: string | null | undefined, source: FrameValueSource): NormalizedCancelValue {
  const value = sanitizeCellValue(rawValue);
  if (value === null || value === "-") {
    return {
      source,
      raw: value,
      special: false,
      super: false,
      dr: false,
    };
  }

  const tokens = value
    .toUpperCase()
    .split(/[\s/+,|]+/)
    .filter(Boolean);

  let special: TriState = false;
  let superState: TriState = false;
  let dr: TriState = false;
  const unknownReasons = new Set<string>();

  for (const token of tokens) {
    if (token === "C") {
      special = true;
      superState = true;
      dr = true;
      continue;
    }

    if (SUPER_CANCEL_TOKENS.has(token)) {
      superState = true;
      continue;
    }

    if (token === "*") {
      special = setUnknownIfNotConfirmed(special);
      superState = setUnknownIfNotConfirmed(superState);
      dr = setUnknownIfNotConfirmed(dr);
      unknownReasons.add("wildcard_cancel_destination");
      continue;
    }

    if (token === "-") {
      continue;
    }

    special = setUnknownIfNotConfirmed(special);
    superState = setUnknownIfNotConfirmed(superState);
    dr = setUnknownIfNotConfirmed(dr);
    unknownReasons.add(`unsupported_cancel_token:${token}`);
  }

  return {
    source,
    raw: value,
    special,
    super: superState,
    dr,
    unknownReason: unknownReasons.size > 0 ? [...unknownReasons].join(",") : undefined,
  };
}

function parseMiscCell(rawValue: string | null | undefined, source: FrameValueSource): NormalizedValue<string> {
  const value = sanitizeCellValue(rawValue);
  if (value === null) {
    return createUnknownValue(source, value, "empty");
  }
  return createKnownValue(source, value, value);
}

function createTierBUnavailableNumber(source: FrameValueSource, rawValue: string | null | undefined): NormalizedValue<number> {
  return createUnknownValue(source, sanitizeCellValue(rawValue), "tier_b_value_unavailable");
}

export function normalizeTierAFrameData(
  columns: OfficialFrameColumns | null | undefined,
  sourceBase = "official.columns",
): NormalizedFrameTierData {
  return {
    tier: "A",
    startup: parseFrameNumberCell(columns?.startUpFrame, toFieldSource("A", sourceBase, "startUpFrame")),
    onHitAdv: parseFrameNumberCell(columns?.hitRecovery, toFieldSource("A", sourceBase, "hitRecovery")),
    onBlockAdv: parseFrameNumberCell(columns?.blockRecovery, toFieldSource("A", sourceBase, "blockRecovery")),
    cancel: parseCancelCell(columns?.cancel, toFieldSource("A", sourceBase, "cancel")),
    misc: parseMiscCell(columns?.miscellaneous, toFieldSource("A", sourceBase, "miscellaneous")),
  };
}

export function normalizeTierBFrameData(
  extras: SupercomboFrameExtras | null | undefined,
  sourceBase = "supercomboExtras",
): NormalizedFrameTierData {
  return {
    tier: "B",
    startup: createTierBUnavailableNumber(toFieldSource("B", sourceBase, "startup"), null),
    onHitAdv: createTierBUnavailableNumber(toFieldSource("B", sourceBase, "onHitAdv"), null),
    onBlockAdv: createTierBUnavailableNumber(toFieldSource("B", sourceBase, "onBlockAdv"), null),
    cancel: {
      source: toFieldSource("B", sourceBase, "cancel"),
      raw: null,
      special: "unknown",
      super: "unknown",
      dr: "unknown",
      unknownReason: "tier_b_value_unavailable",
    },
    misc: parseMiscCell(extras?.notes?.rawText, toFieldSource("B", sourceBase, "notes.rawText")),
  };
}

export function normalizeMoveFrame(input: NormalizeMoveFrameInput): NormalizedMoveFrame {
  const tierA = normalizeTierAFrameData(input.officialColumns, input.sources?.tierA ?? "official.columns");
  const tierB = input.supercomboExtras
    ? normalizeTierBFrameData(input.supercomboExtras, input.sources?.tierB ?? "supercomboExtras")
    : undefined;

  return {
    moveId: input.moveId,
    tierA,
    tierB,
  };
}

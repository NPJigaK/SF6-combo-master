export type NormalizedStartup =
  | {
      kind: "frames";
      value: number;
      raw: string;
    }
  | {
      kind: "unknown";
      raw: string;
    };

export type NormalizedHitAdvantage =
  | {
      kind: "frames";
      value: number;
      raw: string;
    }
  | {
      kind: "knockdown";
      raw: string;
    }
  | {
      kind: "unknown";
      raw: string;
    };

export type FrameComboRowLike = {
  index: number;
  skillName: string;
  startup: string;
  hitAdvantage: string;
};

function parseInteger(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^[-+]?\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}

export function normalizeStartup(rawValue: string): NormalizedStartup {
  const raw = String(rawValue ?? "").trim();
  const parsed = parseInteger(raw);
  if (parsed === null || parsed < 0) {
    return {
      kind: "unknown",
      raw,
    };
  }

  return {
    kind: "frames",
    value: parsed,
    raw,
  };
}

export function normalizeHitAdvantage(rawValue: string): NormalizedHitAdvantage {
  const raw = String(rawValue ?? "").trim();
  const parsed = parseInteger(raw);
  if (parsed !== null) {
    return {
      kind: "frames",
      value: parsed,
      raw,
    };
  }

  // In this dataset, "D" is treated as knockdown-style outcome.
  if (raw.toUpperCase() === "D") {
    return {
      kind: "knockdown",
      raw,
    };
  }

  return {
    kind: "unknown",
    raw,
  };
}

export function createFrameComboRowIndex(rows: readonly FrameComboRowLike[]): Map<number, FrameComboRowLike> {
  const index = new Map<number, FrameComboRowLike>();
  for (const row of rows) {
    index.set(row.index, row);
  }
  return index;
}

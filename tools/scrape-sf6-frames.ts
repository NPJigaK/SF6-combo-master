import { existsSync } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { PlaywrightCrawler, RequestQueue, log } from 'crawlee';
import { chromium, type BrowserContext, type Page } from 'playwright';

const EN_TARGET_URL = 'https://www.streetfighter.com/6/en-us/character/jp/frame';
const JA_TARGET_URL = 'https://www.streetfighter.com/6/ja-jp/character/jp/frame';

const ARTIFACT_EN_DIR = path.join('artifacts', 'jp', 'frame');
const ARTIFACT_JA_DIR = path.join('artifacts', 'jp', 'frame-ja');
const DATA_DIR = path.join('data', 'jp');

const RAW_JSON_PATH = path.join(DATA_DIR, 'frame.raw.json');
const JA_MAP_JSON_PATH = path.join(DATA_DIR, 'frame.ja-map.json');
const PUBLIC_CONTROLLER_BASE_PATH = '/assets/controller';
const FIXED_CELL_COUNT = 15;

type Locale = 'en-us' | 'ja-jp';

type ResponseEntry = {
  url: string;
  status: number;
  method: string;
  resourceType: string;
};

type CommandInput = {
  commandText: string;
  iconPaths: string[];
  iconFiles: string[];
  iconAlts: string[];
  localIconPaths?: string[];
  tokens: Array<
    | {
        type: 'text';
        value: string;
      }
    | {
        type: 'icon';
        src: string;
        file: string;
        alt: string;
      }
  >;
};

type RawRow = {
  index: number;
  text: string;
  cells: string[];
  cellCount?: number;
  nonEmptyCellCount?: number;
  rowKind?: 'data' | 'section' | 'note' | 'other';
  skillName?: string;
  commandInput?: CommandInput;
};

type RawOutputRow = {
  rowIndex: number;
  rowText: string;
  cellTexts: string[];
  totalCellCount?: number;
  nonEmptyCellCount?: number;
  rowType?: RawRow['rowKind'];
  moveName?: string;
  commandInput?: CommandInput;
};

type HeaderColumn = {
  columnIndex: number;
  label: string;
  parentLabel: string | null;
  leafLabel: string;
  description: string;
};

type ColumnDefinition = {
  columnIndex: number;
  label: string;
  key: string;
  parentLabel: string | null;
  leafLabel: string;
  description: string;
};

type Candidate = {
  id: string;
  kind: 'table' | 'role-grid' | 'repeating-block';
  headingGuess: string;
  rowCount: number;
  previewRows: string[];
  score: number;
  selectorHint: string;
  rows: RawRow[];
  headerColumns: string[];
  headerDetails: HeaderColumn[];
};

type ComboRow = {
  rowIndex: number;
  sectionHeading: string | null;
  moveName: string;
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
  sourceRow: {
    rowType?: RawRow['rowKind'];
    totalCellCount?: number;
    nonEmptyCellCount?: number;
    cellTexts: string[];
  };
};

type HarCaptureResult = {
  finalUrl: string;
  responses: ResponseEntry[];
  harCaptured: boolean;
  harError?: string;
};

type LocaleConfig = {
  locale: Locale;
  targetUrl: string;
  artifactDir: string;
};

type ScrapeLocaleOptions = {
  canonicalColumnDefinitions?: ColumnDefinition[];
};

type ArtifactPaths = {
  pageHtmlPath: string;
  pagePngPath: string;
  networkHarPath: string;
  networkHarLogPath: string;
  networkResponsesPath: string;
  tablesPreviewPath: string;
  rawExtractedPath: string;
  comboExtractedPath: string;
};

type LocaleScrapeResult = {
  locale: Locale;
  targetUrl: string;
  finalUrl: string;
  capturedAt: string;
  harCaptured: boolean;
  harError?: string;
  extractionError?: string;
  bestCandidateId: string | null;
  candidateCount: number;
  headerColumns: string[];
  columnDefinitions: ColumnDefinition[];
  headerDetails: HeaderColumn[];
  glossary: Record<string, string>;
  rawRows: RawOutputRow[];
  comboRows: ComboRow[];
};

type JaMapRow = {
  rowIndex: number;
  moveName: string;
  comboScaling: string;
  properties: string;
  miscellaneous: string;
};

function buildArtifactPaths(artifactDir: string): ArtifactPaths {
  return {
    pageHtmlPath: path.join(artifactDir, 'page.html'),
    pagePngPath: path.join(artifactDir, 'page.png'),
    networkHarPath: path.join(artifactDir, 'network.har'),
    networkHarLogPath: path.join(artifactDir, 'network.har.log.txt'),
    networkResponsesPath: path.join(artifactDir, 'network.responses.jsonl'),
    tablesPreviewPath: path.join(artifactDir, 'tables.preview.json'),
    rawExtractedPath: path.join(artifactDir, 'raw.extracted.json'),
    comboExtractedPath: path.join(artifactDir, 'combo.extracted.json'),
  };
}

async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function writeText(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, content, 'utf8');
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

async function waitForFrameCandidates(page: Page, timeoutMs = 25_000): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => {
        if (document.querySelector('table,[role="table"],[role="grid"]')) {
          return true;
        }

        const rowCount = document.querySelectorAll('tr,[role="row"],li,.row').length;
        if (rowCount >= 3) {
          return true;
        }

        const repeating = Array.from(document.querySelectorAll('section,article,div')).some((el) => {
          const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
          const rows = el.querySelectorAll(':scope > div,:scope > li,:scope > [role="row"],:scope > ul > li').length;
          return rows >= 3 && text.length > 40;
        });
        return repeating;
      },
      { timeout: timeoutMs },
    );
    return true;
  } catch {
    return false;
  }
}

async function writeResponsesJsonl(filePath: string, entries: ResponseEntry[]): Promise<void> {
  const lines = entries.map((entry) => JSON.stringify(entry)).join('\n');
  const trailingNewline = lines.length > 0 ? '\n' : '';
  await writeText(filePath, `${lines}${trailingNewline}`);
}

async function captureHarArtifact(config: LocaleConfig, paths: ArtifactPaths): Promise<HarCaptureResult> {
  const responses: ResponseEntry[] = [];
  let finalUrl = config.targetUrl;
  let harCaptured = false;
  let harError: string | undefined;

  const browser = await chromium.launch({ headless: true });
  let context: BrowserContext | undefined;

  try {
    context = await browser.newContext({
      recordHar: {
        path: paths.networkHarPath,
        mode: 'minimal',
      },
    });

    const page = await context.newPage();
    page.on('response', (response) => {
      responses.push({
        url: response.url(),
        status: response.status(),
        method: response.request().method(),
        resourceType: response.request().resourceType(),
      });
    });

    await page.goto(config.targetUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await waitForFrameCandidates(page);
    finalUrl = page.url();

    try {
      await page.waitForLoadState('networkidle', { timeout: 6_000 });
    } catch {
      // Keep moving in PoC mode
    }
  } catch (error) {
    harError = `HAR capture failed: ${toErrorMessage(error)}`;
  } finally {
    if (context) {
      try {
        await context.close();
      } catch (closeError) {
        const closeReason = toErrorMessage(closeError);
        harError = harError ? `${harError}\nHAR context close error: ${closeReason}` : `HAR context close error: ${closeReason}`;
      }
    }
    await browser.close();
  }

  try {
    const harStats = await stat(paths.networkHarPath);
    harCaptured = harStats.size > 0;
    if (!harCaptured && !harError) {
      harError = 'HAR was created but file size is 0 bytes.';
    }
  } catch (error) {
    if (!harError) {
      harError = `HAR file check failed: ${toErrorMessage(error)}`;
    }
  }

  return {
    finalUrl,
    responses,
    harCaptured,
    harError,
  };
}

async function extractCandidates(page: Page): Promise<Candidate[]> {
  const extractionScript = `
(() => {
  const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
  const escapeCss = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');

  const selectorHintFor = (el) => {
    if (el.id) return '#' + escapeCss(el.id);

    const className = typeof el.className === 'string' ? el.className : '';
    const classes = className.split(/\\s+/).map((name) => name.trim()).filter(Boolean).slice(0, 3);
    if (classes.length > 0) {
      return el.tagName.toLowerCase() + '.' + classes.map(escapeCss).join('.');
    }

    const dataAttr = Array.from(el.attributes).find((attr) => attr.name.startsWith('data-'));
    if (dataAttr) return el.tagName.toLowerCase() + '[' + dataAttr.name + ']';

    let hint = el.tagName.toLowerCase();
    let parent = el.parentElement;
    let depth = 0;
    while (parent && depth < 2) {
      hint = parent.tagName.toLowerCase() + ' > ' + hint;
      parent = parent.parentElement;
      depth += 1;
    }
    return hint;
  };

  const headingGuessFor = (el) => {
    const directHeading = el.querySelector('caption,thead tr,h1,h2,h3,h4,[class*="head"],[class*="title"],[class*="ttl"]');
    if (directHeading) {
      const text = normalize(directHeading.textContent);
      if (text) return text;
    }

    let previous = el.previousElementSibling;
    while (previous) {
      if (/^H[1-6]$/.test(previous.tagName)) {
        const text = normalize(previous.textContent);
        if (text) return text;
      }
      previous = previous.previousElementSibling;
    }

    const section = el.closest('section,article,main,div');
    const sectionHeading = section ? section.querySelector('h1,h2,h3,h4') : null;
    return sectionHeading ? normalize(sectionHeading.textContent) : '';
  };

  const extractSkillName = (firstCell) => {
    if (!firstCell) return '';
    const skillNode = firstCell.querySelector('.frame_arts__ZU5YI');
    if (skillNode) {
      const text = normalize(skillNode.textContent);
      if (text) return text;
    }

    const firstSpan = firstCell.querySelector('span');
    if (firstSpan) {
      const text = normalize(firstSpan.textContent);
      if (text) return text;
    }

    return '';
  };

  const tokenizeCommandNode = (container) => {
    if (!container) return [];
    const tokens = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();

    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node;
        if (el.tagName === 'IMG') {
          const src = el.getAttribute('src') || '';
          const alt = normalize(el.getAttribute('alt') || '');
          const file = src ? src.split('/').pop() || src : '';
          tokens.push({
            type: 'icon',
            src,
            file,
            alt,
          });
        }
      } else if (node.nodeType === Node.TEXT_NODE) {
        const text = normalize(node.textContent);
        if (text) {
          const prev = tokens.length > 0 ? tokens[tokens.length - 1] : null;
          if (prev && prev.type === 'text') {
            prev.value = normalize(prev.value + ' ' + text);
          } else {
            tokens.push({
              type: 'text',
              value: text,
            });
          }
        }
      }
      node = walker.nextNode();
    }

    return tokens;
  };

  const extractCommandInput = (firstCell) => {
    if (!firstCell) return null;

    const blocks = Array.from(firstCell.querySelectorAll('p')).filter((p) => {
      if (p.querySelector('img')) return true;
      return normalize(p.textContent).length > 0;
    });

    const commandBlocks = blocks.length > 0 ? blocks : [firstCell];
    const parsed = commandBlocks
      .map((block) => {
        const tokens = tokenizeCommandNode(block);
        const iconTokens = tokens.filter((token) => token.type === 'icon');
        return {
          tokens,
          iconCount: iconTokens.length,
        };
      })
      .filter((entry) => entry.tokens.length > 0);

    if (parsed.length === 0) return null;

    parsed.sort((a, b) => {
      if (b.iconCount !== a.iconCount) return b.iconCount - a.iconCount;
      return b.tokens.length - a.tokens.length;
    });

    const best = parsed[0];
    const iconTokens = best.tokens.filter((token) => token.type === 'icon');
    if (iconTokens.length === 0) return null;

    const commandText = best.tokens
      .map((token) => (token.type === 'icon' ? '[' + token.file + ']' : token.value))
      .join(' ')
      .replace(/\\s+/g, ' ')
      .trim();

    return {
      commandText,
      iconPaths: iconTokens.map((token) => token.src).filter(Boolean),
      iconFiles: iconTokens.map((token) => token.file).filter(Boolean),
      iconAlts: iconTokens.map((token) => token.alt).filter(Boolean),
      tokens: best.tokens,
    };
  };

  const extractLabelText = (el, removeList) => {
    if (!el) return '';
    const clone = el.cloneNode(true);
    const selectors = [
      'input',
      'button',
      'svg',
      'img',
      'script',
      'style',
      '[role="tooltip"]',
      '.frame_ex___h3rR',
    ];
    if (removeList) selectors.push('ul');

    for (const selector of selectors) {
      for (const removable of Array.from(clone.querySelectorAll(selector))) {
        removable.remove();
      }
    }

    return normalize(clone.textContent);
  };

  const extractDescription = (el) => {
    if (!el) return '';
    const candidates = [
      ':scope > .frame_ex___h3rR .frame_inner__Qf7xV',
      '.frame_ex___h3rR .frame_inner__Qf7xV',
    ];

    for (const selector of candidates) {
      const node = el.querySelector(selector);
      if (!node) continue;
      const text = normalize(node.textContent);
      if (text) return text;
    }

    return '';
  };

  const collectHeaderColumns = (el) => {
    const tagName = el.tagName ? el.tagName.toUpperCase() : '';
    if (tagName !== 'TABLE') {
      return {
        headerColumns: [],
        headerDetails: [],
      };
    }

    const headerRow = el.querySelector('thead tr');
    if (!headerRow) {
      return {
        headerColumns: [],
        headerDetails: [],
      };
    }

    const headerCells = Array.from(headerRow.querySelectorAll(':scope > th,:scope > td'));
    const headerDetails = [];
    let columnIndex = 0;

    for (const cell of headerCells) {
      const parentLabel = extractLabelText(cell, true);
      const childItems = Array.from(cell.querySelectorAll(':scope > ul > li'));

      if (childItems.length > 0) {
        for (const item of childItems) {
          const leafLabel = extractLabelText(item, true);
          if (!leafLabel) continue;
          const label = parentLabel ? leafLabel + ' (' + parentLabel + ')' : leafLabel;
          headerDetails.push({
            columnIndex,
            label,
            parentLabel: parentLabel || null,
            leafLabel,
            description: extractDescription(item),
          });
          columnIndex += 1;
        }
        continue;
      }

      if (!parentLabel) {
        continue;
      }

      headerDetails.push({
        columnIndex,
        label: parentLabel,
        parentLabel: null,
        leafLabel: parentLabel,
        description: extractDescription(cell),
      });
      columnIndex += 1;
    }

    return {
      headerColumns: headerDetails.map((detail) => detail.label),
      headerDetails,
    };
  };

  const collectRows = (el) => {
    let rowNodes = [];
    const tagName = el.tagName ? el.tagName.toUpperCase() : '';

    if (tagName === 'TABLE') {
      rowNodes = Array.from(el.querySelectorAll('tr')).slice(0, 500);
    } else if (el.matches && (el.matches('[role="table"]') || el.matches('[role="grid"]'))) {
      rowNodes = Array.from(el.querySelectorAll('[role="row"]')).slice(0, 500);
    } else {
      rowNodes = Array.from(el.querySelectorAll(':scope > tr,:scope > [role="row"],:scope > li,:scope > .row')).slice(0, 500);
      if (rowNodes.length === 0) {
        const directChildren = Array.from(el.children).filter((child) => normalize(child.textContent).length > 0);
        if (directChildren.length >= 3) {
          rowNodes = directChildren.slice(0, 500);
        }
      }
    }

    return rowNodes
      .map((row, index) => {
        const isTableRow = row.tagName === 'TR';
        let cellNodes = [];

        if (isTableRow) {
          cellNodes = Array.from(row.querySelectorAll(':scope > th,:scope > td'));
          if (cellNodes.length === 0) {
            cellNodes = Array.from(row.children).filter((child) => child.tagName === 'TH' || child.tagName === 'TD');
          }
        } else {
          cellNodes = Array.from(row.querySelectorAll(':scope > [role="columnheader"],:scope > [role="cell"],:scope > div'));
          if (cellNodes.length === 0) {
            cellNodes = Array.from(row.children).filter((child) => normalize(child.textContent).length > 0);
          }
        }

        const cells = cellNodes.map((cell) => normalize(cell.textContent));
        const nonEmptyCells = cells.filter((cell) => cell.length > 0);
        const firstCell = cellNodes.length > 0 ? cellNodes[0] : null;
        const skillName = extractSkillName(firstCell);
        const commandInput = extractCommandInput(firstCell);
        const firstCellColSpan = firstCell ? Number(firstCell.getAttribute('colspan') || '1') : 1;

        let rowKind = 'data';
        if (nonEmptyCells.length === 0) {
          rowKind = 'other';
        } else if (firstCellColSpan >= 10 && nonEmptyCells.length <= 1) {
          rowKind = 'section';
        } else if (!isTableRow && nonEmptyCells.length <= 1) {
          rowKind = 'note';
        }

        const text = nonEmptyCells.length > 0 ? nonEmptyCells.join(' | ') : normalize(row.textContent);
        return {
          index,
          text,
          cells,
          cellCount: cells.length,
          nonEmptyCellCount: nonEmptyCells.length,
          rowKind,
          skillName: skillName || undefined,
          commandInput: commandInput || undefined,
        };
      })
      .filter((row) => row.text.length > 0);
  };

  const seen = new Set();
  const candidates = [];

  const pushCandidate = (kind, el, baseScore) => {
    if (seen.has(el)) return;
    seen.add(el);

    const rows = collectRows(el);
    if (rows.length === 0) return;

    const { headerColumns, headerDetails } = collectHeaderColumns(el);
    const headingGuess = headingGuessFor(el);
    const previewRows = rows.slice(0, 5).map((row) => row.text);
    const hasCells = rows.some((row) => (row.nonEmptyCellCount || row.cells.filter((cell) => cell.length > 0).length) > 1);
    const score = baseScore + rows.length + (headingGuess ? 3 : 0) + (hasCells ? 2 : 0) + (headerColumns.length >= 12 ? 8 : 0);

    candidates.push({
      id: 'c' + (candidates.length + 1),
      kind,
      headingGuess,
      rowCount: rows.length,
      previewRows,
      score,
      selectorHint: selectorHintFor(el),
      rows,
      headerColumns,
      headerDetails,
    });
  };

  for (const table of Array.from(document.querySelectorAll('table'))) {
    pushCandidate('table', table, 12);
  }

  for (const roleTable of Array.from(document.querySelectorAll('[role="table"],[role="grid"]'))) {
    pushCandidate('role-grid', roleTable, 10);
  }

  for (const block of Array.from(document.querySelectorAll('section,article,div')).slice(0, 600)) {
    const directRepeatingRows = block.querySelectorAll(':scope > div,:scope > li,:scope > [role="row"],:scope > ul > li').length;
    const text = normalize(block.textContent);
    if (directRepeatingRows >= 3 && text.length > 60) {
      pushCandidate('repeating-block', block, 3);
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return { candidates };
})()
`;

  const result = await page.evaluate((script) => {
    return (0, eval)(script);
  }, extractionScript);

  return (result.candidates ?? []) as Candidate[];
}

function attachLocalControllerPaths(rows: RawRow[]): RawRow[] {
  return rows.map((row) => {
    if (!row.commandInput) {
      return row;
    }

    const localIconPaths = row.commandInput.iconFiles.map((iconFile) => `${PUBLIC_CONTROLLER_BASE_PATH}/${iconFile}`);

    return {
      ...row,
      commandInput: {
        ...row.commandInput,
        localIconPaths,
      },
    };
  });
}

function normalizeHeaderColumns(columns: string[]): string[] {
  return columns.map((column) => column.replace(/\s+/g, ' ').trim()).filter((column) => column.length > 0);
}

const EXPECTED_COLUMN_KEYS = [
  'moveName',
  'startUpFrame',
  'activeFrame',
  'recoveryFrame',
  'hitRecovery',
  'blockRecovery',
  'cancel',
  'damage',
  'comboScaling',
  'hitDriveGaugeIncrease',
  'blockDriveGaugeDecrease',
  'punishCounterDriveGaugeDecrease',
  'superArtGaugeIncrease',
  'properties',
  'miscellaneous',
] as const;

function toCamelCaseOfficialKey(label: string): string {
  const normalized = label
    .replace(/&/g, ' and ')
    .replace(/[-/]/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return '';
  }

  const tokens = normalized
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => token.toLowerCase());

  if (tokens.length === 0) {
    return '';
  }

  return tokens
    .map((token, index) => {
      if (index === 0) {
        return token;
      }
      return token[0].toUpperCase() + token.slice(1);
    })
    .join('');
}

function buildColumnDefinitions(headerColumns: string[], headerDetails: HeaderColumn[]): ColumnDefinition[] {
  const detailByIndex = new Map<number, HeaderColumn>();
  for (const detail of headerDetails) {
    detailByIndex.set(detail.columnIndex, detail);
  }

  const usedKeys = new Map<string, number>();
  const definitions: ColumnDefinition[] = [];
  for (let columnIndex = 0; columnIndex < headerColumns.length; columnIndex += 1) {
    const label = headerColumns[columnIndex];
    const baseKey = toCamelCaseOfficialKey(label);
    if (!baseKey) {
      throw new Error(`failed to generate key from header label: "${label}" at columnIndex=${columnIndex}`);
    }

    const duplicateCount = usedKeys.get(baseKey) ?? 0;
    usedKeys.set(baseKey, duplicateCount + 1);
    const key = duplicateCount === 0 ? baseKey : `${baseKey}Col${duplicateCount + 1}`;
    const detail = detailByIndex.get(columnIndex);

    definitions.push({
      columnIndex,
      label,
      key,
      parentLabel: detail?.parentLabel ?? null,
      leafLabel: detail?.leafLabel ?? label,
      description: detail?.description ?? '',
    });
  }

  return definitions;
}

function projectColumnDefinitionsFromCanonical(
  headerColumns: string[],
  headerDetails: HeaderColumn[],
  canonicalColumnDefinitions: ColumnDefinition[],
  locale: Locale,
): ColumnDefinition[] {
  if (canonicalColumnDefinitions.length !== headerColumns.length) {
    throw new Error(
      `[scrape:${locale}] canonical column definition length mismatch. canonical=${canonicalColumnDefinitions.length}, headers=${headerColumns.length}`,
    );
  }

  const detailByIndex = new Map<number, HeaderColumn>();
  for (const detail of headerDetails) {
    detailByIndex.set(detail.columnIndex, detail);
  }

  return canonicalColumnDefinitions.map((canonical, columnIndex) => {
    const detail = detailByIndex.get(columnIndex);
    const label = headerColumns[columnIndex] ?? canonical.label;
    return {
      columnIndex,
      label,
      key: canonical.key,
      parentLabel: detail?.parentLabel ?? canonical.parentLabel,
      leafLabel: detail?.leafLabel ?? label,
      description: detail?.description ?? canonical.description,
    };
  });
}

function assertExpectedColumnKeys(columnDefinitions: ColumnDefinition[], locale: Locale): void {
  const actualKeys = columnDefinitions.map((definition) => definition.key);
  const expectedKeys = [...EXPECTED_COLUMN_KEYS];
  const sameLength = actualKeys.length === expectedKeys.length;
  const sameOrder = sameLength && actualKeys.every((key, index) => key === expectedKeys[index]);

  if (!sameOrder) {
    throw new Error(
      `[scrape:${locale}] column key mismatch. expected=${JSON.stringify(expectedKeys)}, actual=${JSON.stringify(actualKeys)}`,
    );
  }
}

function buildGlossary(columnDefinitions: ColumnDefinition[]): Record<string, string> {
  const glossary: Record<string, string> = {};
  for (const definition of columnDefinitions) {
    const description = definition.description.trim();
    if (!description) {
      continue;
    }
    glossary[definition.key] = description;
  }
  return glossary;
}

function buildRawOutputRows(rows: RawRow[]): RawOutputRow[] {
  return rows.map((row) => ({
    rowIndex: row.index,
    rowText: row.text,
    cellTexts: row.cells,
    totalCellCount: row.cellCount,
    nonEmptyCellCount: row.nonEmptyCellCount,
    rowType: row.rowKind,
    moveName: row.skillName,
    commandInput: row.commandInput,
  }));
}

function buildComboRows(rows: RawRow[], columnDefinitions: ColumnDefinition[], firstColumnLabel: string): ComboRow[] {
  const comboRows: ComboRow[] = [];
  let currentSection: string | null = null;

  for (const row of rows) {
    if (row.rowKind === 'section') {
      const sectionLabel = row.cells[0] ?? row.text;
      currentSection = sectionLabel && sectionLabel.trim().length > 0 ? sectionLabel : currentSection;
      continue;
    }

    if (row.rowKind !== 'data') {
      continue;
    }

    if (row.cellCount !== FIXED_CELL_COUNT || row.cells.length !== FIXED_CELL_COUNT) {
      continue;
    }

    const moveName = (row.cells[0] ?? '').trim();
    if (!moveName || moveName === firstColumnLabel) {
      continue;
    }

    const valuesByKey: Record<string, string> = {};
    for (const definition of columnDefinitions) {
      valuesByKey[definition.key] = row.cells[definition.columnIndex] ?? '';
    }

    comboRows.push({
      rowIndex: row.index,
      sectionHeading: currentSection,
      moveName,
      startUpFrame: valuesByKey.startUpFrame ?? '',
      activeFrame: valuesByKey.activeFrame ?? '',
      recoveryFrame: valuesByKey.recoveryFrame ?? '',
      hitRecovery: valuesByKey.hitRecovery ?? '',
      blockRecovery: valuesByKey.blockRecovery ?? '',
      cancel: valuesByKey.cancel ?? '',
      damage: valuesByKey.damage ?? '',
      comboScaling: valuesByKey.comboScaling ?? '',
      hitDriveGaugeIncrease: valuesByKey.hitDriveGaugeIncrease ?? '',
      blockDriveGaugeDecrease: valuesByKey.blockDriveGaugeDecrease ?? '',
      punishCounterDriveGaugeDecrease: valuesByKey.punishCounterDriveGaugeDecrease ?? '',
      superArtGaugeIncrease: valuesByKey.superArtGaugeIncrease ?? '',
      properties: valuesByKey.properties ?? '',
      miscellaneous: valuesByKey.miscellaneous ?? '',
      commandInput: row.commandInput,
      sourceRow: {
        rowType: row.rowKind,
        totalCellCount: row.cellCount,
        nonEmptyCellCount: row.nonEmptyCellCount,
        cellTexts: row.cells,
      },
    });
  }

  return comboRows;
}

function assertFixedColumns(columns: string[], locale: Locale): void {
  if (columns.length !== FIXED_CELL_COUNT) {
    throw new Error(
      `[scrape:${locale}] expected ${FIXED_CELL_COUNT} header columns from official table, but got ${columns.length}. columns=${JSON.stringify(columns)}`,
    );
  }
}

function assertComboRows(result: LocaleScrapeResult): void {
  if (result.comboRows.length === 0) {
    throw new Error(`[scrape:${result.locale}] extracted combo rows is empty.`);
  }

  for (const row of result.comboRows) {
    if (row.sourceRow.cellTexts.length !== FIXED_CELL_COUNT) {
      throw new Error(
        `[scrape:${result.locale}] row index=${row.rowIndex} has invalid cell length ${row.sourceRow.cellTexts.length} (expected ${FIXED_CELL_COUNT}).`,
      );
    }
  }
}

function createSharedMeta(result: LocaleScrapeResult) {
  return {
    targetUrl: result.targetUrl,
    finalUrl: result.finalUrl,
    capturedAt: result.capturedAt,
    harCaptured: result.harCaptured,
    harError: result.harError ?? null,
    extractionError: result.extractionError ?? null,
  };
}

function buildRequestQueueName(locale: Locale, capturedAt: string): string {
  const normalizedCapturedAt = capturedAt.replace(/[^a-zA-Z0-9_-]/g, '-');
  return `sf6-frame-${locale}-${normalizedCapturedAt}`;
}

async function scrapeLocale(
  config: LocaleConfig,
  capturedAt: string,
  options: ScrapeLocaleOptions = {},
): Promise<LocaleScrapeResult> {
  await ensureDir(config.artifactDir);
  const paths = buildArtifactPaths(config.artifactDir);
  const requestQueueName = buildRequestQueueName(config.locale, capturedAt);
  const requestQueue = await RequestQueue.open(requestQueueName);

  const harResult = await captureHarArtifact(config, paths);
  if (!harResult.harCaptured) {
    const reason = harResult.harError ?? 'HAR was not captured (unknown reason).';
    const details = [`capturedAt=${capturedAt}`, `targetUrl=${config.targetUrl}`, `finalUrl=${harResult.finalUrl}`, `reason=${reason}`].join('\n');
    await writeText(paths.networkHarLogPath, `${details}\n`);
    await writeResponsesJsonl(paths.networkResponsesPath, harResult.responses);
    log.warning(`[scrape:${config.locale}] HAR capture unavailable, wrote fallback logs: ${paths.networkHarLogPath}`);
  }

  let finalUrl = harResult.finalUrl;
  let candidates: Candidate[] = [];
  let extractionError: string | undefined;

  const crawler = new PlaywrightCrawler({
    requestQueue,
    maxRequestsPerCrawl: 1,
    maxConcurrency: 1,
    requestHandlerTimeoutSecs: 180,
    launchContext: {
      launchOptions: {
        headless: true,
      },
    },
    async requestHandler({ page, log: crawlerLog }) {
      await waitForFrameCandidates(page);
      finalUrl = page.url();

      const html = await page.content();
      await writeText(paths.pageHtmlPath, html);
      await page.screenshot({ path: paths.pagePngPath, fullPage: true });

      try {
        candidates = await extractCandidates(page);
      } catch (error) {
        extractionError = `candidate extraction failed: ${toErrorMessage(error)}`;
        crawlerLog.warning(extractionError);
      }
    },
  });

  try {
    await crawler.run([config.targetUrl]);
  } catch (error) {
    extractionError = extractionError ?? `crawler failed: ${toErrorMessage(error)}`;
    throw error;
  }

  const bestCandidate = candidates[0];
  const bestCandidateId = bestCandidate?.id ?? null;
  const extractedRows = attachLocalControllerPaths(bestCandidate?.rows ?? []);
  const headerColumns = normalizeHeaderColumns(bestCandidate?.headerColumns ?? []);
  const headerDetails = (bestCandidate?.headerDetails ?? []).map((detail) => ({
    ...detail,
    label: detail.label.replace(/\s+/g, ' ').trim(),
    leafLabel: detail.leafLabel.replace(/\s+/g, ' ').trim(),
    parentLabel: detail.parentLabel ? detail.parentLabel.replace(/\s+/g, ' ').trim() : null,
    description: detail.description.replace(/\s+/g, ' ').trim(),
  }));

  assertFixedColumns(headerColumns, config.locale);
  const columnDefinitions = options.canonicalColumnDefinitions
    ? projectColumnDefinitionsFromCanonical(
        headerColumns,
        headerDetails,
        options.canonicalColumnDefinitions,
        config.locale,
      )
    : buildColumnDefinitions(headerColumns, headerDetails);
  assertExpectedColumnKeys(columnDefinitions, config.locale);

  const firstColumnLabel = headerColumns[0] ?? '';
  const rawRows = buildRawOutputRows(extractedRows);
  const comboRows = buildComboRows(extractedRows, columnDefinitions, firstColumnLabel);

  const result: LocaleScrapeResult = {
    locale: config.locale,
    targetUrl: config.targetUrl,
    finalUrl,
    capturedAt,
    harCaptured: harResult.harCaptured,
    harError: harResult.harError,
    extractionError,
    bestCandidateId,
    candidateCount: candidates.length,
    headerColumns,
    columnDefinitions,
    headerDetails,
    glossary: buildGlossary(columnDefinitions),
    rawRows,
    comboRows,
  };

  const sharedMeta = createSharedMeta(result);

  await writeJson(paths.tablesPreviewPath, {
    meta: sharedMeta,
    bestCandidateId,
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      headingGuess: candidate.headingGuess,
      rowCount: candidate.rowCount,
      previewRows: candidate.previewRows,
      score: candidate.score,
      selectorHint: candidate.selectorHint,
      headerColumns: candidate.headerColumns,
    })),
  });

  await writeJson(paths.rawExtractedPath, {
    meta: sharedMeta,
    source: 'best-candidate',
    bestCandidateId,
    candidateCount: candidates.length,
    rows: rawRows,
  });

  await writeJson(paths.comboExtractedPath, {
    meta: {
      ...sharedMeta,
      source: 'best-candidate',
      mappingVersion: 1,
      fixedCellCount: FIXED_CELL_COUNT,
      columns: headerColumns,
      columnDefinitions: columnDefinitions.map((definition) => ({
        columnIndex: definition.columnIndex,
        label: definition.label,
        key: definition.key,
      })),
    },
    glossary: result.glossary,
    rows: comboRows,
  });

  if (!harResult.harCaptured && !existsSync(paths.networkResponsesPath)) {
    await writeResponsesJsonl(paths.networkResponsesPath, []);
  }

  log.info(`[scrape:${config.locale}] saved: ${paths.pageHtmlPath}`);
  log.info(`[scrape:${config.locale}] saved: ${paths.pagePngPath}`);
  log.info(`[scrape:${config.locale}] saved: ${paths.tablesPreviewPath}`);
  log.info(`[scrape:${config.locale}] saved: ${paths.rawExtractedPath}`);
  log.info(`[scrape:${config.locale}] saved: ${paths.comboExtractedPath}`);
  if (harResult.harCaptured) {
    log.info(`[scrape:${config.locale}] saved: ${paths.networkHarPath}`);
  } else {
    log.info(`[scrape:${config.locale}] saved fallback: ${paths.networkHarLogPath}`);
    log.info(`[scrape:${config.locale}] saved fallback: ${paths.networkResponsesPath}`);
  }

  assertComboRows(result);
  return result;
}

function buildJaMapRows(enRows: ComboRow[], jaRows: ComboRow[]): JaMapRow[] {
  if (enRows.length !== jaRows.length) {
    throw new Error(`row count mismatch between en-us and ja-jp. en=${enRows.length}, ja=${jaRows.length}`);
  }

  const mapped: JaMapRow[] = [];
  for (let i = 0; i < enRows.length; i += 1) {
    const enRow = enRows[i];
    const jaRow = jaRows[i];

    if (enRow.rowIndex !== jaRow.rowIndex) {
      throw new Error(
        `row index mismatch at position=${i}. en.rowIndex=${enRow.rowIndex}, ja.rowIndex=${jaRow.rowIndex}. alignment is fixed by rowIndex and cannot auto-correct.`,
      );
    }

    mapped.push({
      rowIndex: enRow.rowIndex,
      moveName: jaRow.moveName,
      comboScaling: jaRow.comboScaling,
      properties: jaRow.properties,
      miscellaneous: jaRow.miscellaneous,
    });
  }

  return mapped;
}

async function writeCanonicalOutputs(enResult: LocaleScrapeResult, jaResult: LocaleScrapeResult): Promise<void> {
  const enMeta = createSharedMeta(enResult);

  await writeJson(RAW_JSON_PATH, {
    meta: enMeta,
    source: 'best-candidate',
    bestCandidateId: enResult.bestCandidateId,
    candidateCount: enResult.candidateCount,
    rows: enResult.rawRows,
  });

  const jaMapRows = buildJaMapRows(enResult.comboRows, jaResult.comboRows);
  await writeJson(JA_MAP_JSON_PATH, {
    meta: {
      targetUrl: jaResult.targetUrl,
      finalUrl: jaResult.finalUrl,
      capturedAt: jaResult.capturedAt,
      source: 'best-candidate',
      matchKey: 'rowIndex',
      mappedColumns: [enResult.headerColumns[0], enResult.headerColumns[8], enResult.headerColumns[13], enResult.headerColumns[14]],
      mappedKeys: ['moveName', 'comboScaling', 'properties', 'miscellaneous'],
    },
    rows: jaMapRows,
  });
}

async function main(): Promise<void> {
  await ensureDir(DATA_DIR);

  const capturedAt = new Date().toISOString();
  log.info(`starting scraper for canonical=en-us and map=ja-jp`);

  const enResult = await scrapeLocale(
    {
      locale: 'en-us',
      targetUrl: EN_TARGET_URL,
      artifactDir: ARTIFACT_EN_DIR,
    },
    capturedAt,
    {},
  );

  const jaResult = await scrapeLocale(
    {
      locale: 'ja-jp',
      targetUrl: JA_TARGET_URL,
      artifactDir: ARTIFACT_JA_DIR,
    },
    capturedAt,
    {
      canonicalColumnDefinitions: enResult.columnDefinitions,
    },
  );

  await writeCanonicalOutputs(enResult, jaResult);

  log.info(`saved: ${RAW_JSON_PATH}`);
  log.info(`saved: ${JA_MAP_JSON_PATH}`);
}

main().catch((error) => {
  const message = toErrorMessage(error);
  console.error(`[scrape:jp] failed: ${message}`);
  process.exitCode = 1;
});

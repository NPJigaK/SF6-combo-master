import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CheerioCrawler, log } from 'crawlee';

const CANONICAL_URL = 'https://wiki.supercombo.gg/w/Street_Fighter_6/JP/Frame_data';
const FETCH_URL = 'https://srk.shib.live/w/Street_Fighter_6/JP/Frame_data';
const SOURCE_TYPE = 'mirror' as const;

const REQUESTED_URLS = [
  'https://wiki.supercombo.gg/w/Street_Fighter_6/JP/Frame_data#tabber-General',
  'https://wiki.supercombo.gg/w/Street_Fighter_6/JP/Frame_data#tabber-Details',
  'https://wiki.supercombo.gg/w/Street_Fighter_6/JP/Frame_data#tabber-Meter',
  'https://wiki.supercombo.gg/w/Street_Fighter_6/JP/Frame_data#tabber-Properties',
  'https://wiki.supercombo.gg/w/Street_Fighter_6/JP/Frame_data#tabber-Notes',
] as const;

const TAB_NAMES = ['General', 'Details', 'Meter', 'Properties', 'Notes'] as const;
const TAB_KEYS = ['general', 'details', 'meter', 'properties', 'notes'] as const;
const REQUEST_HEADERS = {
  'user-agent': 'curl/8.5.0',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
} as const;

const ARTIFACT_DIR = path.join('artifacts', 'jp', 'supercombo-frame');
const DATA_DIR = path.join('data', 'jp');

const PAGE_HTML_PATH = path.join(ARTIFACT_DIR, 'page.html');
const TABS_PREVIEW_PATH = path.join(ARTIFACT_DIR, 'tabs.preview.json');
const RAW_JSON_PATH = path.join(DATA_DIR, 'frame.supercombo.raw.json');

type TabName = (typeof TAB_NAMES)[number];
type TabKey = (typeof TAB_KEYS)[number];

type RawCell = {
  index: number;
  text: string;
  innerHtml: string;
  outerHtml: string;
  attributes: Record<string, string>;
};

type RawRow = {
  index: number;
  cells: RawCell[];
  rowText: string;
  rowHtml: string;
  rowAttributes: Record<string, string>;
  dataDetailsRaw: string | null;
};

type RawTab = {
  tabName: TabName;
  panelId: string;
  labelId: string | null;
  headers: string[];
  rowCount: number;
  rows: RawRow[];
  panelHtml: string;
};

type RawGroup = {
  groupKey: string;
  heading: string | null;
  tabs: RawTab[];
};

type SharedMeta = {
  requestedUrls: readonly string[];
  canonicalUrl: string;
  fetchUrl: string;
  sourceType: typeof SOURCE_TYPE;
  capturedAt: string;
  finalUrl: string;
  status: number | null;
  revisionId: number | null;
  lastEditedText: string | null;
  extractionError: string | null;
};

type RawExtraction = {
  meta: SharedMeta;
  groups: RawGroup[];
  pageHtml: string;
};

type PreviewPayload = {
  meta: SharedMeta;
  groupCount: number;
  groups: Array<{
    groupKey: string;
    heading: string | null;
    tabs: Array<{
      tabName: TabName;
      panelId: string;
      rowCount: number;
      headers: string[];
    }>;
  }>;
};

type ColumnDefinition = {
  columnIndex: number;
  label: string;
  key: string;
};

type ColumnDefinitionByTab = {
  tabName: TabName;
  tabKey: TabKey;
  columns: ColumnDefinition[];
};

type MoveTabCell = {
  columnIndex: number;
  headerLabel: string;
  headerKey: string;
  rawText: string;
  rawHtml: string;
};

type MoveTabData = {
  cells: MoveTabCell[];
  valuesByKey: Record<string, string>;
};

type MoveData = {
  moveId: string;
  groupKey: string;
  groupHeading: string | null;
  rowIndex: number;
  input: string;
  tabs: Record<TabKey, MoveTabData>;
  source: {
    rowsByTab: Record<TabKey, { rowHtml: string; dataDetailsRaw: string | null }>;
  };
};

type SupercomboBuildPayload = {
  meta: {
    canonicalUrl: string;
    fetchUrl: string;
    capturedAt: string;
    finalUrl: string;
    revisionId: number | null;
    sourceType: typeof SOURCE_TYPE;
    status: number | null;
    lastEditedText: string | null;
    extractionError: string | null;
  };
  columnDefinitions: ColumnDefinitionByTab[];
  moves: MoveData[];
};

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function combineErrors(messages: Array<string | null | undefined>): string | null {
  const normalized = messages
    .map((message) => (typeof message === 'string' ? message.trim() : ''))
    .filter((message) => message.length > 0);

  if (normalized.length === 0) {
    return null;
  }

  return normalized.join('\n');
}

function parseRevisionId(pageHtml: string): number | null {
  const match = /"wgRevisionId"\s*:\s*(\d+)/.exec(pageHtml);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function detectChallengePage(pageHtml: string): boolean {
  const normalized = pageHtml.toLowerCase();
  return (
    normalized.includes('making sure you&#39;re not a bot') ||
    normalized.includes("making sure you're not a bot") ||
    normalized.includes('anubis_challenge') ||
    normalized.includes('cf-mitigated')
  );
}

function extractLastEditedText($: any): string | null {
  const candidates = [
    normalizeText($('#footer-info-lastmod').text()),
    normalizeText($('#citizen-lastmod-relative').attr('title')),
    normalizeText($('#citizen-lastmod-relative').text()),
    normalizeText($('.printfooter').text()),
  ];

  for (const candidate of candidates) {
    if (candidate.length > 0) {
      return candidate;
    }
  }
  return null;
}

function headingFromElement(element: any, $: any): string | null {
  if (!element || element.length === 0) {
    return null;
  }

  if (element.is('h3')) {
    const heading = normalizeText(element.text());
    return heading.length > 0 ? heading : null;
  }

  const nestedHeading = element.find('h3').last();
  if (nestedHeading.length > 0) {
    const heading = normalizeText(nestedHeading.text());
    return heading.length > 0 ? heading : null;
  }

  return null;
}

function findNearestHeading(panel: any, $: any): string | null {
  const tabber = panel.closest('div.tabber').first();
  if (!tabber || tabber.length === 0) {
    return null;
  }

  let sibling = tabber.prev();
  while (sibling.length > 0) {
    const heading = headingFromElement(sibling, $);
    if (heading) {
      return heading;
    }
    sibling = sibling.prev();
  }

  let ancestor = tabber.parent();
  while (ancestor.length > 0) {
    let ancestorSibling = ancestor.prev();
    while (ancestorSibling.length > 0) {
      const heading = headingFromElement(ancestorSibling, $);
      if (heading) {
        return heading;
      }
      ancestorSibling = ancestorSibling.prev();
    }
    ancestor = ancestor.parent();
  }

  return null;
}

function groupSortValue(groupKey: string): number {
  if (groupKey === '') {
    return 0;
  }
  const parsed = Number(groupKey.replace(/^_/, ''));
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function toAttributeRecord(attributes: Record<string, unknown> | undefined | null): Record<string, string> {
  if (!attributes) {
    return {};
  }

  const entries = Object.entries(attributes)
    .map(([key, value]) => {
      if (value === undefined || value === null) {
        return null;
      }
      if (Array.isArray(value)) {
        return [key, value.map((item) => String(item)).join(' ')];
      }
      return [key, String(value)];
    })
    .filter((entry): entry is [string, string] => entry !== null);

  return Object.fromEntries(entries);
}

function extractGroups($: any): RawGroup[] {
  type MutableGroup = {
    groupKey: string;
    heading: string | null;
    tabsByName: Map<TabName, RawTab>;
  };

  const groups = new Map<string, MutableGroup>();

  $('article.tabber__panel[id^="tabber-"]').each((_: number, panelElement: any) => {
    const panel = $(panelElement);
    const panelId = panel.attr('id') ?? '';
    const match = /^tabber-(General|Details|Meter|Properties|Notes)(?:_(\d+))?$/.exec(panelId);
    if (!match) {
      return;
    }

    const tabName = match[1] as TabName;
    const groupKey = match[2] ? `_${match[2]}` : '';

    const headers = panel
      .find('thead tr')
      .first()
      .children('th,td')
      .map((__: number, cellElement: any) => normalizeText($(cellElement).text()))
      .get();

    const rows: RawRow[] = [];
    panel.find('tbody tr').each((rowIndex: number, rowElement: any) => {
      const row = $(rowElement);
      const cells = row.children('th,td');
      const rowAttributes = toAttributeRecord(rowElement?.attribs);
      const dataDetailsRaw = normalizeOptionalString(row.attr('data-details'));

      const extractedCells: RawCell[] = cells
        .map((cellIndex: number, cellElement: any) => {
          const cellAttributes = toAttributeRecord(cellElement?.attribs);
          return {
            index: cellIndex,
            text: normalizeText($(cellElement).text()),
            innerHtml: normalizeOptionalString($(cellElement).html()) ?? '',
            outerHtml: normalizeOptionalString($.html(cellElement)) ?? '',
            attributes: cellAttributes,
          };
        })
        .get();

      rows.push({
        index: rowIndex,
        cells: extractedCells,
        rowText: normalizeText(row.text()),
        rowHtml: normalizeOptionalString($.html(rowElement)) ?? '',
        rowAttributes,
        dataDetailsRaw,
      });
    });

    const tab: RawTab = {
      tabName,
      panelId,
      labelId: normalizeOptionalString(panel.attr('aria-labelledby')),
      headers,
      rowCount: rows.length,
      rows,
      panelHtml: normalizeOptionalString($.html(panelElement)) ?? '',
    };

    const heading = findNearestHeading(panel, $);
    const existing = groups.get(groupKey);
    if (!existing) {
      groups.set(groupKey, {
        groupKey,
        heading,
        tabsByName: new Map([[tabName, tab]]),
      });
      return;
    }

    if (!existing.heading && heading) {
      existing.heading = heading;
    }
    existing.tabsByName.set(tabName, tab);
  });

  const orderedGroups = Array.from(groups.values()).sort((left, right) => {
    const diff = groupSortValue(left.groupKey) - groupSortValue(right.groupKey);
    if (diff !== 0) {
      return diff;
    }
    return left.groupKey.localeCompare(right.groupKey);
  });

  return orderedGroups.map((group) => {
    const tabs = TAB_NAMES.flatMap((tabName) => {
      const tab = group.tabsByName.get(tabName);
      return tab ? [tab] : [];
    });

    return {
      groupKey: group.groupKey,
      heading: group.heading,
      tabs,
    };
  });
}

function detectMissingTabs(groups: RawGroup[]): string[] {
  const missingByGroup: string[] = [];

  for (const group of groups) {
    const existingTabs = new Set(group.tabs.map((tab) => tab.tabName));
    const missing = TAB_NAMES.filter((tabName) => !existingTabs.has(tabName));
    if (missing.length === 0) {
      continue;
    }
    const groupLabel = group.groupKey.length > 0 ? group.groupKey : '(base)';
    missingByGroup.push(`${groupLabel}: ${missing.join(', ')}`);
  }

  return missingByGroup;
}

function toCamelCaseKey(label: string): string {
  const normalized = label
    .replace(/&/g, ' and ')
    .replace(/[()\[\]{}]/g, ' ')
    .replace(/[\/]/g, ' ')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return 'column';
  }

  const tokens = normalized
    .split(' ')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return 'column';
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

function buildColumnDefinitions(groups: RawGroup[]): ColumnDefinitionByTab[] {
  return TAB_NAMES.map((tabName, tabIndex) => {
    const labels: string[] = [];
    const seen = new Set<string>();

    for (const group of groups) {
      const tab = group.tabs.find((entry) => entry.tabName === tabName);
      if (!tab) {
        continue;
      }

      for (const header of tab.headers) {
        if (seen.has(header)) {
          continue;
        }
        seen.add(header);
        labels.push(header);
      }
    }

    const usedKeys = new Map<string, number>();
    const columns = labels.map((label, columnIndex) => {
      const baseKey = toCamelCaseKey(label);
      const duplicate = usedKeys.get(baseKey) ?? 0;
      usedKeys.set(baseKey, duplicate + 1);
      const key = duplicate === 0 ? baseKey : `${baseKey}Col${duplicate + 1}`;

      return {
        columnIndex,
        label,
        key,
      };
    });

    return {
      tabName,
      tabKey: TAB_KEYS[tabIndex],
      columns,
    };
  });
}

function ensureAllTabs(groups: RawGroup[]): string | null {
  return combineErrors(detectMissingTabs(groups));
}

function buildMovePayload(groups: RawGroup[], columnDefinitions: ColumnDefinitionByTab[]): { moves: MoveData[]; error: string | null } {
  const errors: string[] = [];
  const moves: MoveData[] = [];

  for (const group of groups) {
    const tabsByName = new Map(group.tabs.map((tab) => [tab.tabName, tab]));
    const general = tabsByName.get('General');

    if (!general) {
      errors.push(`group ${group.groupKey || '(base)'} missing General tab`);
      continue;
    }

    for (const tabName of TAB_NAMES) {
      const tab = tabsByName.get(tabName);
      if (!tab) {
        errors.push(`group ${group.groupKey || '(base)'} missing ${tabName} tab`);
        continue;
      }

      if (tab.rowCount !== general.rowCount) {
        errors.push(
          `row count mismatch in group ${group.groupKey || '(base)'}: General=${general.rowCount}, ${tabName}=${tab.rowCount}`,
        );
      }
    }

    for (let rowIndex = 0; rowIndex < general.rowCount; rowIndex += 1) {
      const generalRow = general.rows[rowIndex];
      const input = generalRow?.cells[0]?.text ?? '';
      const moveId = `supercombo:${group.groupKey || 'base'}:${rowIndex}`;

      const tabs: Partial<Record<TabKey, MoveTabData>> = {};
      const rowsByTab: Partial<Record<TabKey, { rowHtml: string; dataDetailsRaw: string | null }>> = {};

      TAB_NAMES.forEach((tabName, tabIndex) => {
        const tab = tabsByName.get(tabName);
        const tabKey = TAB_KEYS[tabIndex];

        if (!tab || rowIndex >= tab.rows.length) {
          tabs[tabKey] = {
            cells: [],
            valuesByKey: {},
          };
          rowsByTab[tabKey] = {
            rowHtml: '',
            dataDetailsRaw: null,
          };
          return;
        }

        const row = tab.rows[rowIndex];
        const tabInput = row.cells[0]?.text ?? '';
        if (tabInput !== input) {
          errors.push(
            `input mismatch in group ${group.groupKey || '(base)'} row=${rowIndex}: General='${input}', ${tabName}='${tabInput}'`,
          );
        }

        const definitions = columnDefinitions.find((definition) => definition.tabName === tabName);
        const headerIndexMap = new Map<string, number>();
        tab.headers.forEach((header, index) => {
          if (!headerIndexMap.has(header)) {
            headerIndexMap.set(header, index);
          }
        });

        const cells: MoveTabCell[] = [];
        const valuesByKey: Record<string, string> = {};

        for (const definition of definitions?.columns ?? []) {
          const sourceIndex = headerIndexMap.get(definition.label);
          const sourceCell = sourceIndex === undefined ? null : row.cells[sourceIndex] ?? null;

          const rawText = sourceCell?.text ?? '';
          const rawHtml = sourceCell?.innerHtml ?? '';

          cells.push({
            columnIndex: definition.columnIndex,
            headerLabel: definition.label,
            headerKey: definition.key,
            rawText,
            rawHtml,
          });

          valuesByKey[definition.key] = rawText;
        }

        tabs[tabKey] = {
          cells,
          valuesByKey,
        };

        rowsByTab[tabKey] = {
          rowHtml: row.rowHtml,
          dataDetailsRaw: row.dataDetailsRaw,
        };
      });

      moves.push({
        moveId,
        groupKey: group.groupKey,
        groupHeading: group.heading,
        rowIndex,
        input,
        tabs: {
          general: tabs.general ?? { cells: [], valuesByKey: {} },
          details: tabs.details ?? { cells: [], valuesByKey: {} },
          meter: tabs.meter ?? { cells: [], valuesByKey: {} },
          properties: tabs.properties ?? { cells: [], valuesByKey: {} },
          notes: tabs.notes ?? { cells: [], valuesByKey: {} },
        },
        source: {
          rowsByTab: {
            general: rowsByTab.general ?? { rowHtml: '', dataDetailsRaw: null },
            details: rowsByTab.details ?? { rowHtml: '', dataDetailsRaw: null },
            meter: rowsByTab.meter ?? { rowHtml: '', dataDetailsRaw: null },
            properties: rowsByTab.properties ?? { rowHtml: '', dataDetailsRaw: null },
            notes: rowsByTab.notes ?? { rowHtml: '', dataDetailsRaw: null },
          },
        },
      });
    }
  }

  return {
    moves,
    error: errors.length > 0 ? errors.join('\n') : null,
  };
}

function toPreviewPayload(meta: SharedMeta, groups: RawGroup[]): PreviewPayload {
  return {
    meta,
    groupCount: groups.length,
    groups: groups.map((group) => ({
      groupKey: group.groupKey,
      heading: group.heading,
      tabs: group.tabs.map((tab) => ({
        tabName: tab.tabName,
        panelId: tab.panelId,
        rowCount: tab.rowCount,
        headers: tab.headers,
      })),
    })),
  };
}

function buildRawExtraction(meta: SharedMeta, groups: RawGroup[], pageHtml: string): RawExtraction {
  return {
    meta,
    groups,
    pageHtml,
  };
}

function buildBuildPayload(extraction: RawExtraction): SupercomboBuildPayload {
  const columnDefinitions = buildColumnDefinitions(extraction.groups);
  const moveBuild = buildMovePayload(extraction.groups, columnDefinitions);

  const mergedError = combineErrors([extraction.meta.extractionError, ensureAllTabs(extraction.groups), moveBuild.error]);

  return {
    meta: {
      canonicalUrl: extraction.meta.canonicalUrl,
      fetchUrl: extraction.meta.fetchUrl,
      capturedAt: extraction.meta.capturedAt,
      finalUrl: extraction.meta.finalUrl,
      revisionId: extraction.meta.revisionId,
      sourceType: extraction.meta.sourceType,
      status: extraction.meta.status,
      lastEditedText: extraction.meta.lastEditedText,
      extractionError: mergedError,
    },
    columnDefinitions,
    moves: moveBuild.moves,
  };
}

async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

async function writeText(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, content, 'utf8');
}

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function scrapeSupercombo(): Promise<RawExtraction> {
  const capturedAt = new Date().toISOString();

  let pageHtml = '';
  let finalUrl = FETCH_URL;
  let status: number | null = null;
  let revisionId: number | null = null;
  let lastEditedText: string | null = null;
  let groups: RawGroup[] = [];
  let crawlError: string | null = null;

  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 1,
    maxConcurrency: 1,
    requestHandlerTimeoutSecs: 180,
    preNavigationHooks: [
      async (_context, gotOptions) => {
        gotOptions.headers = {
          ...(gotOptions.headers ?? {}),
          ...REQUEST_HEADERS,
        };
      },
    ],
    async requestHandler({ $, request, response, body }) {
      pageHtml = typeof body === 'string' ? body : normalizeOptionalString($.html()) ?? '';
      finalUrl = request.loadedUrl ?? request.url;

      const maybeStatus = (response as { statusCode?: unknown } | undefined)?.statusCode;
      status = typeof maybeStatus === 'number' ? maybeStatus : null;

      groups = extractGroups($);
      revisionId = parseRevisionId(pageHtml);
      lastEditedText = extractLastEditedText($);
    },
    failedRequestHandler({ request, error, log: crawlerLog }) {
      const reason = `failed request: ${request.url} (${toErrorMessage(error)})`;
      crawlerLog.error(reason);
      crawlError = combineErrors([crawlError, reason]);
    },
  });

  try {
    await crawler.run([FETCH_URL]);
  } catch (error) {
    crawlError = combineErrors([crawlError, `crawler failed: ${toErrorMessage(error)}`]);
  }

  const missingTabsError = ensureAllTabs(groups);
  const emptyGroupsError = groups.length === 0 ? 'no tabber groups were extracted from the fetched HTML' : null;
  const challengePageError =
    pageHtml.length > 0 && detectChallengePage(pageHtml) ? 'fetched HTML appears to be an anti-bot challenge page' : null;

  const extractionError = combineErrors([crawlError, missingTabsError, emptyGroupsError, challengePageError]);

  const meta: SharedMeta = {
    requestedUrls: REQUESTED_URLS,
    canonicalUrl: CANONICAL_URL,
    fetchUrl: FETCH_URL,
    sourceType: SOURCE_TYPE,
    capturedAt,
    finalUrl,
    status,
    revisionId,
    lastEditedText,
    extractionError,
  };

  return buildRawExtraction(meta, groups, pageHtml);
}

async function writeBuildArtifacts(extraction: RawExtraction): Promise<void> {
  await ensureDir(ARTIFACT_DIR);
  await ensureDir(DATA_DIR);

  const previewPayload = toPreviewPayload(extraction.meta, extraction.groups);
  const buildPayload = buildBuildPayload(extraction);

  await writeText(PAGE_HTML_PATH, extraction.pageHtml);
  await writeJson(TABS_PREVIEW_PATH, previewPayload);
  await writeJson(RAW_JSON_PATH, buildPayload);

  log.info(`saved: ${PAGE_HTML_PATH}`);
  log.info(`saved: ${TABS_PREVIEW_PATH}`);
  log.info(`saved: ${RAW_JSON_PATH}`);

  if (buildPayload.meta.extractionError) {
    throw new Error(buildPayload.meta.extractionError);
  }
}

async function main(): Promise<void> {
  log.info(`starting supercombo scraper for ${FETCH_URL}`);

  const extraction = await scrapeSupercombo();

  await writeBuildArtifacts(extraction);
}

main().catch((error) => {
  console.error(`[scrape:jp:supercombo] failed: ${toErrorMessage(error)}`);
  process.exitCode = 1;
});

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

type RawRow = {
  index: number;
  cellsHtml: string[];
  cellsText: string[];
  rowHtml: string;
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

type RawMeta = {
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

type RawPayload = {
  meta: RawMeta;
  groups: RawGroup[];
};

type PreviewPayload = {
  meta: RawMeta;
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
    normalized.includes('making sure you\'re not a bot') ||
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

      rows.push({
        index: rowIndex,
        cellsHtml: cells
          .map((__: number, cellElement: any) => normalizeOptionalString($(cellElement).html()) ?? '')
          .get(),
        cellsText: cells.map((__: number, cellElement: any) => normalizeText($(cellElement).text())).get(),
        rowHtml: normalizeOptionalString($.html(rowElement)) ?? '',
        dataDetailsRaw: normalizeOptionalString(row.attr('data-details')),
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

async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

async function writeText(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, content, 'utf8');
}

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  await ensureDir(ARTIFACT_DIR);
  await ensureDir(DATA_DIR);

  const capturedAt = new Date().toISOString();
  log.info(`starting supercombo scraper for ${FETCH_URL}`);

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

  const missingTabs = detectMissingTabs(groups);
  const missingTabsError =
    missingTabs.length > 0 ? `missing tabs by group:\n${missingTabs.map((line) => `- ${line}`).join('\n')}` : null;
  const emptyGroupsError = groups.length === 0 ? 'no tabber groups were extracted from the fetched HTML' : null;
  const challengePageError =
    pageHtml.length > 0 && detectChallengePage(pageHtml) ? 'fetched HTML appears to be an anti-bot challenge page' : null;

  const extractionError = combineErrors([crawlError, missingTabsError, emptyGroupsError, challengePageError]);

  const meta: RawMeta = {
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

  const rawPayload: RawPayload = {
    meta,
    groups,
  };

  const previewPayload: PreviewPayload = {
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

  await writeText(PAGE_HTML_PATH, pageHtml);
  await writeJson(TABS_PREVIEW_PATH, previewPayload);
  await writeJson(RAW_JSON_PATH, rawPayload);

  log.info(`saved: ${PAGE_HTML_PATH}`);
  log.info(`saved: ${TABS_PREVIEW_PATH}`);
  log.info(`saved: ${RAW_JSON_PATH}`);

  if (extractionError) {
    throw new Error(extractionError);
  }
}

main().catch((error) => {
  console.error(`[scrape:jp:supercombo] failed: ${toErrorMessage(error)}`);
  process.exitCode = 1;
});

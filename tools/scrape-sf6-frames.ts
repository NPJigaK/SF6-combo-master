import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { PlaywrightCrawler, log } from 'crawlee';
import { chromium, type BrowserContext, type Page } from 'playwright';

const TARGET_URL = 'https://www.streetfighter.com/6/ja-jp/character/jp/frame';

const ARTIFACT_DIR = path.join('artifacts', 'jp', 'frame');
const DATA_DIR = path.join('data', 'jp');

const PAGE_HTML_PATH = path.join(ARTIFACT_DIR, 'page.html');
const PAGE_PNG_PATH = path.join(ARTIFACT_DIR, 'page.png');
const NETWORK_HAR_PATH = path.join(ARTIFACT_DIR, 'network.har');
const NETWORK_HAR_LOG_PATH = path.join(ARTIFACT_DIR, 'network.har.log.txt');
const NETWORK_RESPONSES_PATH = path.join(ARTIFACT_DIR, 'network.responses.jsonl');
const TABLES_PREVIEW_PATH = path.join(ARTIFACT_DIR, 'tables.preview.json');
const RAW_JSON_PATH = path.join(DATA_DIR, 'frame.raw.json');
const COMBO_JSON_PATH = path.join(DATA_DIR, 'frame.combo.json');
const PUBLIC_CONTROLLER_BASE_PATH = '/assets/controller';

type ResponseEntry = {
  url: string;
  status: number;
  method: string;
  resourceType: string;
};

type RawRow = {
  index: number;
  text: string;
  cells: string[];
  cellCount?: number;
  nonEmptyCellCount?: number;
  rowKind?: 'data' | 'section' | 'note' | 'other';
  skillName?: string;
  commandInput?: {
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
  commandInput?: RawRow['commandInput'];
  source: {
    rowKind?: RawRow['rowKind'];
    cellCount?: number;
    nonEmptyCellCount?: number;
    cells: string[];
  };
};

type HarCaptureResult = {
  finalUrl: string;
  responses: ResponseEntry[];
  harCaptured: boolean;
  harError?: string;
};

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

async function writeResponsesJsonl(entries: ResponseEntry[]): Promise<void> {
  const lines = entries.map((entry) => JSON.stringify(entry)).join('\n');
  const trailingNewline = lines.length > 0 ? '\n' : '';
  await writeText(NETWORK_RESPONSES_PATH, `${lines}${trailingNewline}`);
}

async function captureHarArtifact(): Promise<HarCaptureResult> {
  const responses: ResponseEntry[] = [];
  let finalUrl = TARGET_URL;
  let harCaptured = false;
  let harError: string | undefined;

  const browser = await chromium.launch({ headless: true });
  let context: BrowserContext | undefined;

  try {
    context = await browser.newContext({
      recordHar: {
        path: NETWORK_HAR_PATH,
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

    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await waitForFrameCandidates(page);
    finalUrl = page.url();

    try {
      await page.waitForLoadState('networkidle', { timeout: 6_000 });
    } catch {
      // keep moving in PoC mode
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
    const harStats = await stat(NETWORK_HAR_PATH);
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

  const collectRows = (el) => {
    let rowNodes = [];
    const tagName = el.tagName ? el.tagName.toUpperCase() : '';

    if (tagName === 'TABLE') {
      // Prefer real table rows to avoid grabbing nested list items in note cells.
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

    const headingGuess = headingGuessFor(el);
    const previewRows = rows.slice(0, 5).map((row) => row.text);
    const hasCells = rows.some((row) => (row.nonEmptyCellCount || row.cells.filter((cell) => cell.length > 0).length) > 1);
    const score = baseScore + rows.length + (headingGuess ? 3 : 0) + (hasCells ? 2 : 0);

    candidates.push({
      id: 'c' + (candidates.length + 1),
      kind,
      headingGuess,
      rowCount: rows.length,
      previewRows,
      score,
      selectorHint: selectorHintFor(el),
      rows,
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

const COMBO_COLUMNS = [
  '技名',
  '発生（動作フレーム）',
  '持続（動作フレーム）',
  '硬直（動作フレーム）',
  'ヒット（硬直差）',
  'ガード（硬直差）',
  'キャンセル',
  'ダメージ',
  'コンボ補正値',
  'ヒット（Dゲージ増加）',
  'ガード（Dゲージ減少）',
  'パニッシュカウンター（Dゲージ減少）',
  'SAゲージ増加',
  '属性',
  '備考',
] as const;

const COMBO_GLOSSARY = {
  active:
    '動作フレーム発生持続技の動作中に攻撃判定が発生しているフレームを表します（例） 【10-12】表記の場合、【10F/11F/12F】の【3F】間、攻撃判定が持続',
  cancel:
    '【C】必殺技、ドライブインパクト、ドライブラッシュ、SAでキャンセル可能【SA】SA技でのみキャンセル可能【SA2】SA2、SA3でキャンセル可能【SA3】SA3でのみキャンセル可能【※】特定の技でのみキャンセル可能',
  comboCorrection:
    '通常のコンボ補正に加えて、技自体に特殊な補正が設定されている場合に記載されます。【始動補正】コンボの初段にヒットさせた際に加算される補正【コンボ補正】コンボの2段目以降にヒットさせた際に加算される補正【即時補正】コンボの2段目以降にヒットさせた際、その技自体に加算される補正【乗算補正】コンボに組み込んだ際に、それ以降のコンボ補正値に乗算される補正値',
  driveGaugeGainHit: '攻撃側のドライブゲージ増加量（ヒット時）',
  driveGaugeLossGuard: '防御側のドライブゲージ減少量（ガード時）',
  driveGaugeLossPunishCounter: '防御側のドライブゲージ減少量（パニッシュカウンター時）',
  attribute:
    '攻撃判定の属性を表します【上】立ち/しゃがみガード可能な上段攻撃【中】立ちガードのみ可能な中段攻撃【下】しゃがみガードのみ可能な下段攻撃【投】ガードできない投げ技【弾】飛び道具【空弾】空中判定の飛び道具',
} as const;

function buildComboRows(rows: RawRow[]): ComboRow[] {
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

    if (row.cellCount !== 15 || row.cells.length !== 15) {
      continue;
    }

    const skillName = (row.cells[0] ?? '').trim();
    if (!skillName || skillName === '技名') {
      continue;
    }

    comboRows.push({
      index: row.index,
      section: currentSection,
      skillName,
      startup: row.cells[1] ?? '',
      active: row.cells[2] ?? '',
      recovery: row.cells[3] ?? '',
      hitAdvantage: row.cells[4] ?? '',
      guardAdvantage: row.cells[5] ?? '',
      cancel: row.cells[6] ?? '',
      damage: row.cells[7] ?? '',
      comboCorrection: row.cells[8] ?? '',
      driveGaugeGainHit: row.cells[9] ?? '',
      driveGaugeLossGuard: row.cells[10] ?? '',
      driveGaugeLossPunishCounter: row.cells[11] ?? '',
      saGaugeGain: row.cells[12] ?? '',
      attribute: row.cells[13] ?? '',
      notes: row.cells[14] ?? '',
      commandInput: row.commandInput,
      source: {
        rowKind: row.rowKind,
        cellCount: row.cellCount,
        nonEmptyCellCount: row.nonEmptyCellCount,
        cells: row.cells,
      },
    });
  }

  return comboRows;
}

async function runCrawlerAndWriteArtifacts(metaInput: {
  capturedAt: string;
  harCaptured: boolean;
  harError?: string;
  harFinalUrl: string;
}): Promise<{ finalUrl: string }> {
  let finalUrl = metaInput.harFinalUrl;

  const crawler = new PlaywrightCrawler({
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
      await writeText(PAGE_HTML_PATH, html);
      await page.screenshot({ path: PAGE_PNG_PATH, fullPage: true });

      let candidates: Candidate[] = [];
      let extractionError: string | undefined;
      try {
        candidates = await extractCandidates(page);
      } catch (error) {
        extractionError = `candidate extraction failed: ${toErrorMessage(error)}`;
        crawlerLog.warning(extractionError);
      }

      const bestCandidate = candidates[0];
      const bestCandidateId = bestCandidate?.id ?? null;
      const sharedMeta = {
        targetUrl: TARGET_URL,
        finalUrl,
        capturedAt: metaInput.capturedAt,
        harCaptured: metaInput.harCaptured,
        harError: metaInput.harError ?? null,
        extractionError: extractionError ?? null,
      };

      await writeJson(TABLES_PREVIEW_PATH, {
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
        })),
      });

      const rawRows = attachLocalControllerPaths(bestCandidate?.rows ?? []);
      await writeJson(RAW_JSON_PATH, {
        meta: sharedMeta,
        source: 'best-candidate',
        bestCandidateId,
        candidateCount: candidates.length,
        rows: rawRows,
      });

      const comboRows = buildComboRows(rawRows);
      await writeJson(COMBO_JSON_PATH, {
        meta: {
          ...sharedMeta,
          source: 'best-candidate',
          mappingVersion: 1,
          fixedCellCount: 15,
          columns: COMBO_COLUMNS,
        },
        glossary: COMBO_GLOSSARY,
        rows: comboRows,
      });
    },
  });

  await crawler.run([TARGET_URL]);
  return { finalUrl };
}

async function writeFallbackJson(meta: {
  capturedAt: string;
  harCaptured: boolean;
  harError?: string;
  finalUrl: string;
  extractionError: string;
}): Promise<void> {
  const sharedMeta = {
    targetUrl: TARGET_URL,
    finalUrl: meta.finalUrl,
    capturedAt: meta.capturedAt,
    harCaptured: meta.harCaptured,
    harError: meta.harError ?? null,
    extractionError: meta.extractionError,
  };

  await writeJson(TABLES_PREVIEW_PATH, {
    meta: sharedMeta,
    bestCandidateId: null,
    candidates: [],
  });

  await writeJson(RAW_JSON_PATH, {
    meta: sharedMeta,
    source: 'best-candidate',
    bestCandidateId: null,
    candidateCount: 0,
    rows: [],
  });

  await writeJson(COMBO_JSON_PATH, {
    meta: {
      ...sharedMeta,
      source: 'best-candidate',
      mappingVersion: 1,
      fixedCellCount: 15,
      columns: COMBO_COLUMNS,
    },
    glossary: COMBO_GLOSSARY,
    rows: [],
  });
}

async function main(): Promise<void> {
  await ensureDir(ARTIFACT_DIR);
  await ensureDir(DATA_DIR);

  const capturedAt = new Date().toISOString();
  log.info(`starting scraper for ${TARGET_URL}`);

  const harResult = await captureHarArtifact();
  if (!harResult.harCaptured) {
    const reason = harResult.harError ?? 'HAR was not captured (unknown reason).';
    const details = [`capturedAt=${capturedAt}`, `targetUrl=${TARGET_URL}`, `finalUrl=${harResult.finalUrl}`, `reason=${reason}`].join('\n');
    await writeText(NETWORK_HAR_LOG_PATH, `${details}\n`);
    await writeResponsesJsonl(harResult.responses);
    log.warning(`HAR capture unavailable, wrote fallback logs: ${NETWORK_HAR_LOG_PATH}`);
  }

  try {
    const crawlResult = await runCrawlerAndWriteArtifacts({
      capturedAt,
      harCaptured: harResult.harCaptured,
      harError: harResult.harError,
      harFinalUrl: harResult.finalUrl,
    });
    log.info(`crawler completed, finalUrl=${crawlResult.finalUrl}`);
  } catch (error) {
    const extractionError = `crawler failed: ${toErrorMessage(error)}`;
    await writeFallbackJson({
      capturedAt,
      harCaptured: harResult.harCaptured,
      harError: harResult.harError,
      finalUrl: harResult.finalUrl,
      extractionError,
    });
    throw error;
  }

  if (!harResult.harCaptured && !existsSync(NETWORK_RESPONSES_PATH)) {
    await writeResponsesJsonl([]);
  }

  log.info(`saved: ${PAGE_HTML_PATH}`);
  log.info(`saved: ${PAGE_PNG_PATH}`);
  log.info(`saved: ${TABLES_PREVIEW_PATH}`);
  log.info(`saved: ${RAW_JSON_PATH}`);
  log.info(`saved: ${COMBO_JSON_PATH}`);
  if (harResult.harCaptured) {
    log.info(`saved: ${NETWORK_HAR_PATH}`);
  } else {
    log.info(`saved fallback: ${NETWORK_HAR_LOG_PATH}`);
    log.info(`saved fallback: ${NETWORK_RESPONSES_PATH}`);
  }
}

main().catch((error) => {
  const message = toErrorMessage(error);
  console.error(`[scrape:jp] failed: ${message}`);
  process.exitCode = 1;
});

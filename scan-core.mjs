/**
 * Shared portal scan logic — used by scan.mjs (CLI) and the web app (job preview).
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { join } from 'path';
import { buildJobLocationFilter } from './scan-location-filter.mjs';

export const CONCURRENCY = 10;
export const FETCH_TIMEOUT_MS = 10_000;

export function detectApi(company) {
  if (company.api && company.api.includes('greenhouse')) {
    return { type: 'greenhouse', url: company.api };
  }

  const url = company.careers_url || '';

  const ashbyMatch = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
  if (ashbyMatch) {
    return {
      type: 'ashby',
      url: `https://api.ashbyhq.com/posting-api/job-board/${ashbyMatch[1]}?includeCompensation=true`,
    };
  }

  const leverMatch = url.match(/jobs\.lever\.co\/([^/?#]+)/);
  if (leverMatch) {
    return {
      type: 'lever',
      url: `https://api.lever.co/v0/postings/${leverMatch[1]}`,
    };
  }

  const ghEuMatch = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/);
  if (ghEuMatch && !company.api) {
    return {
      type: 'greenhouse',
      url: `https://boards-api.greenhouse.io/v1/boards/${ghEuMatch[1]}/jobs`,
    };
  }

  return null;
}

function parseGreenhouse(json, companyName) {
  const jobs = json.jobs || [];
  return jobs.map((j) => {
    const raw = j.first_published ?? j.updated_at;
    const postedAtMs = postedAtToMs(raw);
    return {
      title: j.title || '',
      url: j.absolute_url || '',
      company: companyName,
      location: j.location?.name || '',
      postedAtMs,
    };
  });
}

function parseAshby(json, companyName) {
  const jobs = json.jobs || [];
  return jobs.map((j) => {
    const postedAtMs = postedAtToMs(j.publishedAt);
    return {
      title: j.title || '',
      url: j.jobUrl || '',
      company: companyName,
      location: j.location || '',
      postedAtMs,
    };
  });
}

function parseLever(json, companyName) {
  if (!Array.isArray(json)) return [];
  return json.map((j) => {
    const postedAtMs = postedAtToMs(j.createdAt);
    return {
      title: j.text || '',
      url: j.hostedUrl || '',
      company: companyName,
      location: j.categories?.location || '',
      postedAtMs,
    };
  });
}

const PARSERS = { greenhouse: parseGreenhouse, ashby: parseAshby, lever: parseLever };

function postedAtToMs(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const t = Date.parse(String(raw));
  return Number.isNaN(t) ? null : t;
}

export function formatPostedYmd(ms) {
  if (ms == null) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function sortOffersByPostedAt(offers, scanOptions) {
  const raw = scanOptions?.sort_by;
  const by = raw === undefined || raw === null ? 'posted_at' : raw;
  if (by === 'none') return offers;
  if (by !== 'posted_at') return offers;
  const asc = scanOptions?.sort_order === 'asc';
  return [...offers].sort((a, b) => {
    const am = a.postedAtMs;
    const bm = b.postedAtMs;
    const aKey = am != null ? am : asc ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    const bKey = bm != null ? bm : asc ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    return asc ? aKey - bKey : bKey - aKey;
  });
}

export async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export function buildTitleFilter(titleFilter) {
  const positive = (titleFilter?.positive || []).map((k) => k.toLowerCase());
  const negative = (titleFilter?.negative || []).map((k) => k.toLowerCase());

  return (title) => {
    const lower = title.toLowerCase();
    const hasPositive = positive.length === 0 || positive.some((k) => lower.includes(k));
    const hasNegative = negative.some((k) => lower.includes(k));
    return hasPositive && !hasNegative;
  };
}

export function loadSeenUrls(careerOpsRoot) {
  const seen = new Set();
  const scanHistoryPath = join(careerOpsRoot, 'data', 'scan-history.tsv');
  const pipelinePath = join(careerOpsRoot, 'data', 'pipeline.md');
  const applicationsPath = join(careerOpsRoot, 'data', 'applications.md');

  if (existsSync(scanHistoryPath)) {
    const lines = readFileSync(scanHistoryPath, 'utf-8').split('\n');
    for (const line of lines.slice(1)) {
      const url = line.split('\t')[0];
      if (url) seen.add(url);
    }
  }

  if (existsSync(pipelinePath)) {
    const text = readFileSync(pipelinePath, 'utf-8');
    for (const match of text.matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
      seen.add(match[1]);
    }
  }

  if (existsSync(applicationsPath)) {
    const text = readFileSync(applicationsPath, 'utf-8');
    for (const match of text.matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(match[0]);
    }
  }

  return seen;
}

export function loadSeenCompanyRoles(careerOpsRoot) {
  const seen = new Set();
  const applicationsPath = join(careerOpsRoot, 'data', 'applications.md');
  if (existsSync(applicationsPath)) {
    const text = readFileSync(applicationsPath, 'utf-8');
    for (const match of text.matchAll(/\|[^|]+\|[^|]+\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g)) {
      const company = match[1].trim().toLowerCase();
      const role = match[2].trim().toLowerCase();
      if (company && role && company !== 'company') {
        seen.add(`${company}::${role}`);
      }
    }
  }
  return seen;
}

export function formatPipelineLine(o, showPosted) {
  let line = `- [ ] ${o.url} | ${o.company} | ${o.title}`;
  if (showPosted && o.postedAtMs != null) {
    const ymd = formatPostedYmd(o.postedAtMs);
    if (ymd) line += ` | ${ymd}`;
  }
  if (o.location) {
    line += ` | ${o.location}`;
  }
  return line;
}

/**
 * Returns updated pipeline.md text after appending offers (no filesystem I/O).
 */
export function appendOffersToPipelineMarkdown(text, offers, { showPostedInPipeline } = {}) {
  if (offers.length === 0) return text;
  let out = String(text ?? '');

  const marker = '## Pendientes';
  const idx = out.indexOf(marker);
  if (idx === -1) {
    const procIdx = out.indexOf('## Procesadas');
    const insertAt = procIdx === -1 ? out.length : procIdx;
    const block =
      `\n${marker}\n\n` +
      offers.map((o) => formatPipelineLine(o, showPostedInPipeline)).join('\n') +
      '\n\n';
    out = out.slice(0, insertAt) + block + out.slice(insertAt);
  } else {
    const afterMarker = idx + marker.length;
    const nextSection = out.indexOf('\n## ', afterMarker);
    const insertAt = nextSection === -1 ? out.length : nextSection;
    const block =
      '\n' + offers.map((o) => formatPipelineLine(o, showPostedInPipeline)).join('\n') + '\n';
    out = out.slice(0, insertAt) + block + out.slice(insertAt);
  }

  return out;
}

export function appendToPipeline(careerOpsRoot, offers, opts = {}) {
  if (offers.length === 0) return;
  const pipelinePath = join(careerOpsRoot, 'data', 'pipeline.md');
  let text = readFileSync(pipelinePath, 'utf-8');
  text = appendOffersToPipelineMarkdown(text, offers, opts);
  writeFileSync(pipelinePath, text, 'utf-8');
}

export function appendToScanHistory(careerOpsRoot, offers, date) {
  const scanHistoryPath = join(careerOpsRoot, 'data', 'scan-history.tsv');
  if (!existsSync(scanHistoryPath)) {
    writeFileSync(scanHistoryPath, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf-8');
  }

  const lines =
    offers
      .map((o) => `${o.url}\t${date}\t${o.source}\t${o.title}\t${o.company}\tadded`)
      .join('\n') + '\n';

  appendFileSync(scanHistoryPath, lines, 'utf-8');
}

async function parallelFetch(tasks, limit) {
  let i = 0;
  async function next() {
    while (i < tasks.length) {
      const task = tasks[i++];
      await task();
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => next());
  await Promise.all(workers);
}

const MS_DAY = 24 * 60 * 60 * 1000;

/**
 * Fetch and filter jobs from portals config (same rules as scan.mjs).
 * @param {string} careerOpsRoot
 * @param {object} config — parsed portals.yml
 * @param {object} options
 * @param {boolean} [options.allLocations]
 * @param {string|null} [options.filterCompany] — lowercase substring on company name
 * @param {number|null} [options.recencyCutoffMs] — only jobs with postedAt >= this
 * @param {boolean} [options.respectDedup=true] — if false, show all matches (web preview)
 * @param {number} [options.maxJobs=8000]
 */
export async function collectMatchingJobs(careerOpsRoot, config, options = {}) {
  const {
    allLocations = false,
    filterCompany = null,
    recencyCutoffMs = null,
    respectDedup = true,
    maxJobs = 8000,
  } = options;

  const companies = config.tracked_companies || [];
  const titleFilter = buildTitleFilter(config.title_filter);
  const jobLocationFilter = allLocations
    ? () => true
    : buildJobLocationFilter(config.location_filter);

  const targets = companies
    .filter((c) => c.enabled !== false)
    .filter((c) => !filterCompany || c.name.toLowerCase().includes(filterCompany.toLowerCase()))
    .map((c) => ({ ...c, _api: detectApi(c) }))
    .filter((c) => c._api !== null);

  const seenUrls = respectDedup ? loadSeenUrls(careerOpsRoot) : new Set();
  const seenCompanyRoles = respectDedup ? loadSeenCompanyRoles(careerOpsRoot) : new Set();

  const newOffers = [];
  const errors = [];
  let totalFound = 0;
  let totalFiltered = 0;
  let totalLocationFiltered = 0;
  let totalRecencyFiltered = 0;
  let totalDupes = 0;

  const tasks = targets.map((company) => async () => {
    const { type, url } = company._api;
    try {
      const json = await fetchJson(url);
      const jobs = PARSERS[type](json, company.name);
      totalFound += jobs.length;

      for (const job of jobs) {
        if (!jobLocationFilter(job)) {
          totalLocationFiltered++;
          continue;
        }
        if (!titleFilter(job.title)) {
          totalFiltered++;
          continue;
        }
        if (recencyCutoffMs != null) {
          if (job.postedAtMs == null || job.postedAtMs < recencyCutoffMs) {
            totalRecencyFiltered++;
            continue;
          }
        }
        if (respectDedup) {
          if (seenUrls.has(job.url)) {
            totalDupes++;
            continue;
          }
          const key = `${job.company.toLowerCase()}::${job.title.toLowerCase()}`;
          if (seenCompanyRoles.has(key)) {
            totalDupes++;
            continue;
          }
          seenUrls.add(job.url);
          seenCompanyRoles.add(key);
        }
        newOffers.push({ ...job, source: `${type}-api` });
      }
    } catch (err) {
      errors.push({ company: company.name, error: err.message });
    }
  });

  await parallelFetch(tasks, CONCURRENCY);

  const scanOptions = config.scan_options || {};
  const sortedOffers = sortOffersByPostedAt(newOffers, scanOptions);
  const offers = sortedOffers.slice(0, maxJobs);

  return {
    offers,
    errors,
    stats: {
      companiesScanned: targets.length,
      totalFound,
      totalFiltered,
      totalLocationFiltered,
      totalRecencyFiltered,
      totalDupes,
      returned: offers.length,
    },
  };
}

export function parseRecencyWindowMs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  if (args.includes('--last-day') || args.includes('--last_day')) {
    return { windowMs: MS_DAY, label: 'last 24 hours' };
  }
  if (args.includes('--last-week') || args.includes('--last_week')) {
    return { windowMs: 7 * MS_DAY, label: 'last 7 days' };
  }
  let i = args.indexOf('--since-days');
  if (i === -1) i = args.indexOf('--since_days');
  if (i !== -1) {
    const n = parseFloat(args[i + 1]);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error('--since-days requires a positive number');
    }
    return { windowMs: n * MS_DAY, label: `last ${n} day(s)` };
  }
  return null;
}

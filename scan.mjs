#!/usr/bin/env node

/**
 * scan.mjs — Zero-token portal scanner
 *
 * Fetches Greenhouse, Ashby, and Lever APIs directly, applies US location
 * rules first (job title + API location via isUSJobLocation), then title
 * filters from portals.yml, deduplicates against existing history,
 * and appends new offers to pipeline.md + scan-history.tsv.
 *
 * Zero Claude API tokens — pure HTTP + JSON.
 *
 * Usage:
 *   node scan.mjs                  # scan all enabled companies
 *   node scan.mjs --dry-run        # preview without writing files
 *   node scan.mjs --company Cohere # scan a single company
 *   node scan.mjs --all-locations  # ignore portals.yml location_filter (include non-US)
 *   node scan.mjs --last-day       # only jobs posted in the last 24 hours (rolling)
 *   node scan.mjs --last-week      # only jobs posted in the last 7 days (rolling)  (--last_week also works)
 *   node scan.mjs --since-days 3   # only jobs posted in the last N days (rolling)  (--since_days N also works)
 *
 * portals.yml scan_options: sort_by posted_at (ATS first_published / publishedAt / createdAt),
 * sort_order desc|asc, show_posted_in_pipeline for optional YYYY-MM-DD on pipeline lines.
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import {
  collectMatchingJobs,
  appendToPipeline,
  appendToScanHistory,
  parseRecencyWindowMs,
  formatPostedYmd,
} from './scan-core.mjs';

const parseYaml = yaml.load;

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAREER_ROOT = __dirname;
const PORTALS_PATH = join(CAREER_ROOT, 'portals.yml');

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const allLocations = args.includes('--all-locations');
  const companyFlag = args.indexOf('--company');
  const filterCompany = companyFlag !== -1 ? args[companyFlag + 1] : null;
  let recency;
  try {
    recency = parseRecencyWindowMs(args);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
  const recencyCutoffMs = recency ? Date.now() - recency.windowMs : null;

  if (!existsSync(PORTALS_PATH)) {
    console.error('Error: portals.yml not found. Run onboarding first.');
    process.exit(1);
  }

  const config = parseYaml(readFileSync(PORTALS_PATH, 'utf-8'));

  if (allLocations) {
    console.log('Location filter: disabled (--all-locations)\n');
  } else if ((config.location_filter?.mode || 'none') === 'us') {
    console.log('Location filter: US only (portals.yml location_filter)\n');
  }
  if (recency) {
    console.log(`Posted-date filter: ${recency.label} (jobs without ATS date excluded)\n`);
  }

  const { offers, errors, stats } = await collectMatchingJobs(CAREER_ROOT, config, {
    allLocations,
    filterCompany,
    recencyCutoffMs,
    respectDedup: true,
  });

  const scanOptions = config.scan_options || {};
  const sortByEff =
    scanOptions.sort_by === undefined || scanOptions.sort_by === null
      ? 'posted_at'
      : scanOptions.sort_by;
  if (sortByEff === 'posted_at' && offers.length > 0) {
    console.log(
      `Sort: by posted date (${scanOptions.sort_order === 'asc' ? 'oldest first' : 'newest first'})\n`
    );
  }

  const companies = config.tracked_companies || [];
  const skippedCount =
    companies.filter((c) => c.enabled !== false).length - stats.companiesScanned;

  console.log(`Scanning ${stats.companiesScanned} companies via API (${skippedCount} skipped — no API detected)`);
  if (dryRun) console.log('(dry run — no files will be written)\n');

  const date = new Date().toISOString().slice(0, 10);

  if (!dryRun && offers.length > 0) {
    appendToPipeline(CAREER_ROOT, offers, {
      showPostedInPipeline: scanOptions.show_posted_in_pipeline !== false,
    });
    appendToScanHistory(CAREER_ROOT, offers, date);
  }

  const pipelinePath = join(CAREER_ROOT, 'data', 'pipeline.md');
  const scanHistoryPath = join(CAREER_ROOT, 'data', 'scan-history.tsv');

  console.log(`\n${'━'.repeat(45)}`);
  console.log(`Portal Scan — ${date}`);
  console.log(`${'━'.repeat(45)}`);
  console.log(`Companies scanned:     ${stats.companiesScanned}`);
  console.log(`Total jobs found:      ${stats.totalFound}`);
  console.log(`Filtered by title:     ${stats.totalFiltered} removed`);
  console.log(`Filtered by location:   ${stats.totalLocationFiltered} removed`);
  if (recencyCutoffMs != null) {
    console.log(`Filtered by posted date: ${stats.totalRecencyFiltered} removed`);
  }
  console.log(`Duplicates:            ${stats.totalDupes} skipped`);
  console.log(`New offers added:      ${offers.length}`);

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) {
      console.log(`  ✗ ${e.company}: ${e.error}`);
    }
  }

  if (offers.length > 0) {
    console.log('\nNew offers:');
    for (const o of offers) {
      const ymd = formatPostedYmd(o.postedAtMs);
      const posted = ymd ? ` | posted ${ymd}` : '';
      console.log(`  + ${o.company} | ${o.title} | ${o.location || 'N/A'}${posted}`);
    }
    if (dryRun) {
      console.log('\n(dry run — run without --dry-run to save results)');
    } else {
      console.log(`\nResults saved to ${pipelinePath} and ${scanHistoryPath}`);
    }
  }

  console.log(`\n→ Run /career-ops pipeline to evaluate new offers.`);
  console.log('→ Share results and get help: https://discord.gg/8pRpHETxa4');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});

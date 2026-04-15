/**
 * Whitelisted local actions for the web UI.
 * Each action maps to a real script but is presented as a user-intent,
 * not a raw CLI command.  Never allows arbitrary shell.
 */
import { spawn } from 'child_process';
import { execPath } from 'process';
import { resolve, relative, join } from 'path';

const MAX_CAPTURE = 500_000;

/*──────────────────────────────────────────────────────────────────────
  Action catalog — grouped by what the *user* is trying to do
──────────────────────────────────────────────────────────────────────*/

export const COMMAND_CATALOG = [
  /* ── Setup & Workspace ─────────────────────────────────────────── */
  {
    id: 'doctor',
    label: 'Check setup',
    group: 'Setup & Workspace',
    icon: '🩺',
    description: 'Validates everything is in place: Node version, dependencies, Playwright, CV, profile, portals, fonts, and output directories. Run this first if anything feels broken.',
    resultHint: 'checklist',
    timeoutMs: 120_000,
  },
  {
    id: 'sync-check',
    label: 'CV & profile consistency',
    group: 'Setup & Workspace',
    icon: '🔗',
    description: 'Compares your CV, profile YAML, and mode files to spot inconsistencies — missing CV, placeholder profile data, hardcoded metrics in prompts, or a stale article digest.',
    resultHint: 'checklist',
  },

  /* ── Find Jobs ─────────────────────────────────────────────────── */
  {
    id: 'scan',
    label: 'Scan for new jobs',
    group: 'Find Jobs',
    icon: '📡',
    description: 'Pulls the latest openings from Greenhouse, Ashby, and Lever APIs for every company in your portals.yml. New matches land in your pipeline inbox for evaluation.',
    resultHint: 'scan-summary',
    timeoutMs: 600_000,
    fields: {
      dryRun: { type: 'boolean', label: 'Preview only (don\'t write to pipeline)' },
      allLocations: { type: 'boolean', label: 'Include all locations (skip US-only filter)' },
      company: { type: 'string', label: 'Limit to one company', placeholder: 'e.g. Anthropic', optional: true },
      recency: {
        type: 'select',
        label: 'How recent?',
        options: [
          { value: '', label: 'Any time' },
          { value: 'day', label: 'Last 24 hours' },
          { value: 'week', label: 'Last 7 days' },
          { value: 'since', label: 'Custom window' },
        ],
      },
      sinceDays: { type: 'number', label: 'Days back', placeholder: '3', optional: true, dependsOn: 'recency=since' },
    },
  },

  /* ── Maintain Tracker ──────────────────────────────────────────── */
  {
    id: 'verify',
    label: 'Health check',
    group: 'Maintain Tracker',
    icon: '🔍',
    description: 'Inspects your applications tracker for problems: non-canonical statuses, duplicate entries, broken report links, bad score formatting, and un-merged batch additions.',
    resultHint: 'checklist',
  },
  {
    id: 'normalize',
    label: 'Fix statuses',
    group: 'Maintain Tracker',
    icon: '🏷️',
    description: 'Cleans up non-standard status labels (Spanish, bold markdown, dates in the status column) and maps them to canonical English values. Creates a backup first.',
    resultHint: 'changes',
  },
  {
    id: 'dedup',
    label: 'Remove duplicates',
    group: 'Maintain Tracker',
    icon: '♻️',
    description: 'Finds rows for the same company + role, keeps the highest-scored one, and preserves the most advanced pipeline status. Creates a backup first.',
    resultHint: 'changes',
  },
  {
    id: 'merge',
    label: 'Merge batch results',
    group: 'Maintain Tracker',
    icon: '📥',
    description: 'Takes evaluation TSVs from batch/tracker-additions/ and merges them into the main tracker. Detects duplicates and updates scores when a re-evaluation scores higher.',
    resultHint: 'changes',
  },

  /* ── Insights ──────────────────────────────────────────────────── */
  {
    id: 'analyze-patterns',
    label: 'Rejection patterns',
    group: 'Insights',
    icon: '📊',
    description: 'Reads every report you\'ve generated and surfaces what\'s actually working: which archetypes convert, where geo-restrictions waste your time, what tech gaps keep appearing, and a recommended minimum score threshold.',
    resultHint: 'insights',
    fields: {
      summary: { type: 'boolean', label: 'Show human-readable summary (recommended)', default: true },
      minThreshold: { type: 'number', label: 'Min applications needed', placeholder: '5', optional: true },
    },
  },
  {
    id: 'followup',
    label: 'Follow-up timing',
    group: 'Insights',
    icon: '⏰',
    description: 'Calculates which active applications are overdue for a follow-up, who to contact, and when the next nudge should go out — based on configurable cadence rules.',
    resultHint: 'insights',
    fields: {
      summary: { type: 'boolean', label: 'Show human-readable dashboard (recommended)', default: true },
      overdueOnly: { type: 'boolean', label: 'Only show overdue items' },
      appliedDays: { type: 'number', label: 'Days before first follow-up', placeholder: '7', optional: true },
    },
  },

  /* ── Generate ──────────────────────────────────────────────────── */
  {
    id: 'generate-pdf',
    label: 'HTML → PDF',
    group: 'Generate',
    icon: '📄',
    description: 'Renders a tailored HTML CV to a clean, ATS-parseable PDF using Playwright\'s Chromium. Requires Chromium to be installed (run Doctor if unsure).',
    resultHint: 'file',
    timeoutMs: 300_000,
    fields: {
      inputHtml: { type: 'string', label: 'Input HTML file', placeholder: 'output/cv.html', default: 'output/cv.html' },
      outputPdf: { type: 'string', label: 'Output PDF path', placeholder: 'output/cv.pdf', default: 'output/cv.pdf' },
      format: {
        type: 'select',
        label: 'Paper size',
        options: [
          { value: 'a4', label: 'A4' },
          { value: 'letter', label: 'US Letter' },
        ],
      },
    },
  },

  /* ── System ────────────────────────────────────────────────────── */
  {
    id: 'update-check',
    label: 'Check for updates',
    group: 'System',
    icon: '🔄',
    description: 'Checks GitHub for a newer career-ops release. Your data (CV, tracker, profile, reports) is never touched by updates.',
    resultHint: 'update',
  },
  {
    id: 'update-apply',
    label: 'Apply update',
    group: 'System',
    icon: '⬆️',
    description: 'Downloads the latest system files (modes, scripts, templates) from GitHub. Creates a backup branch first. Your personal data stays untouched.',
    destructive: true,
    resultHint: 'update',
    timeoutMs: 300_000,
  },
  {
    id: 'rollback',
    label: 'Undo last update',
    group: 'System',
    icon: '↩️',
    description: 'Reverts system files to the state before the last update. Your data (CV, profile, tracker, reports) is never affected.',
    destructive: true,
    resultHint: 'update',
  },
];

/*──────────────────────────────────────────────────────────────────────
  Invocation resolution — builds safe argv from user options
──────────────────────────────────────────────────────────────────────*/

const COMPANY_RE = /^[\p{L}\p{N}\s\-_.&',/+()]+$/u;

function assertUnderRoot(root, relPath) {
  const trimmed = String(relPath || '').trim();
  if (!trimmed) throw new Error('path required');
  const abs = resolve(root, trimmed);
  const rel = relative(root, abs);
  if (rel.startsWith('..') || rel === '..') throw new Error('path must stay inside the workspace');
}

export function resolveInvocation(root, id, body = {}) {
  const meta = COMMAND_CATALOG.find((c) => c.id === id);
  if (!meta) throw new Error(`unknown command: ${id}`);

  const timeoutMs = meta.timeoutMs ?? 120_000;
  const cwd = root;

  switch (id) {
    case 'doctor':
      return { argv: ['doctor.mjs'], cwd, display: 'node doctor.mjs', timeoutMs };
    case 'verify':
      return { argv: ['verify-pipeline.mjs'], cwd, display: 'node verify-pipeline.mjs', timeoutMs };
    case 'sync-check':
      return { argv: ['cv-sync-check.mjs'], cwd, display: 'node cv-sync-check.mjs', timeoutMs };
    case 'normalize':
      return { argv: ['normalize-statuses.mjs'], cwd, display: 'node normalize-statuses.mjs', timeoutMs };
    case 'dedup':
      return { argv: ['dedup-tracker.mjs'], cwd, display: 'node dedup-tracker.mjs', timeoutMs };
    case 'merge':
      return { argv: ['merge-tracker.mjs'], cwd, display: 'node merge-tracker.mjs', timeoutMs };
    case 'update-check':
      return { argv: ['update-system.mjs', 'check'], cwd, display: 'node update-system.mjs check', timeoutMs };
    case 'update-apply':
      return { argv: ['update-system.mjs', 'apply'], cwd, display: 'node update-system.mjs apply', timeoutMs };
    case 'rollback':
      return { argv: ['update-system.mjs', 'rollback'], cwd, display: 'node update-system.mjs rollback', timeoutMs };

    case 'scan': {
      const argv = ['scan.mjs'];
      if (body.dryRun) argv.push('--dry-run');
      if (body.allLocations) argv.push('--all-locations');
      const co = String(body.company || '').trim();
      if (co) {
        if (co.length > 120 || !COMPANY_RE.test(co)) throw new Error('invalid company filter');
        argv.push('--company', co);
      }
      const rec = String(body.recency || '');
      if (rec === 'day') argv.push('--last-day');
      else if (rec === 'week') argv.push('--last-week');
      else if (rec === 'since') {
        const n = Math.min(365, Math.max(1, Math.floor(Number(body.sinceDays) || 7)));
        argv.push('--since-days', String(n));
      }
      return { argv, cwd, display: `node ${argv.join(' ')}`, timeoutMs };
    }

    case 'generate-pdf': {
      const inputHtml = String(body.inputHtml || 'output/cv.html').trim();
      const outputPdf = String(body.outputPdf || 'output/cv.pdf').trim();
      assertUnderRoot(root, inputHtml);
      assertUnderRoot(root, outputPdf);
      const fmt = body.format === 'letter' ? 'letter' : 'a4';
      const argv = ['generate-pdf.mjs', inputHtml, outputPdf, `--format=${fmt}`];
      return { argv, cwd, display: `node ${argv.join(' ')}`, timeoutMs };
    }

    case 'analyze-patterns': {
      const argv = ['analyze-patterns.mjs'];
      if (body.summary !== false) argv.push('--summary');
      const mt = body.minThreshold;
      if (mt != null && String(mt).trim() !== '') {
        const n = parseInt(String(mt), 10);
        if (Number.isNaN(n) || n < 0 || n > 999) throw new Error('invalid min threshold');
        argv.push('--min-threshold', String(n));
      }
      return { argv, cwd, display: `node ${argv.join(' ')}`, timeoutMs };
    }

    case 'followup': {
      const argv = ['followup-cadence.mjs'];
      if (body.summary !== false) argv.push('--summary');
      if (body.overdueOnly) argv.push('--overdue-only');
      const ad = body.appliedDays;
      if (ad != null && String(ad).trim() !== '') {
        const n = parseInt(String(ad), 10);
        if (Number.isNaN(n) || n < 0 || n > 3650) throw new Error('invalid applied-days');
        argv.push('--applied-days', String(n));
      }
      return { argv, cwd, display: `node ${argv.join(' ')}`, timeoutMs };
    }

    default:
      throw new Error(`unhandled command id: ${id}`);
  }
}

/*──────────────────────────────────────────────────────────────────────
  Runner — spawn process, capture output, return structured result
──────────────────────────────────────────────────────────────────────*/

export function runCommand(root, id, body = {}) {
  const inv = resolveInvocation(root, id, body);
  const timeoutMs = inv.timeoutMs;

  return new Promise((ok, fail) => {
    let stdout = '';
    let stderr = '';
    let killed = false;

    const child = spawn(execPath, inv.argv, {
      cwd: inv.cwd,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const append = (buf, which) => {
      const s = buf.toString();
      if (which === 'out') stdout += s;
      else stderr += s;
      if (stdout.length + stderr.length > MAX_CAPTURE * 1.2 && !killed) {
        killed = true;
        child.kill('SIGTERM');
      }
    };

    child.stdout?.on('data', (d) => append(d, 'out'));
    child.stderr?.on('data', (d) => append(d, 'err'));

    const timer = setTimeout(() => { if (!killed) { killed = true; child.kill('SIGTERM'); } }, timeoutMs);

    child.on('error', (err) => { clearTimeout(timer); fail(err); });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (stdout.length > MAX_CAPTURE) stdout = `${stdout.slice(0, MAX_CAPTURE)}\n… [truncated]`;
      if (stderr.length > MAX_CAPTURE) stderr = `${stderr.slice(0, MAX_CAPTURE)}\n… [truncated]`;
      ok({
        exitCode: code,
        signal: signal || null,
        stdout,
        stderr,
        display: inv.display,
        cwd: inv.cwd,
        timedOut: killed && code === null,
      });
    });
  });
}

/*──────────────────────────────────────────────────────────────────────
  API helpers
──────────────────────────────────────────────────────────────────────*/

export function listCommandsForApi() {
  return COMMAND_CATALOG.map(({ fields, ...rest }) => ({
    ...rest,
    fields: fields || null,
  }));
}

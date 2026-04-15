/**
 * Parse and persist data/applications.md — canonical career-ops tracker format.
 * Column order: # | Date | Company | Role | Score | Status | PDF | Report | Notes
 */

import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'fs';
import { join, dirname as pathDirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = pathDirname(fileURLToPath(import.meta.url));
/** Repo root: this file lives at web/backend/lib/ */
const CAREER_OPS = join(__dirname, '..', '..', '..');

export function getCareerOpsRoot() {
  return CAREER_OPS;
}

export function getApplicationsPath() {
  const dataPath = join(CAREER_OPS, 'data', 'applications.md');
  if (existsSync(dataPath)) return dataPath;
  const rootPath = join(CAREER_OPS, 'applications.md');
  if (existsSync(rootPath)) return rootPath;
  return dataPath;
}

const CANONICAL_STATES = [
  'Evaluated', 'Applied', 'Responded', 'Interview', 'Offer', 'Rejected', 'Discarded', 'SKIP',
];

const STATUS_ALIASES = {
  evaluada: 'Evaluated',
  aplicado: 'Applied',
  enviada: 'Applied',
  aplicada: 'Applied',
  sent: 'Applied',
  respondido: 'Responded',
  entrevista: 'Interview',
  oferta: 'Offer',
  rechazado: 'Rejected',
  rechazada: 'Rejected',
  descartado: 'Discarded',
  descartada: 'Discarded',
  cerrada: 'Discarded',
  cancelada: 'Discarded',
  'no aplicar': 'SKIP',
  no_aplicar: 'SKIP',
  skip: 'SKIP',
  monitor: 'SKIP',
};

export function loadCanonicalStates() {
  const p = join(CAREER_OPS, 'templates', 'states.yml');
  if (!existsSync(p)) return CANONICAL_STATES;
  try {
    const doc = yaml.load(readFileSync(p, 'utf8'));
    const labels = (doc.states || []).map((s) => s.label).filter(Boolean);
    return labels.length ? labels : CANONICAL_STATES;
  } catch {
    return CANONICAL_STATES;
  }
}

export function normalizeStatus(input) {
  if (input == null || String(input).trim() === '') return 'Evaluated';
  const clean = String(input).replace(/\*\*/g, '').trim();
  const lower = clean.toLowerCase();
  for (const valid of CANONICAL_STATES) {
    if (valid.toLowerCase() === lower) return valid;
  }
  if (STATUS_ALIASES[lower]) return STATUS_ALIASES[lower];
  if (/^(duplicado|dup|repost)/i.test(lower)) return 'Discarded';
  return 'Evaluated';
}

function parseRowLine(line) {
  const parts = line.split('|').map((s) => s.trim());
  if (parts.length < 9) return null;
  const num = parseInt(parts[1], 10);
  if (Number.isNaN(num) || num === 0) return null;
  return {
    num,
    date: parts[2],
    company: parts[3],
    role: parts[4],
    score: parts[5],
    status: parts[6],
    pdf: parts[7],
    report: parts[8],
    notes: parts[9] ?? '',
  };
}

function sanitizeCell(s) {
  return String(s ?? '')
    .replace(/\|/g, '¦')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function formatScore(score) {
  if (score == null || score === '') return '0.0/5';
  const s = String(score).trim();
  if (/\/5\s*$/.test(s)) return s;
  const m = s.match(/^([\d.]+)$/);
  if (m) return `${m[1]}/5`;
  const m2 = s.match(/([\d.]+)\s*\/\s*5/);
  if (m2) return `${m2[1]}/5`;
  return sanitizeCell(s) || '0.0/5';
}

export function parseApplications(content) {
  const lines = content.split(/\n/);
  const apps = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    if (t.startsWith('|---') || /\|\s*#\s*\|/.test(t)) continue;
    const row = parseRowLine(t);
    if (row) apps.push(row);
  }
  return apps.sort((a, b) => a.num - b.num);
}

export function readApplications() {
  const path = getApplicationsPath();
  if (!existsSync(path)) {
    return { path, apps: [], rawHeader: defaultHeader() };
  }
  const content = readFileSync(path, 'utf8');
  return readApplicationsFromContent(content, path);
}

/** Parse tracker markdown from a string (e.g. Supabase workspace_documents body). */
export function readApplicationsFromContent(content, pathLabel) {
  const path = pathLabel || getApplicationsPath();
  const c = content != null ? String(content) : '';
  if (!c.trim()) {
    return { path, apps: [], rawHeader: defaultHeader() };
  }
  const apps = parseApplications(c);
  return { path, apps, rawHeader: extractHeaderBlock(c) };
}

function extractHeaderBlock(content) {
  const lines = content.split(/\n/);
  const out = [];
  for (const line of lines) {
    out.push(line);
    if (line.trim().startsWith('|---')) break;
  }
  return out.join('\n');
}

function defaultHeader() {
  return `# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|`;
}

function formatRow(a) {
  return `| ${a.num} | ${sanitizeCell(a.date)} | ${sanitizeCell(a.company)} | ${sanitizeCell(a.role)} | ${sanitizeCell(a.score)} | ${sanitizeCell(a.status)} | ${sanitizeCell(a.pdf)} | ${sanitizeCell(a.report)} | ${sanitizeCell(a.notes)} |`;
}

export function serializeApplications(apps, headerBlock) {
  const header = headerBlock && headerBlock.trim() ? headerBlock.trimEnd() : defaultHeader();
  const body = apps.sort((a, b) => a.num - b.num).map(formatRow).join('\n');
  return `${header}\n${body}\n`;
}

export function writeApplications(apps, headerBlock) {
  const path = getApplicationsPath();
  mkdirSync(pathDirname(path), { recursive: true });
  const content = serializeApplications(apps, headerBlock);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, path);
}

export function nextApplicationNumber(apps) {
  if (!apps.length) return 1;
  return Math.max(...apps.map((a) => a.num)) + 1;
}

export function parseScoreValue(scoreRaw) {
  const m = String(scoreRaw || '').match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

export function updateApp(apps, num, patch) {
  const idx = apps.findIndex((a) => a.num === num);
  if (idx < 0) return { ok: false, error: 'not_found' };
  const cur = { ...apps[idx] };
  if (patch.date != null) cur.date = sanitizeCell(patch.date);
  if (patch.company != null) cur.company = sanitizeCell(patch.company);
  if (patch.role != null) cur.role = sanitizeCell(patch.role);
  if (patch.score != null) cur.score = formatScore(patch.score);
  if (patch.status != null) cur.status = normalizeStatus(patch.status);
  if (patch.pdf != null) cur.pdf = sanitizeCell(patch.pdf);
  if (patch.report != null) cur.report = sanitizeCell(patch.report);
  if (patch.notes != null) cur.notes = sanitizeCell(patch.notes);
  const next = [...apps];
  next[idx] = cur;
  return { ok: true, apps: next, app: cur };
}

export function addApp(apps, fields) {
  const num = nextApplicationNumber(apps);
  const row = {
    num,
    date: sanitizeCell(fields.date || new Date().toISOString().slice(0, 10)),
    company: sanitizeCell(fields.company || 'Company'),
    role: sanitizeCell(fields.role || 'Role'),
    score: formatScore(fields.score ?? '0.0'),
    status: normalizeStatus(fields.status ?? 'Evaluated'),
    pdf: sanitizeCell(fields.pdf || '❌'),
    report: sanitizeCell(fields.report || '—'),
    notes: sanitizeCell(fields.notes || ''),
  };
  return { apps: [...apps, row], app: row };
}

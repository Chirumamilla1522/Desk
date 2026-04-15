/**
 * Extract job URL from evaluation report header (matches dashboard Go logic).
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const RE_URL = /^\*\*URL:\*\*\s*(https?:\/\/\S+)/im;

export function jobUrlFromReport(careerOpsRoot, reportCell) {
  if (!reportCell || reportCell === '—') return null;
  const m = reportCell.match(/\[(\d+)\]\(([^)]+)\)/);
  if (!m) return null;
  const rel = m[2];
  const full = join(careerOpsRoot, rel);
  if (!existsSync(full)) return null;
  let text = readFileSync(full, 'utf8');
  if (text.length > 2000) text = text.slice(0, 2000);
  const um = text.match(RE_URL);
  return um ? um[1].replace(/[)\]}>.,;]+$/, '') : null;
}

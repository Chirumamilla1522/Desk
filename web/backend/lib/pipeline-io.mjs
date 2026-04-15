/**
 * Read pipeline Pendientes — supports:
 *   - [ ] url | company | title
 *   - [ ] url | company | title | YYYY-MM-DD
 *   - [ ] url | company | title | YYYY-MM-DD | location
 *   - [ ] url | company | title | location   (when 4th is not a date)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parsePipelineLineRaw(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('- [')) return null;
  const rest = trimmed.replace(/^-\s*\[[ x]\]\s*/, '');
  const segments = rest.split('|').map((s) => s.trim());
  if (segments.length < 3) return null;
  const urlMatch = segments[0].match(/https?:\/\/\S+/);
  if (!urlMatch) return null;
  const url = urlMatch[0].replace(/[)\]},.;]+$/, '');
  const company = segments[1] ?? '';
  const title = segments[2] ?? '';
  let posted = '';
  let location = '';
  if (segments[3]) {
    if (DATE_RE.test(segments[3])) {
      posted = segments[3];
      location = segments[4] || '';
    } else {
      location = segments[3];
    }
  }
  return { url, company, title, posted, location };
}

export function parsePipelinePendingFromText(text, pathLabel) {
  const p = pathLabel || join('data', 'pipeline.md');
  if (!text || !String(text).trim()) return { path: p, pending: [] };

  const marker = '## Pendientes';
  const idx = text.indexOf(marker);
  if (idx === -1) return { path: p, pending: [] };

  const after = text.slice(idx + marker.length);
  const nextHdr = after.search(/\n## /);
  const section = nextHdr === -1 ? after : after.slice(0, nextHdr);
  const pending = [];

  for (const raw of section.split('\n')) {
    const row = parsePipelineLineRaw(raw);
    if (row) pending.push(row);
  }

  return { path: p, pending };
}

export function parsePipelinePending(careerOpsRoot) {
  const p = join(careerOpsRoot, 'data', 'pipeline.md');
  if (!existsSync(p)) return { path: p, pending: [] };

  const text = readFileSync(p, 'utf8');
  return parsePipelinePendingFromText(text, p);
}

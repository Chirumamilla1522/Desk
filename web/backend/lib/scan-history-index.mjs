/**
 * Index data/scan-history.tsv by URL for inbox enrichment.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function loadScanHistoryByUrl(careerOpsRoot) {
  const p = join(careerOpsRoot, 'data', 'scan-history.tsv');
  const map = new Map();
  if (!existsSync(p)) return map;
  const lines = readFileSync(p, 'utf8').split(/\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split('\t');
    if (parts.length < 5) continue;
    const url = parts[0].trim();
    if (!url.startsWith('http')) continue;
    map.set(url, {
      first_seen: parts[1] || '',
      portal: parts[2] || '',
      title: parts[3] || '',
      company: parts[4] || '',
    });
  }
  return map;
}

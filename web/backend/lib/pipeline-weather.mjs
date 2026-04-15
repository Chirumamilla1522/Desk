/**
 * Derived metrics from applications.md (+ optional follow-ups.md).
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { normalizeStatus } from './tracker-store.mjs';

function parseYmd(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(String(s).trim())) return null;
  const t = Date.parse(`${String(s).trim()}T12:00:00`);
  return Number.isNaN(t) ? null : t;
}

function parseFollowupsByApp(root) {
  const p = join(root, 'data', 'follow-ups.md');
  if (!existsSync(p)) return new Map();
  const map = new Map();
  const lines = readFileSync(p, 'utf8').split('\n');
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const parts = line.split('|').map((x) => x.trim());
    if (parts.length < 8) continue;
    const appNum = parseInt(parts[2], 10);
    if (Number.isNaN(appNum)) continue;
    const fuDate = parts[3];
    if (!map.has(appNum)) map.set(appNum, []);
    map.get(appNum).push({ date: fuDate });
  }
  return map;
}

export function computePipelineWeather(root, apps) {
  const now = Date.now();
  const weekMs = 7 * 86400000;
  const weekStart = now - weekMs;

  let pace7d = 0;
  let evaluated = 0;
  let applied = 0;
  const appliedRows = [];

  for (const a of apps) {
    const st = normalizeStatus(a.status);
    const t = parseYmd(a.date);
    if (t != null && t >= weekStart) pace7d++;

    if (st === 'Evaluated') evaluated++;
    if (st === 'Applied') {
      applied++;
      appliedRows.push({ num: a.num, date: a.date, t: parseYmd(a.date) });
    }
  }

  const conversion =
    evaluated > 0 ? Math.round((applied / evaluated) * 1000) / 1000 : null;

  const followups = parseFollowupsByApp(root);
  const daysSince = (t) => (t == null ? null : Math.floor((now - t) / 86400000));

  const ghosting = [];
  for (const row of appliedRows) {
    const fus = followups.get(row.num) || [];
    const hasFollowup = fus.length > 0;
    const d = daysSince(row.t);
    if (!hasFollowup && d != null) ghosting.push(d);
  }

  ghosting.sort((a, b) => a - b);
  const medianGhost =
    ghosting.length === 0
      ? null
      : ghosting.length % 2 === 1
        ? ghosting[(ghosting.length - 1) >> 1]
        : (ghosting[ghosting.length / 2 - 1] + ghosting[ghosting.length / 2]) / 2;

  const ghostPct =
    appliedRows.length === 0
      ? null
      : Math.round((ghosting.length / appliedRows.length) * 100);

  return {
    pace7d,
    evaluated,
    applied,
    conversion,
    ghosting: {
      appliedWithNoFollowup: ghosting.length,
      appliedTotal: appliedRows.length,
      ghostPct,
      medianDaysSinceApplyNoFollowup: medianGhost,
    },
  };
}

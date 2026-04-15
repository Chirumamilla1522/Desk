/**
 * Build structured excerpts from evaluation reports for the Apply desk
 * (mirrors career-ops `modes/apply.md`: context + optional block H drafts).
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { readReportSignals } from './report-signals.mjs';

/** @param {string} markdown */
export function extractReportSections(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  /** @type {Record<string, string>} */
  const sections = {};
  let cur = null;
  const buf = [];
  const flush = () => {
    if (cur != null) sections[cur] = buf.join('\n').trim();
  };
  for (const line of lines) {
    const m = line.match(/^##\s*([A-H])\)\s*(.*)$/i);
    if (m) {
      flush();
      cur = m[1].toUpperCase();
      buf.length = 0;
      if (m[2].trim()) buf.push(m[2].trim());
    } else if (cur != null) buf.push(line);
  }
  flush();
  return sections;
}

function trunc(s, max) {
  if (!s) return null;
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n\n… (truncated — open the full report for the rest)`;
}

/**
 * @param {string} root career-ops root
 * @param {string} reportCell markdown link cell from applications.md
 */
export function buildApplyPack(root, reportCell) {
  const sig = readReportSignals(root, reportCell);
  if (sig.error) {
    return { reportPath: null, signals: null, sections: {}, packError: sig.error };
  }
  const full = join(root, sig.path);
  if (!existsSync(full)) {
    return { reportPath: sig.path, signals: null, sections: {}, packError: 'missing_file' };
  }
  const raw = readFileSync(full, 'utf8');
  const fullSections = extractReportSections(raw);
  const signals = {
    headerScore: sig.headerScore,
    url: sig.url,
    archetype: sig.archetype,
    seniority: sig.seniority,
    remote: sig.remote,
    team: sig.team,
    comp: sig.comp,
    roleTitle: sig.roleTitle,
    company: sig.company,
    location: sig.location,
  };
  return {
    reportPath: sig.path,
    signals,
    sections: {
      B: trunc(fullSections.B, 12000),
      E: trunc(fullSections.E, 8000),
      F: trunc(fullSections.F, 12000),
      G: fullSections.G ? trunc(fullSections.G, 6000) : null,
      H: fullSections.H || null,
    },
    hasDraftAnswers: !!fullSections.H,
  };
}

/**
 * Desk: LinkedIn outreach pack
 * Reuses the contacto framework by bundling report + profile context.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { readProfile, profileSummary } from './profile-io.mjs';
import { readReportSignals } from './report-signals.mjs';
import { extractReportSections } from './apply-pack.mjs';

function trunc(s, max) {
  if (!s) return null;
  const t = String(s).trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n\n… (truncated — open the full report for the rest)`;
}

export function buildOutreachPack(root, reportCell) {
  const profile = profileSummary(readProfile(root));

  const sig = readReportSignals(root, reportCell);
  if (sig.error) {
    return {
      profile,
      reportPath: null,
      signals: null,
      sections: {},
      packError: sig.error,
    };
  }

  const full = join(root, sig.path);
  if (!existsSync(full)) {
    return { profile, reportPath: sig.path, signals: null, sections: {}, packError: 'missing_file' };
  }
  const raw = readFileSync(full, 'utf8');
  const secs = extractReportSections(raw);

  return {
    profile,
    reportPath: sig.path,
    signals: {
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
    },
    sections: {
      B: trunc(secs.B, 9000),
      F: trunc(secs.F, 9000),
      H: secs.H ? trunc(secs.H, 6000) : null,
    },
    hasDraftAnswers: !!secs.H,
  };
}


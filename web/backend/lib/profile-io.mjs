import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

export function profilePath(root) {
  return join(root, 'config', 'profile.yml');
}

export function readProfile(root) {
  const p = profilePath(root);
  if (!existsSync(p)) return null;
  return yaml.load(readFileSync(p, 'utf8'));
}

export function writeProfile(root, doc) {
  const p = profilePath(root);
  const out = yaml.dump(doc, { lineWidth: -1, noRefs: true });
  writeFileSync(p, out, 'utf8');
}

/** Subset for the web UI — no secrets beyond what is already in profile. */
export function profileSummary(doc) {
  if (!doc) return null;
  const companies = doc.target_companies;
  return {
    candidate: doc.candidate || {},
    target_roles: doc.target_roles || {},
    target_companies: Array.isArray(companies)
      ? companies.map((s) => String(s || '').trim()).filter(Boolean)
      : [],
    compensation: doc.compensation || {},
    location: doc.location || {},
    narrative: doc.narrative
      ? {
          headline: doc.narrative.headline,
        }
      : {},
  };
}

export function mergeProfilePatch(doc, patch) {
  const next = JSON.parse(JSON.stringify(doc || {}));
  for (const key of ['candidate', 'target_roles', 'compensation', 'location', 'narrative']) {
    if (patch[key] && typeof patch[key] === 'object' && !Array.isArray(patch[key])) {
      next[key] = { ...(next[key] || {}), ...patch[key] };
    }
  }
  if ('target_companies' in patch && Array.isArray(patch.target_companies)) {
    next.target_companies = patch.target_companies
      .map((s) => String(s || '').trim())
      .filter(Boolean);
  }
  return next;
}

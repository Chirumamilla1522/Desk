/**
 * Read/write portals.yml for the web UI (round-trip; YAML comments are not preserved).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { detectApi } from '../../../scan-core.mjs';

export function portalsPath(root) {
  return join(root, 'portals.yml');
}

export function readPortalsDoc(root) {
  const p = portalsPath(root);
  if (!existsSync(p)) return null;
  return yaml.load(readFileSync(p, 'utf8'));
}

export function writePortalsDoc(root, doc) {
  const p = portalsPath(root);
  const out = yaml.dump(doc, {
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });
  writeFileSync(p, out, 'utf8');
}

/** Shape optimized for the browser (large company list). */
export function summarizeForUi(doc) {
  if (!doc) return null;
  const companies = (doc.tracked_companies || []).map((c) => ({
    name: c.name,
    enabled: c.enabled !== false,
    careers_url: c.careers_url || '',
    notes: (c.notes || '').slice(0, 200),
    hasApi: detectApi(c) !== null,
  }));
  return {
    title_filter: {
      positive: doc.title_filter?.positive || [],
      negative: doc.title_filter?.negative || [],
    },
    location_filter: {
      mode: doc.location_filter?.mode ?? 'none',
      include_title_in_location_match:
        doc.location_filter?.include_title_in_location_match !== false,
      include_unspecified_remote: doc.location_filter?.include_unspecified_remote !== false,
      include_empty: doc.location_filter?.include_empty !== false,
      include_multiple_locations: !!doc.location_filter?.include_multiple_locations,
    },
    scan_options: {
      sort_by: doc.scan_options?.sort_by ?? 'posted_at',
      sort_order: doc.scan_options?.sort_order ?? 'desc',
      show_posted_in_pipeline: doc.scan_options?.show_posted_in_pipeline !== false,
    },
    companies,
    companyCount: companies.length,
    enabledWithApiCount: companies.filter((c) => c.enabled && c.hasApi).length,
  };
}

/**
 * Apply UI payload onto existing YAML document (preserves untracked keys like search_queries).
 */
export function applyPortalsPatch(doc, patch) {
  if (!doc) throw new Error('no portals doc');
  const next = JSON.parse(JSON.stringify(doc));

  if (patch.title_filter) {
    next.title_filter = next.title_filter || {};
    if (Array.isArray(patch.title_filter.positive)) {
      next.title_filter.positive = patch.title_filter.positive.map((s) => String(s).trim()).filter(Boolean);
    }
    if (Array.isArray(patch.title_filter.negative)) {
      next.title_filter.negative = patch.title_filter.negative.map((s) => String(s).trim()).filter(Boolean);
    }
  }

  if (patch.location_filter) {
    next.location_filter = {
      ...(next.location_filter || {}),
      ...patch.location_filter,
    };
  }

  if (patch.scan_options) {
    next.scan_options = { ...(next.scan_options || {}), ...patch.scan_options };
  }

  if (patch.companies && Array.isArray(patch.companies)) {
    const byName = new Map(patch.companies.map((c) => [c.name, c]));
    next.tracked_companies = (next.tracked_companies || []).map((c) => {
      const p = byName.get(c.name);
      if (!p) return c;
      return { ...c, enabled: !!p.enabled };
    });
  }

  return next;
}

/**
 * US location filter for portal scans (Greenhouse / Ashby / Lever job location strings).
 * Shared by scan.mjs; keep rules in sync with modes/scan.md for Playwright/WebSearch scans.
 */

/** US state + DC codes (Greenhouse-style "City, ST"). */
export const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT',
  'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
]);

/** Canadian province/territory codes — ", ON" etc. are not US. */
export const CA_PROVINCE_CODES = new Set(['ON', 'BC', 'AB', 'SK', 'MB', 'NB', 'NS', 'NL', 'PE', 'QC', 'NT', 'YT', 'NU']);

const US_COUNTRY_MARKERS = [
  /\bunited states\b/i,
  /\bu\.s\.a\.?\b/i,
  /\busa\b/i,
  /\bremote\s*[-–—]?\s*(united states|u\.s\.|usa)\b/i,
  /\b(united states|u\.s\.|usa)\s*[-–—]?\s*remote\b/i,
  /\bremote\s*[,;(]\s*(us|u\.s\.|usa)\b/i,
  /\b(us|usa|u\.s\.)\s*[-–—]?\s*only\b/i,
  /\bremote\s*[-–—]?\s*us\b/i,
  /\bus\s+remote\b/i,
  /\bcontinental\s+us\b/i,
  /\bconus\b/i,
];

/** Strong non-US signals (substring / phrase). Refine carefully — avoid "in " matching Indiana. */
const NON_US_MARKERS = [
  'united kingdom', 'u.k.', ' england', ' scotland', ' wales',   'ireland,', 'ireland)', 'dublin, ireland',
  'northern ireland', ' uk)', ' uk,', '(uk)', ', uk', ' uk ',
  'germany', 'berlin', 'munich', 'frankfurt', 'hamburg', 'cologne',
  'netherlands', 'amsterdam', 'rotterdam',
  'france', 'paris,', ' lyon,', 'marseille',
  'spain', 'barcelona', 'madrid,',
  'italy', 'milan,', 'rome,',
  'switzerland', 'zurich', 'geneva,',
  'austria', 'vienna',
  'belgium', 'brussels',
  'poland', 'warsaw', 'krakow',
  'czech', 'prague',
  'hungary', 'budapest',
  'romania', 'bucharest',
  'sweden', 'stockholm',
  'norway', 'oslo',
  'denmark', 'copenhagen',
  'finland', 'helsinki',
  'portugal', 'lisbon',
  'greece', 'athens',
  'israel', 'tel aviv', 'jerusalem',
  'uae', 'dubai', 'abu dhabi',
  'qatar', 'doha',
  'saudi', 'riyadh',
  'india', 'bangalore', 'bengaluru', 'hyderabad', 'mumbai', 'delhi', 'pune', 'chennai',
  'china', 'shanghai', 'beijing', 'shenzhen',
  'japan', 'tokyo', 'osaka',
  'south korea', 'seoul',
  'singapore',
  'taiwan', 'taipei',
  'hong kong',
  'australia', 'sydney', 'melbourne',
  'new zealand', 'auckland',
  'philippines', 'manila',
  'indonesia', 'jakarta',
  'vietnam', 'ho chi minh', 'hanoi',
  'thailand', 'bangkok',
  'mexico', 'mexico city', 'guadalajara',
  'brazil', 'são paulo', 'sao paulo', 'rio de janeiro',
  'argentina', 'buenos aires',
  'colombia', 'bogotá', 'bogota',
  'chile', 'santiago',
  'peru', 'lima',
  'south africa', 'cape town', 'johannesburg',
  'worldwide', 'world-wide', 'europe', ' eu,', ' eu)', 'european union',
  'nigeria', 'lagos',
  'egypt', 'cairo',
  'turkey', 'istanbul',
  'russia', 'moscow',
  'ukraine', 'kyiv', 'kiev',
  // Canada — prefer ", ON" / ", BC" (handled by CA_PROVINCE_CODES); avoid plain "vancouver" (Vancouver, WA)
  'toronto, on', 'toronto, canada', 'montreal, qc', 'vancouver, bc', 'calgary, ab',
  'ottawa, on', 'edmonton, ab', 'winnipeg, mb',
  // UK / Ireland — avoid "london," alone (hits London, OH)
  'london, england', 'london uk', 'london (', 'greater london', 'manchester, uk', 'edinburgh, uk',
  'dublin, ireland',
];

const US_METRO_HINTS = [
  'san francisco', 'silicon valley', 'bay area', 'los angeles', 'san diego', 'orange county',
  'seattle', 'bellevue', 'portland, or', 'new york', 'brooklyn', 'manhattan', 'nyc',
  'boston', 'cambridge, ma', 'austin', 'dallas', 'houston', 'chicago', 'atlanta', 'miami',
  'denver', 'boulder', 'phoenix', 'scottsdale', 'philadelphia', 'pittsburgh', 'detroit',
  'minneapolis', 'salt lake', 'nashville', 'charlotte', 'raleigh', 'durham', 'washington, dc',
  'arlington, va', 'bethesda', 'new london, ct', 'st. louis', 'kansas city', 'columbus',
];

/**
 * @param {string} location
 * @param {object} opts
 * @param {string} [opts.mode] 'none' | 'us'
 * @param {boolean} [opts.include_unspecified_remote=true]
 * @param {boolean} [opts.include_empty=true]
 * @param {boolean} [opts.include_multiple_locations=false]
 */
export function isUSLocation(location, opts = {}) {
  const mode = opts.mode || 'none';
  if (mode !== 'us') return true;

  const includeUnspecifiedRemote = opts.include_unspecified_remote !== false;
  const includeEmpty = opts.include_empty !== false;
  const includeMultiple = opts.include_multiple_locations === true;

  const loc = (location || '').trim();
  if (!loc) return includeEmpty;

  const lower = loc.toLowerCase();

  if (!includeMultiple && /\bmultiple\s+locations?\b/i.test(loc) && !hasExplicitUSCountry(lower)) {
    return false;
  }

  // Major non-US cities sometimes listed without province/country
  if (/^\s*toronto\s*$/i.test(loc)) return false;
  if (/^\s*montreal\s*$/i.test(loc)) return false;

  if (hasNonUSMarker(lower)) return false;

  if (hasExplicitUSCountry(lower)) return true;

  for (const re of US_COUNTRY_MARKERS) {
    if (re.test(loc)) return true;
  }

  const regionCodes = extractRegionCodes(loc);
  if (regionCodes.length > 0) {
    if (regionCodes.some((c) => CA_PROVINCE_CODES.has(c))) return false;
    if (regionCodes.some((c) => US_STATE_CODES.has(c))) return true;
  }

  if (isBareRemoteOrHybrid(loc)) {
    return includeUnspecifiedRemote;
  }

  for (const hint of US_METRO_HINTS) {
    if (lower.includes(hint)) return true;
  }

  // Ambiguous: e.g. "Remote - Americas", "EMEA", city without country
  return false;
}

function hasExplicitUSCountry(lower) {
  if (lower.includes('united states')) return true;
  if (/\busa\b/.test(lower)) return true;
  if (lower.includes('u.s.')) return true;
  return false;
}

export function hasNonUSMarker(lower) {
  for (const m of NON_US_MARKERS) {
    if (lower.includes(m)) return true;
  }
  // EMEA / APAC as primary location (not "support EMEA from US")
  if (/\bemea\b/.test(lower) && !hasExplicitUSCountry(lower) && !/\bfrom\b.*\b(united states|usa|u\.s\.)\b/.test(lower)) {
    return true;
  }
  if (/\bapac\b/.test(lower) && !hasExplicitUSCountry(lower)) return true;
  if (/\bapj\b/.test(lower) && !hasExplicitUSCountry(lower)) return true;
  if (/\blatam\b|\blatin america\b/.test(lower) && !hasExplicitUSCountry(lower)) return true;
  return false;
}

/** Role titles like "Engineer (Tokyo)" or "(London)" — office hubs outside US */
function hasNonUSTitleOfficeHint(text) {
  if (!text) return false;
  if (/\(\s*London\s*\)/i.test(text)) return true;
  if (/\(\s*UK\s*\)/i.test(text)) return true;
  if (/\(\s*(?:Tokyo|Osaka|Kyoto|Nagoya|Fukuoka|Seoul|Busan|Singapore|Dublin|Sydney|Mumbai|Delhi|Bangalore|Bengaluru|Hyderabad|Chennai|Shanghai|Beijing|Shenzhen|Taipei|Hong Kong|Berlin|Munich|Frankfurt|Paris|Amsterdam|Zurich|Vienna|Warsaw|Prague|Stockholm|Oslo|Copenhagen|Helsinki|Barcelona|Madrid|Milan|Rome|Lisbon|Athens|Dubai|Tel Aviv|Toronto|Montreal|Vancouver|Melbourne|Auckland|Manila|Jakarta|Bangkok|Ho Chi Minh|Kuala Lumpur)\s*\)/i.test(text)) {
    return true;
  }
  return false;
}

function extractRegionCodes(loc) {
  const codes = [];
  for (const m of loc.matchAll(/,\s*([A-Z]{2})\b/gi)) {
    codes.push(m[1].toUpperCase());
  }
  return codes;
}

function isBareRemoteOrHybrid(loc) {
  const t = loc.trim();
  if (/^(remote|hybrid)\s*$/i.test(t)) return true;
  if (/^(remote|hybrid)\s*[,;]\s*$/i.test(t)) return true;
  return /^(remote|hybrid)(\s|$)/i.test(t) && !/,/.test(t);
}

function buildOpts(lf) {
  return {
    mode: lf.mode === 'us' ? 'us' : 'none',
    include_unspecified_remote: lf.include_unspecified_remote !== false,
    include_empty: lf.include_empty !== false,
    include_multiple_locations: lf.include_multiple_locations === true,
  };
}

/**
 * Full job row: checks `job title` first for office suffixes like "(Tokyo)" / "(London)", then
 * API `location` — so a vague "Remote" location does not override a non-US title.
 * When API location is empty but title is generic, respects include_empty.
 */
export function isUSJobLocation(job, locationFilterConfig) {
  const lf = locationFilterConfig || {};
  if ((lf.mode || 'none') !== 'us') return true;

  const includeTitle = lf.include_title_in_location_match !== false;
  const loc = (job.location || '').trim();
  const title = (job.title || '').trim();

  if (!loc && !title) {
    return lf.include_empty !== false;
  }

  const opts = buildOpts(lf);

  if (includeTitle && title) {
    if (hasNonUSTitleOfficeHint(title)) return false;
    if (hasNonUSMarker(title.toLowerCase())) return false;
  }

  if (loc) {
    if (hasNonUSMarker(loc.toLowerCase())) return false;
    if (!isUSLocation(loc, opts)) return false;
    return true;
  }

  if (title) {
    if (isUSLocation(title, opts)) return true;
    return lf.include_empty !== false;
  }

  return false;
}

export function buildLocationFilter(locationFilterConfig) {
  const lf = locationFilterConfig || {};
  const mode = lf.mode === 'us' ? 'us' : 'none';
  const opts = buildOpts(lf);
  if (mode !== 'us') {
    return () => true;
  }
  return (location) => isUSLocation(location, opts);
}

/** Prefer this in scan.mjs when filtering jobs (uses title + location). */
export function buildJobLocationFilter(locationFilterConfig) {
  const lf = locationFilterConfig || {};
  if ((lf.mode || 'none') !== 'us') {
    return () => true;
  }
  return (job) => isUSJobLocation(job, lf);
}

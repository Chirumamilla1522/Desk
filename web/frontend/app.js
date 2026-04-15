import { deskIcon, deskIconStarOutline, deskIconStarFilled } from './desk-icons.mjs';
import { $, $$, toast } from './app/core/dom.mjs';
import { api } from './app/core/api.mjs';
import { escapeHtml, escapeAttr } from './app/core/escape.mjs';
import { state, SHORTLIST_KEY } from './app/state.mjs';
import {
  loadTracker as ledgerLoadApplications,
  fillStatusSelects,
  openEdit,
  togglePreApplyPanel,
  wireLedgerChromeIcons,
  wireLedgerView,
  reportHref,
} from './app/views/ledger.mjs';

// Minimal runtime heartbeat for debugging hosted issues.
try {
  const el = document.getElementById('js-alive');
  if (el) el.textContent = 'JS: ok';
} catch {
  /* ignore */
}

// Surface runtime errors in the UI instead of silently breaking interactions.
window.addEventListener('error', (e) => {
  try {
    const msg = e?.error?.message || e?.message || 'Unknown error';
    toast(`Desk error: ${msg}`);
  } catch {
    /* ignore */
  }
});
window.addEventListener('unhandledrejection', (e) => {
  try {
    const msg = e?.reason?.message || String(e?.reason || 'Unknown error');
    toast(`Desk error: ${msg}`);
  } catch {
    /* ignore */
  }
});

// Capture clicks globally to detect overlays eating events.
document.addEventListener(
  'click',
  (e) => {
    try {
      const t = e.target;
      const el = t && t.nodeType === 1 ? t : t?.parentElement;
      if (!el) return;
      if (el.closest?.('#main-nav')) {
        const b = el.closest?.('.nav-item');
        if (b) toast(`Nav click: ${b.dataset.view || 'unknown'}`);
      }
    } catch {
      /* ignore */
    }
  },
  true,
);

async function loadTracker(prefetchedApplicationsPayload) {
  await ledgerLoadApplications({
    prefetchedApplicationsPayload,
    fillStatusSelects,
    fillLedgerRowSelects,
    deskIcon,
    wirePrepRowButtons,
    wireApplyRowButtons,
    wireOutreachRowButtons,
    openEdit,
    toast,
  });
}

/** Lazy-loaded view modules — less work on first paint than static imports of every view. */
let outreachModPromise;
let followupModPromise;
let patternsModPromise;
let pdfModPromise;
let pipelineModPromise;
let deskBundlesModPromise;
function ensureOutreachMod() {
  return (outreachModPromise ??= import('./app/views/outreach.mjs'));
}
function ensureFollowupMod() {
  return (followupModPromise ??= import('./app/views/followup.mjs'));
}
function ensurePatternsMod() {
  return (patternsModPromise ??= import('./app/views/patterns.mjs'));
}
function ensurePdfMod() {
  return (pdfModPromise ??= import('./app/views/pdf.mjs'));
}
function ensurePipelineMod() {
  return (pipelineModPromise ??= import('./app/views/pipeline.mjs'));
}
function ensureDeskBundlesMod() {
  return (deskBundlesModPromise ??= import('./app/views/desk-bundles.mjs'));
}

const FALLBACK_INTERVIEW_QUESTIONS = [
  'Tell me about a time you had to push back on a decision — what did you do?',
  'Describe a project where requirements were fuzzy. How did you make progress?',
  'What’s a mistake you made in the last year, and what you changed afterward?',
  'Give me an example of working with someone difficult — how did you keep the work moving?',
  'When were you wrong about a technical bet? How did you recover?',
];

const STOPWORDS = new Set([
  'the',
  'for',
  'and',
  'with',
  'your',
  'this',
  'that',
  'from',
  'are',
  'was',
  'our',
  'you',
  'have',
  'but',
  'not',
  'any',
  'all',
  'can',
  'will',
  'has',
  'been',
  'their',
  'what',
  'when',
  'who',
  'how',
]);

/** Title/company tokens that often match by chance — weak overlap signal */
const WEAK_SIGNAL = new Set([
  'senior',
  'staff',
  'lead',
  'principal',
  'engineer',
  'engineering',
  'software',
  'developer',
  'remote',
  'hybrid',
  'manager',
  'product',
  'data',
  'machine',
  'learning',
  'full',
  'stack',
  'backend',
  'frontend',
  'cloud',
  'platform',
  'applied',
  'research',
  'scientist',
]);

function tokenSet(s) {
  if (!s) return new Set();
  const out = new Set();
  for (const w of String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)) {
    if (w.length > 2 && !STOPWORDS.has(w)) out.add(w);
  }
  return out;
}

function overlapCount(cv, title, company) {
  const bag = tokenSet(cv);
  let n = 0;
  for (const w of tokenSet(`${title} ${company}`)) {
    if (bag.has(w)) n++;
  }
  return n;
}

function overlapExplain(cv, title, company) {
  const bag = tokenSet(cv);
  const jobWords = [...tokenSet(`${title} ${company}`)];
  const matched = jobWords.filter((w) => bag.has(w));
  const weakHits = matched.filter((w) => WEAK_SIGNAL.has(w));
  const strongHits = matched.filter((w) => !WEAK_SIGNAL.has(w));
  let note = '';
  if (matched.length === 0) {
    note = 'No manuscript tokens appear in the title or company name — overlap is zero.';
  } else if (strongHits.length === 0) {
    note = 'Only common job-market words overlap — a weak signal for fit. Read the JD and your manuscript, not this count.';
  } else if (weakHits.length >= matched.length * 0.65) {
    note = 'Most overlaps are generic role-market terms; a few specific tokens still match.';
  } else {
    note = 'Several specific tokens align — still a rough compass, not a verdict on fit.';
  }
  return { matched, weakHits, strongHits, note };
}

function readShortlist() {
  try {
    const raw = localStorage.getItem(SHORTLIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeShortlist(rows) {
  localStorage.setItem(SHORTLIST_KEY, JSON.stringify(rows.slice(-80)));
}

function updateShortlistCount() {
  const el = $('#shortlist-count');
  if (el) el.textContent = String(readShortlist().length);
}

function isStarred(url) {
  return readShortlist().some((r) => r.url === url);
}

function toggleShortlist(j) {
  let rows = readShortlist();
  const i = rows.findIndex((r) => r.url === j.url);
  if (i >= 0) rows.splice(i, 1);
  else rows.push({ url: j.url, company: j.company, title: j.title, savedAt: Date.now() });
  writeShortlist(rows);
  updateShortlistCount();
}

// ── Navigation ──────────────────────────────────────────────────────

function showView(name) {
  try {
    $$('.view').forEach((v) => {
      v.hidden = v.id !== `view-${name}`;
    });
    $$('#main-nav .nav-item').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === name);
    });
    if (name === 'cv') loadCvView();
    if (name === 'match') loadMatchView();
    if (name === 'inbox') loadInboxView();
    if (name === 'jobs') {
      prefetchCvForOverlap();
      loadDiscoverProfilePanel();
    }
    if (name === 'run') loadRunbookView();
    if (name === 'interview') loadInterviewView();
    if (name === 'apply') void loadApplyView();
    if (name === 'outreach') void loadOutreachView();
    if (name === 'followup') void loadFollowupView();
    if (name === 'patterns') void loadPatternsView();
    if (name === 'pdf') void loadPdfView();
    if (name === 'pipeline') void loadPipelineProcessorView();
    if (name === 'deep') void loadDeepView();
    if (name === 'training') void loadTrainingView();
    if (name === 'project') void loadProjectView();
  } catch (e) {
    console.error('showView failed:', e);
    toast(`View failed: ${String(e?.message || e)}`);
  }
}

function wireMainNav() {
  const nav = $('#main-nav');
  if (!nav || nav.dataset.navWired === '1') return;
  nav.dataset.navWired = '1';
  nav.addEventListener('click', (e) => {
    let t = e.target;
    // Some browsers can surface Text nodes as event targets.
    while (t && t.nodeType && t.nodeType !== 1) t = t.parentNode;
    const btn = t?.closest?.('.nav-item[data-view]');
    if (!btn || !nav.contains(btn)) return;
    if (btn.disabled) return;
    const view = btn.dataset.view;
    if (view) showView(view);
  });
}

wireMainNav();

async function loadFollowupView() {
  const m = await ensureFollowupMod();
  m.wireFollowupView({ api, toast, stripAnsi, escapeHtml });
}

async function loadPatternsView() {
  const m = await ensurePatternsMod();
  m.wirePatternsView({ api, toast, stripAnsi, escapeHtml });
}

async function loadPdfView() {
  const m = await ensurePdfMod();
  m.wirePdfView({ api, toast, formatRunOutput, state, $, escapeHtml });
  try {
    const d = await api('/api/pipeline');
    state.inboxItems = d.items || d.pending || state.inboxItems || [];
  } catch {
    /* keep cached inboxItems if pipeline fetch fails */
  }
  m.fillPdfInboxSelect(state, escapeHtml);
  await m.refreshPdfLedgerContext({ state, $, escapeHtml, api, toast });
}

async function loadPipelineProcessorView() {
  const m = await ensurePipelineMod();
  m.wirePipelineProcessorView({ api, toast, escapeAttr, escapeHtml });
  await m
    .refreshPipelineProcessor({ api, escapeAttr, escapeHtml })
    .catch((e) => toast(String(e.message || e)));
}

async function loadDeepView() {
  await wireDeepView();
}

async function loadTrainingView() {
  await wireTrainingView();
}

async function loadProjectView() {
  await wireProjectView();
}

async function prefetchCvForOverlap() {
  if (state.cvText && state.cvText.length > 40) return;
  try {
    const d = await api('/api/cv');
    state.cvText = d.content || '';
  } catch {
    /* ignore */
  }
}

async function loadDiscoverProfilePanel() {
  const miss = $('#discover-profile-miss');
  const body = $('#discover-hint-body');
  const hl = $('#discover-headline-hint');
  const roleUl = $('#discover-role-hints');
  const archTitle = $('#discover-archetype-title');
  const archUl = $('#discover-archetype-hints');
  const coUl = $('#discover-company-hints');
  const sel = $('#discover-profile-company-select');
  const btnCopy = $('#btn-discover-copy-roles');
  if (!miss || !body || !roleUl || !coUl || !sel) return;

  const showMiss = () => {
    body.hidden = true;
    miss.hidden = false;
    if (hl) hl.hidden = true;
    sel.innerHTML = '<option value="">No companies saved</option>';
    sel.disabled = true;
    if (btnCopy) btnCopy.hidden = true;
    if (archTitle) archTitle.hidden = true;
    if (archUl) {
      archUl.innerHTML = '';
      archUl.hidden = true;
    }
    roleUl.innerHTML = '';
    coUl.innerHTML = '';
  };

  try {
    const { profile } = await api('/api/profile');
    if (!profile) {
      showMiss();
      return;
    }
    const roles = Array.isArray(profile.target_roles?.primary)
      ? profile.target_roles.primary.map((s) => String(s || '').trim()).filter(Boolean)
      : [];
    const archetypes = Array.isArray(profile.target_roles?.archetypes) ? profile.target_roles.archetypes : [];
    const companies = Array.isArray(profile.target_companies) ? profile.target_companies : [];
    const headline = profile.narrative?.headline?.trim();

    // Suggestions (fallbacks) when profile lists are empty.
    // - Roles: use archetype names first, then portals title keywords.
    // - Companies: use enabled portals companies (top N) as a must-watch list.
    let suggestedRoles = [];
    if (!roles.length) {
      suggestedRoles = archetypes
        .filter((a) => a && String(a.name || '').trim())
        .map((a) => String(a.name).trim());
    }
    if (!roles.length && !suggestedRoles.length) {
      try {
        const { profile: _p } = await api('/api/profile'); // already fetched; safe fallback no-op
        void _p;
      } catch {
        /* ignore */
      }
    }
    if (!roles.length && !suggestedRoles.length) {
      try {
        const { config } = await api('/api/portals');
        const pos = config?.title_filter?.positive || [];
        suggestedRoles = Array.isArray(pos) ? pos.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 8) : [];
      } catch {
        /* ignore */
      }
    }

    let suggestedCompanies = [];
    if (!companies.length) {
      try {
        const { config } = await api('/api/portals');
        const cos = Array.isArray(config?.companies) ? config.companies : [];
        suggestedCompanies = cos.filter((c) => c && c.enabled).map((c) => String(c.name || '').trim()).filter(Boolean).slice(0, 12);
      } catch {
        /* ignore */
      }
    }

    // What we expose as “copy roles” should be what the user sees.
    state.discoverRolesList = roles.length ? roles : suggestedRoles;

    if (hl) {
      if (headline) {
        hl.textContent = headline;
        hl.hidden = false;
      } else {
        hl.hidden = true;
      }
    }

    if (roles.length) {
      roleUl.innerHTML = roles.map((r) => `<li>${escapeHtml(r)}</li>`).join('');
    } else if (suggestedRoles.length) {
      roleUl.innerHTML = suggestedRoles.map((r) => `<li>${escapeHtml(r)} <span class="muted small">(suggested)</span></li>`).join('');
    } else {
      roleUl.innerHTML = '<li class="discover-hint-empty">Add primary roles in Profile snapshot (Signals)</li>';
    }

    if (companies.length) {
      coUl.innerHTML = companies.map((c) => `<li>${escapeHtml(c)}</li>`).join('');
    } else if (suggestedCompanies.length) {
      coUl.innerHTML = suggestedCompanies.map((c) => `<li>${escapeHtml(c)} <span class="muted small">(suggested)</span></li>`).join('');
    } else {
      coUl.innerHTML = '<li class="discover-hint-empty">Add target companies in Profile snapshot (Signals)</li>';
    }

    if (archUl && archTitle) {
      const archLi = archetypes
        .filter((a) => a && String(a.name || '').trim())
        .map((a) => {
          const name = escapeHtml(String(a.name).trim());
          const fit = a.fit ? ` · ${escapeHtml(String(a.fit))}` : '';
          return `<li>${name}${fit}</li>`;
        })
        .join('');
      archUl.innerHTML = archLi;
      const hasArch = Boolean(archLi);
      archUl.hidden = !hasArch;
      archTitle.hidden = !hasArch;
    }

    const companyChoices = companies.length ? companies : suggestedCompanies;
    sel.innerHTML = '<option value="">Choose a company…</option>';
    for (const c of companyChoices) {
      const o = document.createElement('option');
      o.value = c;
      o.textContent = c;
      sel.appendChild(o);
    }
    if (companyChoices.length === 0) {
      sel.innerHTML = '<option value="">No companies saved</option>';
      sel.disabled = true;
    } else {
      sel.disabled = false;
      if (companyChoices.length === 1) sel.value = companyChoices[0];
    }

    if (btnCopy) btnCopy.hidden = (state.discoverRolesList || []).length === 0;

    const hasHints =
      roles.length > 0 ||
      companies.length > 0 ||
      suggestedRoles.length > 0 ||
      suggestedCompanies.length > 0 ||
      archetypes.some((a) => a && String(a.name || '').trim()) ||
      Boolean(headline);
    body.hidden = !hasHints;
    miss.hidden = hasHints;
  } catch {
    showMiss();
  }
}

$('#btn-discover-apply-company')?.addEventListener('click', () => {
  const sel = $('#discover-profile-company-select');
  const input = $('#job-company');
  if (!sel || !input) return;
  const v = String(sel.value || '').trim();
  if (!v) {
    toast('Choose a company from your profile list first');
    return;
  }
  input.value = v;
  toast('Company filter updated');
});

$('#btn-discover-refresh-profile')?.addEventListener('click', () => {
  void loadDiscoverProfilePanel();
});

$('#btn-discover-copy-roles')?.addEventListener('click', async () => {
  const lines = state.discoverRolesList || [];
  if (!lines.length) return;
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    toast('Target roles copied');
  } catch {
    toast('Clipboard not available');
  }
});

async function deskLogout() {
  try {
    const r = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || r.statusText);
    state.session = { cloud: !!state.session?.cloud, user: null };
    window.location.reload();
  } catch (e) {
    toast(String(e.message || e));
  }
}

async function loadCloudSession(mePrefetched) {
  try {
    const m = mePrefetched !== undefined ? mePrefetched : await api('/api/me');
    state.session = { cloud: !!m.cloud, user: m.user || null };
    const el = $('.workspace-hint');
    if (!el) return;

    if (!el.dataset.deskLogoutBound) {
      el.dataset.deskLogoutBound = '1';
      el.addEventListener('click', (ev) => {
        if (!ev.target.closest('.desk-logout')) return;
        ev.preventDefault();
        void deskLogout();
      });
    }

    if (m.cloud && m.user) {
      el.innerHTML = `<span class="local-badge">Cloud</span> Signed in as ${escapeHtml(m.user.email)} — CV, tracker &amp; pipeline sync. <a href="/auth.html">Account</a> · <button type="button" class="desk-logout">Log out</button>`;
    } else if (m.cloud && !m.user) {
      el.innerHTML = `<span class="local-badge">Cloud</span> <a href="/auth.html">Sign in</a> to save your workspace to your account.`;
    } else {
      el.innerHTML = `<span class="local-badge">Local</span> Data stays on this device — nothing is uploaded by this UI.`;
    }
  } catch {
    /* ignore */
  }
}

async function loadWorkspaceHints(workspacePrefetched) {
  try {
    const w = workspacePrefetched !== undefined ? workspacePrefetched : await api('/api/workspace');
    const ih = $('#inbox-hint');
    if (ih) ih.textContent = w.counts?.pipelinePending ? `${w.counts.pipelinePending} queued` : 'pipeline';
  } catch {
    /* ignore */
  }
}

function parseYmd(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(String(s).trim())) return null;
  const t = Date.parse(`${String(s).trim()}T12:00:00`);
  return Number.isNaN(t) ? null : t;
}

function listedSortKey(row) {
  return parseYmd(row.posted) ?? parseYmd(row.firstSeen) ?? 0;
}

function firstSeenSortKey(row) {
  return parseYmd(row.firstSeen) ?? 0;
}

function filterInboxRows(rows, q, opts = {}) {
  const needle = q.trim().toLowerCase();
  const portal = String(opts.portal || '').trim();
  const onlyPosted = !!opts.onlyPosted;
  const onlyLocation = !!opts.onlyLocation;

  return rows.filter((r) => {
    if (portal && String(r.portal || '') !== portal) return false;
    if (onlyPosted && !String(r.posted || '').trim()) return false;
    if (onlyLocation && !String(r.location || '').trim()) return false;
    if (!needle) return true;
    const blob = [r.url, r.company, r.title, r.location, r.posted, r.firstSeen, r.portal, r.scanTitle]
      .join(' ')
      .toLowerCase();
    return blob.includes(needle);
  });
}

function sortInboxRows(rows, sort) {
  const out = [...rows];
  out.sort((a, b) => {
    if (sort === 'company-asc') return (a.company || '').localeCompare(b.company || '');
    if (sort === 'company-desc') return (b.company || '').localeCompare(a.company || '');
    if (sort === 'title-asc') return (a.title || '').localeCompare(b.title || '');
    if (sort === 'title-desc') return (b.title || '').localeCompare(a.title || '');
    if (sort === 'portal-asc') return (a.portal || '').localeCompare(b.portal || '');
    if (sort === 'firstseen-asc') return firstSeenSortKey(a) - firstSeenSortKey(b);
    if (sort === 'firstseen-desc') return firstSeenSortKey(b) - firstSeenSortKey(a);
    const ta = listedSortKey(a);
    const tb = listedSortKey(b);
    if (sort === 'listed-asc') return ta - tb;
    return tb - ta;
  });
  return out;
}

function fillInboxPortalFilter() {
  const sel = $('#inbox-portal');
  if (!sel) return;
  const portals = [...new Set((state.inboxItems || []).map((r) => String(r.portal || '').trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b)
  );
  const cur = sel.value;
  sel.innerHTML = '<option value=\"\">All</option>' + portals.map((p) => `<option value=\"${escapeAttr(p)}\">${escapeHtml(shortPortal(p))}</option>`).join('');
  // Preserve selection if still present
  if (cur && portals.includes(cur)) sel.value = cur;
}

function renderInboxTable() {
  const q = ($('#inbox-search') && $('#inbox-search').value) || '';
  const sort = ($('#inbox-sort') && $('#inbox-sort').value) || 'listed-desc';
  const opts = {
    portal: ($('#inbox-portal') && $('#inbox-portal').value) || '',
    onlyPosted: !!$('#inbox-only-posted')?.checked,
    onlyLocation: !!$('#inbox-only-location')?.checked,
  };
  const rows = sortInboxRows(filterInboxRows(state.inboxItems, q, opts), sort);
  const tbody = $('#inbox-tbody');
  const empty = $('#inbox-empty');
  const fc = $('#inbox-filter-count');
  if (!state.inboxItems.length) {
    if (tbody) tbody.innerHTML = '';
    if (empty) empty.hidden = false;
    if (fc) fc.textContent = '';
    return;
  }
  if (empty) empty.hidden = true;
  if (fc) {
    const active =
      q.trim() ||
      sort !== 'listed-desc' ||
      opts.portal ||
      opts.onlyPosted ||
      opts.onlyLocation;
    fc.textContent = active ? `Showing ${rows.length} of ${state.inboxItems.length}` : `${state.inboxItems.length} in queue`;
  }
  if (!tbody) return;
  const cap = 500;
  const show = rows.slice(0, cap);
  tbody.innerHTML = show
    .map(
      (r) => `<tr>
    <td class="td-muted">${escapeHtml(r.posted || '—')}</td>
    <td class="td-muted">${escapeHtml(r.firstSeen || '—')}</td>
    <td>${escapeHtml(r.company)}</td>
    <td>${escapeHtml(r.title)}</td>
    <td class="td-muted">${escapeHtml(r.location || '—')}</td>
    <td class="td-muted inbox-portal">${escapeHtml(shortPortal(r.portal))}</td>
    <td class="td-actions"><a class="inbox-open" href="${escapeAttr(r.url)}" target="_blank" rel="noopener">open</a></td>
  </tr>`
    )
    .join('');
  if (rows.length > cap) {
    tbody.insertAdjacentHTML(
      'beforeend',
      `<tr><td colspan="7" class="inbox-more">… ${rows.length - cap} more rows match — narrow the filter</td></tr>`
    );
  }
}

function shortPortal(p) {
  if (!p) return '—';
  const s = String(p);
  if (s.length <= 36) return s;
  return `${s.slice(0, 18)}…${s.slice(-10)}`;
}

async function loadInboxView() {
  try {
    const data = await api('/api/pipeline');
    state.inboxItems = data.items || data.pending || [];
    fillInboxPortalFilter();
    renderInboxTable();
    const pdf = await ensurePdfMod();
    pdf.fillPdfInboxSelect(state, escapeHtml);
  } catch (e) {
    toast(e.message);
  }
}

const btnInboxRefresh = $('#btn-inbox-refresh');
if (btnInboxRefresh) btnInboxRefresh.addEventListener('click', () => loadInboxView());

const inboxSearch = $('#inbox-search');
if (inboxSearch) inboxSearch.addEventListener('input', () => renderInboxTable());
const inboxSort = $('#inbox-sort');
if (inboxSort) inboxSort.addEventListener('change', () => renderInboxTable());
const inboxPortal = $('#inbox-portal');
if (inboxPortal) inboxPortal.addEventListener('change', () => renderInboxTable());
$('#inbox-only-posted')?.addEventListener('change', () => renderInboxTable());
$('#inbox-only-location')?.addEventListener('change', () => renderInboxTable());

// ── Interview prep (STAR story bank + company notebooks) ──────────

function interviewLabelForName(name) {
  const it = state.interviewItems.find((i) => i.name === name);
  return it?.label || 'Notes';
}

function updateInterviewWelcomeAndRibbon() {
  const welcome = $('#interview-welcome');
  const ribbon = $('#interview-story-ribbon');
  if (state.interviewTab === 'story') {
    if (welcome) welcome.hidden = true;
    if (ribbon) ribbon.hidden = false;
  } else {
    if (ribbon) ribbon.hidden = true;
    if (welcome) {
      welcome.hidden = false;
      welcome.textContent =
        'Company prep is separate from your STAR story bank: here you capture what this employer cares about, your angles, questions you will ask them, and notes after each round. Live practice pulls “their” questions from this notebook when you start with a ledger row.';
    }
  }
}

function updateStoryRibbonStats() {
  const el = $('#interview-story-stats');
  if (!el || state.interviewTab !== 'story') return;
  const ta = $('#interview-body');
  const raw = ta?.value ?? '';
  const words = raw.trim() ? raw.trim().split(/\s+/).length : 0;
  const headings = (raw.match(/^#{1,2}\s+\S/gm) || []).length;
  if (!words) {
    el.textContent =
      'Add stories below — use ## headings to separate each STAR+R block (theme titles like “Impact”, “Conflict”, “Leading without authority” help you reuse them).';
  } else if (headings > 0) {
    el.textContent = `${words} words · ${headings} stor${headings === 1 ? 'y' : 'ies'} (by heading)`;
  } else {
    el.textContent = `${words} words — add ## headings so practice can pick up each story separately`;
  }
}

function setInterviewSegActive() {
  $$('.interview-seg-btn').forEach((btn) => {
    const tab = btn.getAttribute('data-int-tab');
    const on = tab === state.interviewTab;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}

function getCurrentInterviewInternalName() {
  if (state.interviewTab === 'story') return 'story-bank.md';
  const prep = $('#interview-prep-select');
  if (!prep || prep.options.length === 0) return state.interviewCurrent;
  return prep.value || state.interviewCurrent;
}

async function loadInterviewDoc(name) {
  const d = await api(`/api/interview-prep/content?name=${encodeURIComponent(name)}`);
  const ta = $('#interview-body');
  if (ta) ta.value = d.content || '';
  const meta = $('#interview-meta');
  const label = d.label || interviewLabelForName(d.name);
  if (meta) {
    const words = d.content?.trim() ? d.content.trim().split(/\s+/).length : 0;
    meta.textContent = d.exists ? `${label} · ${words} words` : `${label} — empty (save to create)`;
  }
  state.interviewCurrent = d.name;
  const prepSel = $('#interview-prep-select');
  if (prepSel && state.interviewTab === 'prep') {
    for (const opt of prepSel.options) {
      if (opt.value === d.name) {
        prepSel.value = d.name;
        break;
      }
    }
  }
  updateStoryRibbonStats();
}

async function syncInterviewUIAfterTab(preferPrepName = null) {
  const prepItems = state.interviewItems.filter((i) => i.kind === 'prep');
  setInterviewSegActive();
  updateInterviewWelcomeAndRibbon();

  const prepRow = $('#interview-prep-row');
  const empty = $('#interview-prep-empty');
  const ta = $('#interview-body');
  const saveBtn = $('#btn-interview-save');
  const errEl = $('#interview-load-error');
  if (errEl) errEl.hidden = true;

  if (state.interviewTab === 'story') {
    if (prepRow) prepRow.hidden = true;
    if (empty) empty.hidden = true;
    if (ta) {
      ta.hidden = false;
      ta.disabled = false;
    }
    if (saveBtn) saveBtn.disabled = false;
    await loadInterviewDoc('story-bank.md');
    setInterviewEditorPlaceholder();
    return;
  }

  if (prepRow) prepRow.hidden = false;
  const prepSel = $('#interview-prep-select');

  if (prepItems.length === 0) {
    if (empty) empty.hidden = false;
    if (ta) {
      ta.hidden = true;
      ta.value = '';
    }
    if (prepSel) prepSel.innerHTML = '';
    if (saveBtn) saveBtn.disabled = true;
    const meta = $('#interview-meta');
    if (meta) meta.textContent = '—';
    setInterviewEditorPlaceholder();
    return;
  }

  if (empty) empty.hidden = true;
  if (ta) {
    ta.hidden = false;
    ta.disabled = false;
  }
  if (saveBtn) saveBtn.disabled = false;
  setInterviewEditorPlaceholder();

  if (prepSel) {
    prepSel.innerHTML = prepItems
      .map((it) => `<option value="${escapeAttr(it.name)}">${escapeHtml(it.label)}</option>`)
      .join('');
    const pick =
      (preferPrepName && prepItems.some((p) => p.name === preferPrepName) && preferPrepName) ||
      (prepItems.some((p) => p.name === state.interviewCurrent) && state.interviewCurrent) ||
      prepItems[0].name;
    prepSel.value = pick;
    state.interviewCurrent = pick;
  }
  await loadInterviewDoc(prepSel?.value || prepItems[0].name);
  setInterviewEditorPlaceholder();
}

function setInterviewEditorPlaceholder() {
  const ta = $('#interview-body');
  if (!ta) return;
  if (state.interviewTab === 'story') {
    ta.placeholder =
      'Each ## section is one reusable STAR+R story: enough Situation / Task / Action / Result / Reflection that you can adapt it to different behavioral prompts. Read aloud while you edit — if it sounds scripted, shorten it.';
  } else {
    ta.placeholder =
      'What they need, why you fit, questions you will ask, session notes after each round…';
  }
}

async function loadInterviewView(options = {}) {
  const preferPrepName = options.preferPrepName || null;
  const errEl = $('#interview-load-error');
  try {
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = '';
    }
    const list = await api('/api/interview-prep');
    let items = [...(list.items || [])];
    if (!items.some((i) => i.name.toLowerCase() === 'story-bank.md')) {
      items.unshift({ name: 'story-bank.md', label: 'STAR story bank', kind: 'story' });
    }
    state.interviewItems = items.length
      ? items
      : [{ name: 'story-bank.md', label: 'STAR story bank', kind: 'story' }];
    await syncInterviewUIAfterTab(preferPrepName);
  } catch (e) {
    const msg = String(e.message || e);
    if (errEl) {
      errEl.textContent = `Could not load notebooks: ${msg}`;
      errEl.hidden = false;
    }
    toast(msg);
  }
}

async function navigateToCompanyPrep(internalName) {
  showView('interview');
  state.interviewTab = 'prep';
  state.interviewCurrent = internalName;
  await loadInterviewView({ preferPrepName: internalName });
}

async function openPrepForApplicationRow(app) {
  if (!app?.company || !app?.role) {
    toast('Need company and role on the row');
    return;
  }
  try {
    const r = await api('/api/interview-prep/ensure', {
      method: 'POST',
      body: JSON.stringify({ company: app.company, role: app.role }),
    });
    await navigateToCompanyPrep(r.name);
    toast(r.created ? 'Prep notebook created' : 'Opened prep notebook');
  } catch (e) {
    toast(String(e.message || e));
  }
}

async function seedPrepFromReportForNum(num) {
  try {
    const r = await api('/api/interview-prep/from-report', {
      method: 'POST',
      body: JSON.stringify({ num }),
    });
    await navigateToCompanyPrep(r.name);
    if (r.mode === 'already-seeded') toast('Prep already includes this report — opened notebook');
    else if (r.seeded) toast('Prep updated from report');
    else toast('Opened prep notebook');
  } catch (e) {
    toast(String(e.message || e));
  }
}

const FOCUS_VIEW_OPTIONS = [
  ['interview-story', 'Interview · STAR story bank'],
  ['interview-prep', 'Interview · Company prep'],
  ['inbox', 'Inbox'],
  ['apply', 'Apply'],
  ['outreach', 'Outreach · LinkedIn'],
  ['followup', 'Follow-up cadence'],
  ['patterns', 'Patterns'],
  ['pdf', 'PDF'],
  ['pipeline', 'Pipeline'],
  ['deep', 'Deep research'],
  ['training', 'Training'],
  ['project', 'Project idea'],
  ['tracker', 'Ledger'],
  ['cv', 'Manuscript'],
  ['match', 'Signals'],
  ['jobs', 'Discover'],
  ['run', 'Runbook'],
];

function formatMmSs(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function fillFocusViewSwitch() {
  const sel = $('#focus-view-switch');
  if (!sel) return;
  sel.innerHTML = FOCUS_VIEW_OPTIONS.map(
    ([v, lab]) => `<option value="${escapeAttr(v)}">${escapeHtml(lab)}</option>`
  ).join('');
}

function applyFocusViewChoice(key) {
  if (key === 'interview-story') {
    showView('interview');
    state.interviewTab = 'story';
    loadInterviewView().catch((e) => toast(String(e.message || e)));
    return;
  }
  if (key === 'interview-prep') {
    showView('interview');
    state.interviewTab = 'prep';
    loadInterviewView().catch((e) => toast(String(e.message || e)));
    return;
  }
  showView(key);
  if (key === 'inbox') loadInboxView().catch(() => {});
  if (key === 'apply') loadApplyView().catch(() => {});
  if (key === 'outreach') loadOutreachView().catch(() => {});
  if (key === 'followup') loadFollowupView().catch(() => {});
  if (key === 'patterns') loadPatternsView().catch(() => {});
  if (key === 'pdf') loadPdfView().catch(() => {});
  if (key === 'pipeline') loadPipelineProcessorView().catch(() => {});
  if (key === 'deep') loadDeepView().catch(() => {});
  if (key === 'training') loadTrainingView().catch(() => {});
  if (key === 'project') loadProjectView().catch(() => {});
  if (key === 'tracker') loadTracker().catch(() => {});
  if (key === 'run') loadRunbookView().catch(() => {});
}

function fillLedgerRowSelects() {
  const html = !state.applications.length
    ? '<option value="">No ledger rows yet</option>'
    : state.applications
        .map(
          (a) =>
            `<option value="${a.num}">#${a.num} ${escapeHtml(a.company)} — ${escapeHtml(a.role)}</option>`
        )
        .join('');
  const htmlPdf =
    '<option value="">— Optional: pick a ledger row —</option>' +
    (!state.applications.length
      ? ''
      : state.applications
          .map(
            (a) =>
              `<option value="${a.num}">#${a.num} ${escapeHtml(a.company)} — ${escapeHtml(a.role)}</option>`
          )
          .join(''));
  const live = $('#live-app-pick');
  const modal = $('#modal-rehearsal-pick');
  const applyPick = $('#apply-app-pick');
  const outreachPick = $('#outreach-app-pick');
  const pdfPick = $('#pdf-app-pick');
  if (live) live.innerHTML = html;
  if (modal) modal.innerHTML = html;
  if (applyPick) applyPick.innerHTML = html;
  if (outreachPick) outreachPick.innerHTML = html;
  if (pdfPick) {
    const prev = pdfPick.value;
    pdfPick.innerHTML = htmlPdf;
    if (prev && [...pdfPick.options].some((o) => o.value === prev)) pdfPick.value = prev;
  }
}

function tickFocusTimer() {
  const st = state.focus;
  if (st.paused) return;
  st.remaining -= 1;
  const el = $('#focus-timer-display');
  if (el) el.textContent = formatMmSs(st.remaining);
  if (st.remaining <= 0) {
    clearInterval(st.intervalId);
    st.intervalId = null;
    toast('Focus session finished');
    endFocusSession();
  }
}

function startFocusSession(totalSec, startViewKey) {
  endFocusSession();
  state.focus.active = true;
  state.focus.total = totalSec;
  state.focus.remaining = totalSec;
  state.focus.paused = false;
  document.body.classList.add('focus-session-active');
  const chrome = $('#focus-chrome');
  if (chrome) chrome.hidden = false;
  const display = $('#focus-timer-display');
  if (display) display.textContent = formatMmSs(totalSec);
  const sw = $('#focus-view-switch');
  if (sw) sw.value = startViewKey;
  const pauseBtn = $('#focus-pause');
  if (pauseBtn) {
    pauseBtn.textContent = 'Pause';
    pauseBtn.setAttribute('aria-pressed', 'false');
  }
  applyFocusViewChoice(startViewKey);
  state.focus.intervalId = setInterval(tickFocusTimer, 1000);
}

function endFocusSession() {
  const st = state.focus;
  if (st.intervalId) clearInterval(st.intervalId);
  st.intervalId = null;
  st.active = false;
  st.remaining = 0;
  st.paused = false;
  document.body.classList.remove('focus-session-active');
  const chrome = $('#focus-chrome');
  if (chrome) chrome.hidden = true;
}

function toggleFocusPause() {
  const st = state.focus;
  if (!st.active) return;
  st.paused = !st.paused;
  const pauseBtn = $('#focus-pause');
  if (pauseBtn) {
    pauseBtn.textContent = st.paused ? 'Resume' : 'Pause';
    pauseBtn.setAttribute('aria-pressed', st.paused ? 'true' : 'false');
  }
}

function stopRehearsalRoundTimer() {
  const r = state.rehearsal;
  if (r.roundTimerId) clearInterval(r.roundTimerId);
  r.roundTimerId = null;
}

function startRehearsalRoundTimer() {
  stopRehearsalRoundTimer();
  const r = state.rehearsal;
  r.roundLeft = r.roundSec;
  const tick = () => {
    r.roundLeft -= 1;
    const el = $('#rehearsal-round-display');
    if (el) el.textContent = formatMmSs(r.roundLeft);
    if (r.roundLeft <= 0) {
      stopRehearsalRoundTimer();
      toast('Round time — next prompt when you are ready');
    }
  };
  const el = $('#rehearsal-round-display');
  if (el) el.textContent = formatMmSs(r.roundLeft);
  r.roundTimerId = setInterval(tick, 1000);
}

function pickRandomStorySnippet(snippets) {
  if (!snippets?.length) return '';
  const i = Math.floor(Math.random() * snippets.length);
  return snippets[i];
}

function splitStorySnippetsFromMarkdown(md) {
  const s = String(md || '').trim();
  if (!s) return [];
  const chunks = s.split(/^##\s+/m).map((c) => c.trim()).filter(Boolean);
  if (chunks.length <= 1) return s.length > 40 ? [s.slice(0, 1600)] : [];
  return chunks.map((c) => c.slice(0, 1600));
}

function firstLineTeaser(text) {
  const line = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return '…';
  return line.length > 90 ? `${line.slice(0, 88)}…` : line;
}

function stopLiveRoundTimer() {
  const lp = state.livePractice;
  if (lp.roundTimerId) clearInterval(lp.roundTimerId);
  lp.roundTimerId = null;
}

function startLiveRoundTimer() {
  stopLiveRoundTimer();
  const lp = state.livePractice;
  lp.roundLeft = lp.roundSec;
  const tick = () => {
    lp.roundLeft -= 1;
    const el = $('#live-practice-round');
    if (el) el.textContent = formatMmSs(lp.roundLeft);
    if (lp.roundLeft <= 0) {
      stopLiveRoundTimer();
      toast('Round time — take a breath, then Next question or Story drill');
    }
  };
  const el = $('#live-practice-round');
  if (el) el.textContent = formatMmSs(lp.roundLeft);
  lp.roundTimerId = setInterval(tick, 1000);
}

function showLiveSessionUI(contextLabel) {
  const setup = $('#live-practice-setup');
  const sess = $('#live-practice-session');
  const ctx = $('#live-practice-context');
  const ans = $('#live-practice-answer');
  if (setup) setup.hidden = true;
  if (sess) sess.hidden = false;
  if (ctx) ctx.textContent = contextLabel || '';
  if (ans) ans.value = '';
}

function endLiveSession() {
  stopLiveRoundTimer();
  state.livePractice.active = false;
  state.livePractice.pack = null;
  const setup = $('#live-practice-setup');
  const sess = $('#live-practice-session');
  const q = $('#live-practice-question');
  const ans = $('#live-practice-answer');
  if (setup) setup.hidden = false;
  if (sess) sess.hidden = true;
  if (q) q.textContent = '';
  if (ans) ans.value = '';
}

function liveNextQuestion() {
  const lp = state.livePractice;
  if (!lp.active || !lp.pack) return;
  const pack = lp.pack;
  const prompts = pack.questionPrompts || [];
  let text;
  if (prompts.length > 0) {
    text = prompts[lp.qIndex % prompts.length];
    lp.qIndex += 1;
  } else {
    text = FALLBACK_INTERVIEW_QUESTIONS[Math.floor(Math.random() * FALLBACK_INTERVIEW_QUESTIONS.length)];
  }
  let extra = '';
  if (pack.storySnippets?.length && Math.random() > 0.35) {
    const teaser = firstLineTeaser(pickRandomStorySnippet(pack.storySnippets));
    extra = `\n\n(Tie it to one of your stories — e.g. “${teaser}”)`;
  }
  const el = $('#live-practice-question');
  if (el) el.textContent = text + extra;
  startLiveRoundTimer();
}

function liveStoryDrill() {
  const lp = state.livePractice;
  if (!lp.active || !lp.pack?.storySnippets?.length) return;
  const sn = pickRandomStorySnippet(lp.pack.storySnippets);
  const el = $('#live-practice-question');
  if (el) {
    el.textContent = `Walk me through this in about two minutes — situation, what you did, and the outcome:\n\n${sn}`;
  }
  startLiveRoundTimer();
}

async function startLivePracticeLedger() {
  const n = parseInt($('#live-app-pick')?.value || '', 10);
  if (!Number.isFinite(n)) {
    toast('Choose a ledger row first');
    return;
  }
  try {
    const data = await api(`/api/interview-prep/rehearsal?num=${encodeURIComponent(n)}`);
    if (!data.storySnippets?.length) {
      toast('STAR story bank is empty — add ## story sections first');
      return;
    }
    state.livePractice.active = true;
    state.livePractice.pack = data;
    state.livePractice.mode = 'ledger';
    state.livePractice.qIndex = 0;
    showLiveSessionUI(`${data.company} — ${data.role}`);
    liveNextQuestion();
  } catch (e) {
    toast(String(e.message || e));
  }
}

async function startLivePracticeStoryOnly() {
  try {
    const doc = await api('/api/interview-prep/content?name=story-bank.md');
    const snippets = splitStorySnippetsFromMarkdown(doc.content || '');
    if (!snippets.length) {
      toast('STAR story bank needs more text — use ## headings per story');
      return;
    }
    state.livePractice.active = true;
    state.livePractice.pack = {
      title: 'STAR story bank',
      company: '',
      role: '',
      storySnippets: snippets,
      questionPrompts: [],
    };
    state.livePractice.mode = 'story';
    state.livePractice.qIndex = 0;
    showLiveSessionUI('STAR story bank only');
    liveNextQuestion();
  } catch (e) {
    toast(String(e.message || e));
  }
}

function wirePrepRowButtons(tbody) {
  if (!tbody) return;
  tbody.querySelectorAll('.prep-row-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const num = Number(btn.dataset.num);
      const app = state.applications.find((x) => Number(x.num) === num);
      if (!app) {
        toast('Row not found — refresh the ledger');
        return;
      }
      void openPrepForApplicationRow(app).catch((err) => toast(String(err.message || err)));
});
});}

function navigateToApply(num, { autoLoad = false } = {}) {
  if (!Number.isFinite(num)) return;
  state.applyJumpNum = num;
  state.applyAutoLoad = !!autoLoad;
  showView('apply');
}

function navigateToOutreach(num, { autoLoad = false } = {}) {
  if (!Number.isFinite(num)) return;
  state.outreachJumpNum = num;
  state.outreachAutoLoad = !!autoLoad;
  showView('outreach');
}

function wireApplyRowButtons(tbody) {
  if (!tbody) return;
  tbody.querySelectorAll('.apply-row-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const num = Number(btn.dataset.num);
      navigateToApply(num, { autoLoad: true });
    });
  });
}

function wireOutreachRowButtons(tbody) {
  if (!tbody) return;
  tbody.querySelectorAll('.outreach-row-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const num = Number(btn.dataset.num);
      navigateToOutreach(num, { autoLoad: true });
    });
  });
}

function explainApplyPackError(code) {
  const c = String(code || '');
  if (c === 'no_report' || c === 'no_link') return 'This row has no linked evaluation report — link a report cell first, or evaluate the job in career-ops.';
  if (c === 'missing_file') return 'Report file path is set but the file is missing on disk.';
  return 'Could not load report context.';
}

async function loadApplyView() {
  wireApplyDeskView();
  const errEl = $('#apply-load-error');
  if (errEl) {
    errEl.hidden = true;
    errEl.textContent = '';
  }
  if (!state.applications.length) {
    try {
      await loadTracker();
    } catch (e) {
      if (errEl) {
        errEl.textContent = String(e.message || e);
        errEl.hidden = false;
      }
      return;
    }
  }
  fillLedgerRowSelects();
  const pick = $('#apply-app-pick');
  if (pick && state.applyJumpNum != null) {
    pick.value = String(state.applyJumpNum);
    state.applyJumpNum = null;
  }
  if (state.applyAutoLoad && pick?.value) {
    state.applyAutoLoad = false;
    await loadApplyPack().catch((err) => toast(String(err.message || err)));
  }
}

function renderApplyPackUi(data) {
  const summary = $('#apply-summary');
  const line = $('#apply-summary-line');
  const dl = $('#apply-dl');
  const sections = $('#apply-sections');
  const mount = $('#apply-sections-mount');
  const hint = $('#apply-pack-hint');
  const btnPost = $('#btn-apply-open-posting');
  const btnRep = $('#btn-apply-open-report');
  const app = data.application;
  const pick = parseInt($('#apply-app-pick')?.value || '', 10);
  const row = state.applications.find((x) => Number(x.num) === pick);
  const rowJobUrl = row?.jobUrl || '';
  const rowReportHref = reportHref(row?.report || '') || '';
  const jobUrl = app.jobUrl || data.signals?.url || rowJobUrl || '';
  const reportHref2 = (data.reportPath ? `/${String(data.reportPath).replace(/^\//, '')}` : '') || rowReportHref || '';
  if (btnPost) btnPost.classList.toggle('apply-link-inactive', !jobUrl);
  if (btnRep) btnRep.classList.toggle('apply-link-inactive', !reportHref2);

  if (line) {
    line.textContent = `#${app.num} — ${app.company} — ${app.role} · ${app.score} · ${app.status}`;
  }

  if (data.packError) {
    if (hint) {
      hint.textContent = explainApplyPackError(data.packError);
      hint.hidden = false;
    }
    if (summary) summary.hidden = true;
    if (sections) sections.hidden = true;
    if (dl) dl.innerHTML = '';
    if (mount) mount.innerHTML = '';
    if (btnRep) btnRep.classList.add('apply-link-inactive');
    state.applyPack = data;
    return;
  }

  if (hint) {
    if (data.hasDraftAnswers) {
      hint.textContent = 'This report includes block H (draft application answers). Open the details below or the full report while you fill the form.';
    } else {
      hint.textContent =
        'No block H yet — answers were not pre-drafted in the report (common when the score is below the draft threshold). Use blocks B–F and your Manuscript tab.';
    }
    hint.hidden = false;
  }

  if (summary) summary.hidden = false;
  if (dl) {
    const s = data.signals || {};
    const rows = [
      ['Posting URL', jobUrl ? `<a href="${escapeAttr(jobUrl)}" target="_blank" rel="noopener">Open</a>` : '—'],
      ['Report', data.reportPath ? `<a href="${escapeAttr(`/${data.reportPath}`)}" target="_blank" rel="noopener">Open</a>` : '—'],
      ['Archetype', escapeHtml(s.archetype || '—')],
      ['Seniority', escapeHtml(s.seniority || '—')],
      ['Remote / location', escapeHtml(`${s.remote || '—'} · ${s.location || '—'}`)],
      ['Comp (report)', escapeHtml(s.comp || '—')],
      ['Header score', s.headerScore != null ? escapeHtml(String(s.headerScore)) : '—'],
    ];
    dl.innerHTML = rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${v}</dd>`).join('');
  }

  const sec = data.sections || {};
  const blocks = [
    { key: 'H', title: 'H — Draft application answers', body: sec.H, empty: 'No block H in this report.' },
    { key: 'F', title: 'F — Interview / STAR angles', body: sec.F, empty: 'No block F excerpt.' },
    { key: 'B', title: 'B — CV match', body: sec.B, empty: 'No block B excerpt.' },
    { key: 'E', title: 'E — Personalization plan', body: sec.E, empty: 'No block E excerpt.' },
    { key: 'G', title: 'G — Posting legitimacy', body: sec.G, empty: 'No block G excerpt.' },
  ];

  if (mount) {
    mount.innerHTML = blocks
      .map((b) => {
        const has = !!(b.body && String(b.body).trim());
        const open = b.key === 'H' && has ? ' open' : '';
        const inner = has
          ? `<pre class="apply-pre">${escapeHtml(b.body)}</pre>`
          : `<p class="muted small apply-pre">${escapeHtml(b.empty)}</p>`;
        return `<details class="apply-details"${open}><summary>${escapeHtml(b.title)}</summary>${inner}</details>`;
      })
      .join('');
  }
  if (sections) sections.hidden = false;
  state.applyPack = data;
}

function buildApplyBundleText() {
  const data = state.applyPack;
  const questions = ($('#apply-questions')?.value || '').trim();
  const pick = parseInt($('#apply-app-pick')?.value || '', 10);
  const rowNum = Number(data?.application?.num);
  if (!data?.application || !Number.isFinite(pick) || rowNum !== pick) {
    return '';
  }
  const app = data.application;
  const jobUrl = app.jobUrl || data.signals?.url || '';
  const lines = [
    '# Career-Ops — apply assistant context',
    '',
    `Ledger: #${app.num} | ${app.company} | ${app.role}`,
    `Score (ledger): ${app.score} | Status: ${app.status}`,
    `Posting: ${jobUrl || '—'}`,
    `Report file: ${data.reportPath || '—'}`,
    '',
  ];
  if (data.packError) {
    lines.push(`## Report load`, explainApplyPackError(data.packError), '');
  } else {
    const s = data.signals || {};
    lines.push(
      '## Parsed header signals',
      `- Archetype: ${s.archetype || '—'}`,
      `- Seniority: ${s.seniority || '—'}`,
      `- Remote: ${s.remote || '—'}`,
      `- Location: ${s.location || '—'}`,
      `- Comp line: ${s.comp || '—'}`,
      `- Header score: ${s.headerScore != null ? s.headerScore : '—'}`,
      ''
    );
    const sec = data.sections || {};
    const addBlock = (label, body) => {
      if (body && String(body).trim()) {
        lines.push(`## ${label}`, '', String(body).trim(), '');
      }
    };
    addBlock('H — Draft application answers', sec.H);
    addBlock('F — Interview / STAR angles', sec.F);
    addBlock('B — CV match', sec.B);
    addBlock('E — Personalization plan', sec.E);
    addBlock('G — Posting legitimacy', sec.G);
  }
  lines.push('## Form questions (from candidate)', '', questions || '(none pasted yet)', '', '---', '');
  lines.push(
    'Instructions: Map each question to concise, truthful answers using cv.md + the blocks above. Do not invent employers, dates, or credentials. Never submit a form on the candidate’s behalf — output copy-paste text only.'
  );
  return lines.join('\n');
}

async function loadApplyPack() {
  const n = parseInt($('#apply-app-pick')?.value || '', 10);
  const errEl = $('#apply-load-error');
  if (!Number.isFinite(n) || n < 1) {
    toast('Pick a ledger row');
    return;
  }
  if (errEl) {
    errEl.hidden = true;
    errEl.textContent = '';
  }
  const btn = $('#btn-apply-load');
  const prev = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Loading…';
  }
  try {
    const data = await api(`/api/applications/${n}/apply-pack`);
    renderApplyPackUi(data);
    toast('Context loaded');
  } catch (e) {
    state.applyPack = null;
    if (errEl) {
      errEl.textContent = String(e.message || e);
      errEl.hidden = false;
    }
    toast(String(e.message || e));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prev || 'Load context';
    }
  }
}

async function loadOutreachView() {
  const m = await ensureOutreachMod();
  const loadOutreachPack = async () =>
    m.loadOutreachPack({
      state,
      $,
      api,
      toast,
      renderOutreachPackUi: (data) => m.renderOutreachPackUi({ data, state, $, escapeHtml }),
    });
  const wireOutreachDeskView = async () =>
    m.wireOutreachDeskView({
      state,
      $,
      toast,
      renderOutreachPackUi: (data) => m.renderOutreachPackUi({ data, state, $, escapeHtml }),
      buildOutreachBundleText: () => m.buildOutreachBundleText({ state, $ }),
      loadOutreachPack,
    });
  await m.loadOutreachView({
    state,
    $,
    toast,
    loadTracker,
    fillLedgerRowSelects,
    wireOutreachDeskView,
    loadOutreachPack,
  });
}

function renderRehearsalQuestions(pack) {
  const ul = $('#rehearsal-q-list');
  const miss = $('#rehearsal-prep-missing');
  if (!ul) return;
  ul.innerHTML = '';
  const qs = pack?.questionPrompts || [];
  if (!qs.length) {
    if (miss) miss.hidden = false;
    return;
  }
  if (miss) miss.hidden = true;
  ul.innerHTML = qs.map((q) => `<li>${escapeHtml(q)}</li>`).join('');
}

async function openRehearsalModal(num) {
  const pickSel = $('#modal-rehearsal-pick');
  const n =
    num != null && num !== undefined && !Number.isNaN(Number(num))
      ? Number(num)
      : parseInt(pickSel?.value || '', 10);
  if (!Number.isFinite(n)) {
    toast('Pick a ledger row');
    return;
  }
  if (pickSel) pickSel.value = String(n);
  try {
    const data = await api(`/api/interview-prep/rehearsal?num=${encodeURIComponent(n)}`);
    const pack = data;
    const snippets = pack.storySnippets || [];
    if (!snippets.length) {
      toast('STAR story bank is empty — add ## sections per story first');
      return;
    }
    state.rehearsal.pack = pack;
    state.rehearsal.roundSec = 90;
    const line = $('#rehearsal-job-line');
    if (line) line.textContent = `${pack.company} — ${pack.role}`;
    const pre = $('#rehearsal-prompt-text');
    if (pre) pre.textContent = pickRandomStorySnippet(snippets);
    renderRehearsalQuestions(pack);
    const dlg = $('#modal-rehearsal');
    if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
    startRehearsalRoundTimer();
  } catch (e) {
    toast(String(e.message || e));
  }
}

function rehearsalNextPrompt() {
  const pack = state.rehearsal.pack;
  if (!pack?.storySnippets?.length) return;
  const pre = $('#rehearsal-prompt-text');
  if (pre) pre.textContent = pickRandomStorySnippet(pack.storySnippets);
  startRehearsalRoundTimer();
}

function wireDeskFocusAndRehearsal() {
  if (document.body.dataset.careeropsDeskWired === '1') return;
  document.body.dataset.careeropsDeskWired = '1';

  fillFocusViewSwitch();

  $('#btn-focus-open')?.addEventListener('click', () => {
    const d = $('#dialog-focus');
    if (d && typeof d.showModal === 'function') d.showModal();
  });
  $$('#close-focus-dialog, #cancel-focus-dialog').forEach((b) =>
    b.addEventListener('click', () => $('#dialog-focus')?.close())
  );
  $('#btn-focus-start')?.addEventListener('click', () => {
    const sec = parseInt($('#focus-duration')?.value || '1500', 10);
    const v = $('#focus-start-view')?.value || 'interview-story';
    $('#dialog-focus')?.close();
    startFocusSession(sec, v);
  });
  $('#focus-end')?.addEventListener('click', () => endFocusSession());
  $('#focus-pause')?.addEventListener('click', () => toggleFocusPause());
  $('#focus-view-switch')?.addEventListener('change', (e) => {
    if (!state.focus.active) return;
    applyFocusViewChoice(e.target.value);
  });

  $('#btn-live-start-ledger')?.addEventListener('click', () => {
    void startLivePracticeLedger();
  });
  $('#btn-live-start-story')?.addEventListener('click', () => {
    void startLivePracticeStoryOnly();
  });
  $('#btn-live-next-q')?.addEventListener('click', () => liveNextQuestion());
  $('#btn-live-shuffle-story')?.addEventListener('click', () => liveStoryDrill());
  $('#btn-live-reset-timer')?.addEventListener('click', () => startLiveRoundTimer());
  $('#btn-live-end')?.addEventListener('click', () => endLiveSession());
  $('#btn-live-open-modal')?.addEventListener('click', () => {
    const livePick = $('#live-app-pick')?.value;
    const modalPick = $('#modal-rehearsal-pick');
    if (modalPick && livePick) modalPick.value = livePick;
    const dlg = $('#modal-rehearsal');
    if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
  });
  $('#btn-modal-rehearsal-load')?.addEventListener('click', () => {
    void openRehearsalModal();
  });
  $$('#close-rehearsal, #btn-rehearsal-close').forEach((b) =>
    b.addEventListener('click', () => {
      stopRehearsalRoundTimer();
      $('#modal-rehearsal')?.close();
    })
  );
  $('#btn-rehearsal-next')?.addEventListener('click', () => rehearsalNextPrompt());
  $('#btn-rehearsal-round-reset')?.addEventListener('click', () => startRehearsalRoundTimer());

  $('#btn-edit-open-prep')?.addEventListener('click', async () => {
    const num = Number($('#f-num')?.value);
    const a = state.applications.find((x) => x.num === num);
    if (!a) return;
    $('#modal-edit')?.close();
    await openPrepForApplicationRow(a);
  });
  $('#btn-edit-from-report')?.addEventListener('click', async () => {
    const num = Number($('#f-num')?.value);
    if (!num) return;
    $('#modal-edit')?.close();
    await seedPrepFromReportForNum(num);
  });
  $('#btn-edit-rehearsal')?.addEventListener('click', () => {
    const num = Number($('#f-num')?.value);
    $('#modal-edit')?.close();
    openRehearsalModal(num);
  });
  $('#btn-edit-open-apply')?.addEventListener('click', () => {
    const num = Number($('#f-num')?.value);
    if (!num) return;
    $('#modal-edit')?.close();
    navigateToApply(num, { autoLoad: true });
  });
}

async function saveInterviewDoc() {
  const name = getCurrentInterviewInternalName();
  const content = $('#interview-body')?.value ?? '';
  if (!name) return;
  const btn = $('#btn-interview-save');
  const prev = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving…';
  }
  try {
    await api(`/api/interview-prep/content?name=${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
    toast('Saved');
    const meta = $('#interview-meta');
    if (meta) {
      const words = content.trim() ? content.trim().split(/\s+/).length : 0;
      const label = interviewLabelForName(name);
      meta.textContent = `${label} · ${words} words`;
    }
    updateStoryRibbonStats();
  } finally {
    if (btn) {
      btn.textContent = prev || 'Save';
      btn.disabled =
        state.interviewTab === 'prep' &&
        state.interviewItems.filter((i) => i.kind === 'prep').length === 0;
    }
  }
}

function openInterviewNotebookDialog() {
  const dlg = $('#modal-interview-notebook');
  const input = $('#interview-notebook-title');
  if (!dlg || !input || typeof dlg.showModal !== 'function') {
    toast('Dialog not available in this browser');
    return;
  }
  input.value = '';
  dlg.showModal();
  queueMicrotask(() => input.focus());
}

async function submitNewInterviewNotebook() {
  const input = $('#interview-notebook-title');
  const dlg = $('#modal-interview-notebook');
  const confirmBtn = $('#confirm-interview-notebook');
  const title = input?.value?.trim();
  if (!title) {
    toast('Enter a name for the notebook');
    input?.focus();
    return;
  }
  if (confirmBtn) confirmBtn.disabled = true;
  try {
    const out = await api('/api/interview-prep/create', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
    if (!out?.name) {
      throw new Error('Server did not return a notebook id — restart npm run web and try again');
    }
    dlg?.close();
    state.interviewTab = 'prep';
    state.interviewCurrent = out.name;
    await loadInterviewView({ preferPrepName: out.name });
    toast('Notebook created');
  } catch (e) {
    toast(e.message);
  } finally {
    if (confirmBtn) confirmBtn.disabled = false;
  }
}

/** Clicks inside the Interview view + modal (prompt is often blocked in embedded browsers). */
function wireInterviewView() {
  if (document.body.dataset.careeropsInterviewWired === '1') return;
  document.body.dataset.careeropsInterviewWired = '1';

  const root = $('#view-interview');
  if (root) {
    root.addEventListener('click', (e) => {
      const seg = e.target.closest?.('.interview-seg-btn');
      if (seg) {
        e.preventDefault();
        const tab = seg.getAttribute('data-int-tab');
        if (tab !== 'story' && tab !== 'prep') return;
        state.interviewTab = tab;
        syncInterviewUIAfterTab().catch((err) => toast(String(err.message || err)));
        return;
      }

      if (e.target.closest('#btn-interview-save')) {
        const saveBtn = $('#btn-interview-save');
        if (saveBtn?.disabled) return;
        saveInterviewDoc().catch((err) => toast(String(err.message || err)));
        return;
      }

      if (e.target.closest('#btn-interview-new') || e.target.closest('#btn-interview-new-empty')) {
        e.preventDefault();
        openInterviewNotebookDialog();
      }
    });

    root.addEventListener('change', (e) => {
      const sel = e.target;
      if (sel?.id !== 'interview-prep-select') return;
      loadInterviewDoc(sel.value).catch((err) => toast(String(err.message || err)));
    });
  }

  const dlg = $('#modal-interview-notebook');
  $('#close-interview-notebook')?.addEventListener('click', () => dlg?.close());
  $('#cancel-interview-notebook')?.addEventListener('click', () => dlg?.close());
  $('#confirm-interview-notebook')?.addEventListener('click', () =>
    submitNewInterviewNotebook().catch((err) => toast(String(err.message || err)))
  );
  $('#interview-notebook-title')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitNewInterviewNotebook().catch((err) => toast(String(err.message || err)));
    }
  });

  $('#interview-body')?.addEventListener('input', () => {
    if (state.interviewTab === 'story') updateStoryRibbonStats();
  });
}

wireInterviewView();
wireDeskFocusAndRehearsal();

/** Same pattern as Interview view: delegate from #view-apply so clicks work reliably in embedded browsers. */
function wireApplyDeskView() {
  const root = document.getElementById('view-apply');
  if (!root || root.dataset.applyWired === '1') return;
  root.dataset.applyWired = '1';

  function applySelectedApp() {
    const n = parseInt($('#apply-app-pick')?.value || '', 10);
    if (!Number.isFinite(n)) return null;
    return state.applications.find((x) => Number(x.num) === n) || null;
  }

  function applySelectedPostingUrl() {
    const d = state.applyPack;
    return d?.application?.jobUrl || d?.signals?.url || applySelectedApp()?.jobUrl || '';
  }

  function applySelectedReportHref() {
    const d = state.applyPack;
    if (d?.reportPath) return `/${String(d.reportPath).replace(/^\//, '')}`;
    const rep = applySelectedApp()?.report || '';
    return reportHref(rep) || '';
  }

  function syncApplyLinkButtons() {
    const bp = $('#btn-apply-open-posting');
    const br = $('#btn-apply-open-report');
    const url = applySelectedPostingUrl();
    const rh = applySelectedReportHref();
    if (bp) bp.classList.toggle('apply-link-inactive', !url);
    if (br) br.classList.toggle('apply-link-inactive', !rh);
  }

  root.addEventListener('change', (e) => {
    const sel = e.target;
    if (sel?.id !== 'apply-app-pick') return;
    state.applyPack = null;
    const sum = $('#apply-summary');
    const sec = $('#apply-sections');
    const hint = $('#apply-pack-hint');
    const mount = $('#apply-sections-mount');
    const dl = $('#apply-dl');
    const errEl = $('#apply-load-error');
    if (sum) sum.hidden = true;
    if (sec) sec.hidden = true;
    if (hint) hint.hidden = true;
    if (mount) mount.innerHTML = '';
    if (dl) dl.innerHTML = '';
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = '';
    }
    syncApplyLinkButtons();

    // best-effort prefill: if this row points to a LinkedIn posting, copy into the Easy Apply URL field
    const li = $('#apply-linkedin-url');
    if (li && !String(li.value || '').trim()) {
      const ju = applySelectedApp()?.jobUrl || '';
      if (/linkedin\.com\/jobs\/view/i.test(ju)) li.value = ju;
    }
  });

  root.addEventListener('click', (e) => {
    if (e.target.closest('#btn-apply-load')) {
      e.preventDefault();
      void loadApplyPack().catch((err) => toast(String(err.message || err)));
      return;
    }
    if (e.target.closest('#btn-apply-open-posting')) {
      e.preventDefault();
      const url = applySelectedPostingUrl();
      if (!url) {
        toast('Pick a ledger row with a posting URL');
        return;
      }
      window.open(url, '_blank', 'noopener');
      return;
    }
    if (e.target.closest('#btn-apply-open-report')) {
      e.preventDefault();
      const rh = applySelectedReportHref();
      if (!rh) {
        toast('Pick a ledger row with a linked report');
        return;
      }
      window.open(rh, '_blank', 'noopener');
      return;
    }
    if (e.target.closest('#btn-apply-copy-ai')) {
      e.preventDefault();
      void (async () => {
        const t = buildApplyBundleText();
        if (!t.trim()) {
          toast('Load context for the selected row first');
          return;
        }
        try {
          await navigator.clipboard.writeText(t);
          toast('Copied bundle for AI');
        } catch {
          toast('Clipboard blocked — copy manually from the report + questions box');
        }
      })();
      return;
    }
    if (e.target.closest('#btn-apply-mark-applied')) {
      e.preventDefault();
      const n = parseInt($('#apply-app-pick')?.value || '', 10);
      if (!Number.isFinite(n) || n < 1) {
        toast('Pick a ledger row');
        return;
      }
      openEdit(n);
      const st = $('#f-status');
      if (st && [...st.options].some((o) => o.value === 'Applied')) st.value = 'Applied';
      togglePreApplyPanel();
    }

    if (e.target.closest('#btn-apply-open-linkedin')) {
      e.preventDefault();
      const a = applySelectedApp();
      const q = encodeURIComponent([a?.company, a?.role].filter(Boolean).join(' ') || 'jobs');
      window.open(`https://www.linkedin.com/jobs/search/?keywords=${q}`, '_blank', 'noopener');
      return;
    }
    if (e.target.closest('#btn-apply-open-indeed')) {
      e.preventDefault();
      const a = applySelectedApp();
      const q = encodeURIComponent([a?.company, a?.role].filter(Boolean).join(' ') || 'jobs');
      window.open(`https://www.indeed.com/jobs?q=${q}`, '_blank', 'noopener');
      return;
    }
    if (e.target.closest('#btn-apply-open-wellfound')) {
      e.preventDefault();
      const a = applySelectedApp();
      const q = encodeURIComponent([a?.company, a?.role].filter(Boolean).join(' ') || 'jobs');
      window.open(`https://wellfound.com/jobs?keyword=${q}`, '_blank', 'noopener');
      return;
    }
    if (e.target.closest('#btn-apply-open-linkedin-easy')) {
      e.preventDefault();
      const typed = String($('#apply-linkedin-url')?.value || '').trim();
      const url = typed || applySelectedPostingUrl();
      if (!url) {
        toast('Paste a LinkedIn job URL or pick a row with a posting URL');
        return;
      }
      window.open(url, '_blank', 'noopener');
      return;
    }
    if (e.target.closest('#btn-apply-copy-easy-bundle')) {
      e.preventDefault();
      void (async () => {
        const base = buildApplyBundleText();
        if (!base.trim()) {
          toast('Pick a row and load context (recommended) before copying');
          return;
        }
        const typed = String($('#apply-linkedin-url')?.value || '').trim();
        const extra = [
          '',
          '## LinkedIn Easy Apply notes (Desk)',
          '- Do NOT fabricate employers, degrees, dates, or certifications.',
          '- Keep answers concise; prefer bullet lists.',
          '- STOP before clicking “Submit application”. Review every field first.',
          typed ? `- LinkedIn job URL: ${typed}` : '',
          '',
        ]
          .filter(Boolean)
          .join('\n');
        try {
          await navigator.clipboard.writeText(`${base}${extra}`);
          toast('Copied Easy Apply bundle');
        } catch {
          toast('Clipboard blocked — copy manually from the bundle');
        }
      })();
      return;
    }
  });

  // initialize button state on first wire (in case Apply view is opened after tracker already loaded)
  syncApplyLinkButtons();
}

wireApplyDeskView();
wireLedgerView({
  deskIcon,
  toast,
  fillLedgerRowSelects,
  wirePrepRowButtons,
  wireApplyRowButtons,
  wireOutreachRowButtons,
});

function buildDeepPrompt(company, role, profileHeadline) {
  const c = company || '[Company]';
  const r = role || '[Role]';
  const head = profileHeadline ? `\n\nCandidate headline: ${profileHeadline}` : '';
  return `## Deep Research: ${c} — ${r}\n\nContext: I am evaluating a candidate for ${r} at ${c}. I need actionable information for the interview.${head}\n\n### 1. AI Strategy\n- What products/features use AI/ML?\n- What is their AI stack? (models, infrastructure, tools)\n- Do they have an engineering blog? What do they publish?\n- What papers or talks have they given on AI?\n\n### 2. Recent Developments (last 6 months)\n- Any relevant hires in AI/ML/product?\n- Any acquisitions or partnerships?\n- Any product launches or pivots?\n- Any funding rounds or leadership changes?\n\n### 3. Engineering Culture\n- How do they ship? (deployment cadence, CI/CD)\n- Single-repo or multi-repo?\n- What languages/frameworks do they use?\n- Remote-first or office-first?\n- Glassdoor/Blind reviews on engineering culture?\n\n### 4. Probable Challenges\n- What scaling issues do they have?\n- Reliability, cost, and latency challenges?\n- Are they migrating anything? (infrastructure, models, platforms)\n- What pain points do people mention in reviews?\n\n### 5. Competitors and Differentiation\n- Who are their main competitors?\n- What is their moat/differentiator?\n- How do they position themselves against the competition?\n\n### 6. Candidate Perspective\nGiven my profile (cv.md + profile.yml):\n- What unique value do I bring to this team?\n- Which of my projects are most relevant?\n- What story should I tell in the interview?\n`;
}

async function wireDeepView() {
  const m = await ensureDeskBundlesMod();
  return m.wireDeepView({ buildDeepPrompt, toast, $, api });
}

async function wireTrainingView() {
  const m = await ensureDeskBundlesMod();
  return m.wireTrainingView({ toast, $ });
}

async function wireProjectView() {
  const m = await ensureDeskBundlesMod();
  return m.wireProjectView({ toast, $ });
}

// ── CV / Manuscript composer ────────────────────────────────────────

function escVal(s) {
  return escapeAttr(s ?? '');
}

function renderComposer(m) {
  const mount = $('#cv-composer-mount');
  if (!mount) return;
  const ex = Array.isArray(m.experience) && m.experience.length ? m.experience : [{ company: '', title: '', dates: '', bullets: [''] }];
  const ed = Array.isArray(m.education) && m.education.length ? m.education : [{ school: '', degree: '', year: '' }];
  const skills = Array.isArray(m.skills) ? m.skills.join(', ') : '';

  const expHtml = ex
    .map(
      (row, i) => `
    <div class="ms-exp-card" data-exp="${i}">
      <div class="composer-grid trio">
        <label>Company <input type="text" class="ms-exp-co" value="${escVal(row.company)}" /></label>
        <label>Title <input type="text" class="ms-exp-title" value="${escVal(row.title)}" /></label>
        <label>Dates <input type="text" class="ms-exp-dates" placeholder="2022 — Present" value="${escVal(row.dates)}" /></label>
      </div>
      <label class="comp-full">Bullets (one per line)<textarea class="ms-exp-bullets" rows="4">${escapeHtml((row.bullets || []).join('\n'))}</textarea></label>
      <button type="button" class="btn quiet ms-remove-exp" ${ex.length < 2 ? 'hidden' : ''}>Remove role</button>
    </div>`
    )
    .join('');

  const eduHtml = ed
    .map(
      (row, i) => `
    <div class="ms-edu-card" data-edu="${i}">
      <div class="composer-grid trio">
        <label>School <input type="text" class="ms-edu-school" value="${escVal(row.school)}" /></label>
        <label>Degree <input type="text" class="ms-edu-degree" value="${escVal(row.degree)}" /></label>
        <label>Year <input type="text" class="ms-edu-year" value="${escVal(row.year)}" /></label>
      </div>
      <button type="button" class="btn quiet ms-remove-edu" ${ed.length < 2 ? 'hidden' : ''}>Remove</button>
    </div>`
    )
    .join('');

  mount.innerHTML = `
    <div class="composer-grid duo">
      <label>Full name <input type="text" id="ms-fullName" value="${escVal(m.fullName)}" /></label>
      <label>Email <input type="email" id="ms-email" value="${escVal(m.email)}" /></label>
      <label>Phone <input type="text" id="ms-phone" value="${escVal(m.phone)}" /></label>
      <label>Location <input type="text" id="ms-location" value="${escVal(m.location)}" /></label>
      <label class="span-2">LinkedIn / site <input type="text" id="ms-linkedin" value="${escVal(m.linkedin)}" /></label>
    </div>
    <label class="comp-full">Headline (one line)<input type="text" id="ms-headline" value="${escVal(m.headline)}" /></label>
    <label class="comp-full">Summary<textarea id="ms-summary" rows="4">${escapeHtml(m.summary || '')}</textarea></label>
    <label class="comp-full">Skills (comma-separated)<input type="text" id="ms-skills" value="${escVal(skills)}" /></label>
    <h4 class="composer-h4">Experience</h4>
    <div id="ms-exp-root">${expHtml}</div>
    <button type="button" class="btn quiet" id="ms-add-exp">+ Add role</button>
    <h4 class="composer-h4">Education</h4>
    <div id="ms-edu-root">${eduHtml}</div>
    <button type="button" class="btn quiet" id="ms-add-edu">+ Add school</button>
  `;

  mount.querySelector('#ms-add-exp')?.addEventListener('click', () => {
    $('#ms-exp-root')?.insertAdjacentHTML(
      'beforeend',
      `<div class="ms-exp-card" data-exp="new">
      <div class="composer-grid trio">
        <label>Company <input type="text" class="ms-exp-co" value="" /></label>
        <label>Title <input type="text" class="ms-exp-title" value="" /></label>
        <label>Dates <input type="text" class="ms-exp-dates" value="" /></label>
      </div>
      <label class="comp-full">Bullets (one per line)<textarea class="ms-exp-bullets" rows="4"></textarea></label>
      <button type="button" class="btn quiet ms-remove-exp">Remove role</button>
    </div>`
    );
    refreshRemoveExpVisibility();
  });

  mount.querySelector('#ms-add-edu')?.addEventListener('click', () => {
    $('#ms-edu-root')?.insertAdjacentHTML(
      'beforeend',
      `<div class="ms-edu-card" data-edu="new">
      <div class="composer-grid trio">
        <label>School <input type="text" class="ms-edu-school" value="" /></label>
        <label>Degree <input type="text" class="ms-edu-degree" value="" /></label>
        <label>Year <input type="text" class="ms-edu-year" value="" /></label>
      </div>
      <button type="button" class="btn quiet ms-remove-edu">Remove</button>
    </div>`
    );
    refreshRemoveEduVisibility();
  });

  mount.querySelectorAll('.ms-remove-exp').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.target.closest('.ms-exp-card')?.remove();
      refreshRemoveExpVisibility();
    })
  );
  mount.querySelectorAll('.ms-remove-edu').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.target.closest('.ms-edu-card')?.remove();
      refreshRemoveEduVisibility();
    })
  );
}

function refreshRemoveExpVisibility() {
  const cards = $$('.ms-exp-card');
  cards.forEach((c) => {
    const btn = c.querySelector('.ms-remove-exp');
    if (btn) btn.hidden = cards.length < 2;
  });
}

function refreshRemoveEduVisibility() {
  const cards = $$('.ms-edu-card');
  cards.forEach((c) => {
    const btn = c.querySelector('.ms-remove-edu');
    if (btn) btn.hidden = cards.length < 2;
  });
}

function gatherComposer() {
  const skillsRaw = ($('#ms-skills') && $('#ms-skills').value) || '';
  const skills = skillsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const experience = $$('.ms-exp-card').map((card) => ({
    company: card.querySelector('.ms-exp-co')?.value?.trim() || '',
    title: card.querySelector('.ms-exp-title')?.value?.trim() || '',
    dates: card.querySelector('.ms-exp-dates')?.value?.trim() || '',
    bullets: (card.querySelector('.ms-exp-bullets')?.value || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  }));
  const education = $$('.ms-edu-card').map((card) => ({
    school: card.querySelector('.ms-edu-school')?.value?.trim() || '',
    degree: card.querySelector('.ms-edu-degree')?.value?.trim() || '',
    year: card.querySelector('.ms-edu-year')?.value?.trim() || '',
  }));
  return {
    fullName: $('#ms-fullName')?.value?.trim() || '',
    email: $('#ms-email')?.value?.trim() || '',
    phone: $('#ms-phone')?.value?.trim() || '',
    location: $('#ms-location')?.value?.trim() || '',
    linkedin: $('#ms-linkedin')?.value?.trim() || '',
    headline: $('#ms-headline')?.value?.trim() || '',
    summary: $('#ms-summary')?.value?.trim() || '',
    skills,
    experience: experience.length ? experience : [{ company: '', title: '', dates: '', bullets: [] }],
    education: education.length ? education : [{ school: '', degree: '', year: '' }],
  };
}

async function loadCvView() {
  const d = await api('/api/cv');
  state.cvText = d.content || '';
  $('#cv-body').value = d.content || '';
  $('#cv-meta').textContent = d.exists
    ? `${d.words || 0} words in manuscript`
    : 'No CV text yet — edit below or use the composer';
  try {
    const { manuscript } = await api('/api/cv/manuscript');
    renderComposer(manuscript);
    $('#manuscript-meta').textContent = 'Composer ready — save to publish your CV';
  } catch {
    /* ignore */
  }
}

$$('.cv-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const mode = tab.dataset.cvTab;
    $$('.cv-tab').forEach((t) => t.classList.toggle('active', t === tab));
    const comp = $('#cv-composer-panel');
    const md = $('#cv-markdown-panel');
    if (comp) comp.hidden = mode !== 'composer';
    if (md) md.hidden = mode !== 'markdown';
  });
});

const btnManuscriptSave = $('#btn-manuscript-save');
if (btnManuscriptSave) {
  btnManuscriptSave.addEventListener('click', async () => {
    try {
      const body = gatherComposer();
      const out = await api('/api/cv/manuscript', { method: 'PUT', body: JSON.stringify(body) });
      state.cvText = (await api('/api/cv')).content || '';
      $('#cv-body').value = state.cvText;
      $('#manuscript-meta').textContent = `${out.words || 0} words · CV published from composer`;
      toast('Composer saved — CV updated');
      loadWorkspaceHints();
    } catch (e) {
      toast(e.message);
    }
  });
}

const btnCvSave = $('#btn-cv-save');
if (btnCvSave) {
  btnCvSave.addEventListener('click', async () => {
    try {
      const content = $('#cv-body').value;
      const d = await api('/api/cv', { method: 'PUT', body: JSON.stringify({ content }) });
      state.cvText = content;
      toast(`Saved CV (${d.words} words)`);
      $('#cv-meta').textContent = `${d.words} words in manuscript`;
      loadWorkspaceHints();
    } catch (e) {
      toast(e.message);
    }
  });
}

const btnShortlistCsv = $('#btn-shortlist-csv');
if (btnShortlistCsv) {
  btnShortlistCsv.addEventListener('click', () => {
    const rows = readShortlist();
    if (!rows.length) {
      toast('Shortlist is empty');
      return;
    }
    const escCell = (c) => `"${String(c).replace(/"/g, '""')}"`;
    const header = 'url,company,title,savedAt';
    const body = rows.map((r) =>
      [escCell(r.url), escCell(r.company), escCell(r.title), escCell(new Date(r.savedAt).toISOString())].join(',')
    );
    const blob = new Blob([[header, ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'career-ops-shortlist.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Downloaded CSV');
  });
}

$('#cv-file').addEventListener('change', (ev) => {
  const f = ev.target.files?.[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    $('#cv-body').value = String(r.result || '');
    toast('File loaded — review and click Save CV');
  };
  r.readAsText(f);
  ev.target.value = '';
});

// ── Profile (match tab) ─────────────────────────────────────────────

async function loadProfileFields(prefetched) {
  let profile;
  if (prefetched !== undefined) {
    profile = prefetched?.profile ?? null;
  } else {
    const { profile: p } = await api('/api/profile');
    profile = p;
  }
  if (!profile) return;
  $('#pf-name').value = profile.candidate?.full_name || '';
  $('#pf-email').value = profile.candidate?.email || '';
  $('#pf-headline').value = profile.narrative?.headline || '';
  const prim = profile.target_roles?.primary;
  $('#pf-roles').value = Array.isArray(prim) ? prim.join('\n') : '';
  const cos = profile.target_companies;
  $('#pf-companies').value = Array.isArray(cos) ? cos.join('\n') : '';
}

$('#btn-profile-save').addEventListener('click', async () => {
  try {
    const primary = $('#pf-roles')
      .value.split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const target_companies = $('#pf-companies')
      .value.split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    await api('/api/profile', {
      method: 'PUT',
      body: JSON.stringify({
        candidate: {
          full_name: $('#pf-name').value,
          email: $('#pf-email').value,
        },
        narrative: { headline: $('#pf-headline').value },
        target_roles: { primary },
        target_companies,
      }),
    });
    toast('Profile saved');
  } catch (e) {
    toast(e.message);
  }
});

// ── Match setup ─────────────────────────────────────────────────────

function uniq(arr) {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}

function renderTagContainer(kind) {
  const id = kind === 'pos' ? 'tags-positive' : 'tags-negative';
  const arr = kind === 'pos' ? state.positive : state.negative;
  const el = $(`#${id}`);
  el.innerHTML = arr
    .map(
      (t, i) =>
        `<span class="tag">${escapeHtml(t)}<button type="button" data-k="${kind}" data-i="${i}" class="tag-x" aria-label="Remove">×</button></span>`
    )
    .join('');
  el.querySelectorAll('.tag-x').forEach((b) => {
    b.addEventListener('click', () => {
      const k = b.dataset.k;
      const i = Number(b.dataset.i);
      if (k === 'pos') state.positive.splice(i, 1);
      else state.negative.splice(i, 1);
      renderTagContainer('pos');
      renderTagContainer('neg');
    });
  });
}

$('#input-positive').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const v = e.target.value.trim();
  if (!v) return;
  state.positive = uniq([...state.positive, v]);
  e.target.value = '';
  renderTagContainer('pos');
});

$('#input-negative').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const v = e.target.value.trim();
  if (!v) return;
  state.negative = uniq([...state.negative, v]);
  e.target.value = '';
  renderTagContainer('neg');
});

$('#btn-exclude-entry').addEventListener('click', () => {
  if (!state.focusPresets?.seniority?.excludeEntry) return;
  state.negative = uniq([...state.negative, ...state.focusPresets.seniority.excludeEntry]);
  renderTagContainer('neg');
  toast('Added junior / intern blocklist keywords');
});

function renderFocusTracks() {
  const tracks = state.focusPresets?.focusTracks || [];
  const el = $('#focus-tracks');
  el.innerHTML = tracks
    .map(
      (t) =>
        `<button type="button" class="track-btn" data-id="${escapeHtml(t.id)}" title="${escapeHtml(t.description)}"><strong>${escapeHtml(t.label)}</strong><span>${escapeHtml(t.description)}</span></button>`
    )
    .join('');
  el.querySelectorAll('.track-btn').forEach((b) => {
    b.addEventListener('click', () => {
      const t = tracks.find((x) => x.id === b.dataset.id);
      if (!t?.positive) return;
      state.positive = uniq([...state.positive, ...t.positive]);
      renderTagContainer('pos');
      toast(`Added “${t.label}” keywords`);
    });
  });
}

function renderCompanyList() {
  const q = $('#company-q').value.trim().toLowerCase();
  const rows = state.companies.filter((c) => !q || c.name.toLowerCase().includes(q));
  $('#company-api-count').textContent = `${state.companies.filter((c) => c.hasApi).length} companies`;
  const tb = $('#company-list');
  tb.innerHTML = rows
    .map(
      (c, i) =>
        `<label class="company-row"><input type="checkbox" data-ci="${i}" ${c.enabled ? 'checked' : ''} /><span class="cn">${escapeHtml(c.name)}</span>${c.hasApi ? '' : '<em class="noapi">no API</em>'}</label>`
    )
    .join('');
  tb.querySelectorAll('input[type=checkbox]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const i = Number(cb.dataset.ci);
      const vis = state.companies.filter((c) => !q || c.name.toLowerCase().includes(q));
      const co = vis[i];
      const full = state.companies.find((x) => x.name === co?.name);
      if (full) full.enabled = cb.checked;
    });
  });
}

$('#company-q').addEventListener('input', () => renderCompanyList());

$('#btn-company-enable-visible').addEventListener('click', () => {
  const q = $('#company-q').value.trim().toLowerCase();
  state.companies.forEach((c) => {
    if (!q || c.name.toLowerCase().includes(q)) c.enabled = true;
  });
  renderCompanyList();
});

$('#btn-company-disable-visible').addEventListener('click', () => {
  const q = $('#company-q').value.trim().toLowerCase();
  state.companies.forEach((c) => {
    if (!q || c.name.toLowerCase().includes(q)) c.enabled = false;
  });
  renderCompanyList();
});

async function loadMatchView() {
  if (!state.focusPresets) {
    state.focusPresets = await api('/api/presets/focus');
    renderFocusTracks();
  }
  if (state.portalsConfig) {
    renderCompanyList();
    return;
  }
  const { config } = await api('/api/portals');
  state.portalsConfig = config;
  state.positive = [...(config.title_filter?.positive || [])];
  state.negative = [...(config.title_filter?.negative || [])];
  state.companies = (config.companies || []).map((c) => ({ ...c }));
  const mode = config.location_filter?.mode || 'none';
  const locVal = mode === 'us' ? 'us' : 'none';
  document.querySelectorAll('input[name=locmode]').forEach((r) => {
    r.checked = r.value === locVal;
  });
  renderTagContainer('pos');
  renderTagContainer('neg');
  renderCompanyList();
}

$('#btn-portals-save').addEventListener('click', async () => {
  try {
    const locmode = $('input[name=locmode]:checked')?.value || 'none';
    const scan = state.portalsConfig?.scan_options || {};
    await api('/api/portals', {
      method: 'PUT',
      body: JSON.stringify({
        title_filter: { positive: state.positive, negative: state.negative },
        location_filter: {
          ...(state.portalsConfig?.location_filter || {}),
          mode: locmode === 'us' ? 'us' : 'none',
        },
        scan_options: scan,
        companies: state.companies.map((c) => ({ name: c.name, enabled: c.enabled })),
      }),
    });
    const fresh = await api('/api/portals');
    state.portalsConfig = fresh.config;
    toast('Match rules saved');
  } catch (e) {
    toast(e.message);
  }
});

// ── Jobs preview ────────────────────────────────────────────────────

$('#btn-jobs-fetch').addEventListener('click', async () => {
  $('#job-stats').textContent = 'Loading…';
  $('#jobs-body').innerHTML = '';
  try {
    await prefetchCvForOverlap();
    const body = {
      respectDedup: $('#job-dedup').checked,
      recency: $('#job-recency').value || null,
      companyFilter: $('#job-company').value.trim() || null,
      allLocations: $('#job-allloc').checked,
      maxJobs: Number($('#job-max').value) || 400,
    };
    const data = await api('/api/jobs/preview', { method: 'POST', body: JSON.stringify(body) });
    state.lastJobs = data.jobs || [];
    const st = data.stats;
    $('#job-stats').textContent = `Scanned ${st.companiesScanned} companies · ${st.totalFound} raw listings · ${st.returned} rows shown · ${data.errors?.length || 0} fetch errors`;
    const tbody = $('#jobs-body');
    tbody.innerHTML = (data.jobs || [])
      .map((j, idx) => {
        const ov = overlapCount(state.cvText, j.title, j.company);
        const star = isStarred(j.url) ? deskIconStarFilled(17) : deskIconStarOutline(17);
        return `<tr data-ji="${idx}">
          <td class="td-muted">${escapeHtml(j.posted || '—')}</td>
          <td class="td-num"><button type="button" class="overlap-btn" data-ji="${idx}" title="Why this number?">${ov}</button></td>
          <td>${escapeHtml(j.company)}</td>
          <td>${escapeHtml(j.title)}</td>
          <td class="td-muted">${escapeHtml(j.location)}</td>
          <td class="td-actions td-job-actions">
            <button type="button" class="icon-action icon-action-svg" data-act="open" title="Open posting" aria-label="Open posting"><span class="icon-action-inner">${deskIcon('external-link', 17)}</span></button>
            <button type="button" class="icon-action icon-action-svg" data-act="star" title="Save in this browser" aria-label="Toggle shortlist"><span class="icon-action-inner">${star}</span></button>
            <button type="button" class="icon-action icon-action-ibx" data-act="queue" title="Add to inbox queue" aria-label="Add to inbox queue"><span class="icon-action-inner">${deskIcon('inbox', 16)}</span><span class="icon-action-lbl">Inbox</span></button>
          </td>
        </tr>`;
      })
      .join('');
    $('#jobs-empty').hidden = (data.jobs || []).length > 0;
    tbody.querySelectorAll('tr').forEach((tr) => {
      tr.addEventListener('click', (e) => {
        const ob = e.target.closest('.overlap-btn');
        if (ob) {
          e.stopPropagation();
          const ji = Number(ob.dataset.ji);
          const j = state.lastJobs[ji];
          if (j) openOverlapModal(j);
          return;
        }
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        e.stopPropagation();
        const ji = Number(tr.dataset.ji);
        const j = state.lastJobs[ji];
        if (!j) return;
        if (btn.dataset.act === 'open') window.open(j.url, '_blank', 'noopener');
        if (btn.dataset.act === 'star') {
          toggleShortlist(j);
          const inner = btn.querySelector('.icon-action-inner');
          if (inner) {
            inner.innerHTML = isStarred(j.url) ? deskIconStarFilled(17) : deskIconStarOutline(17);
          }
          updateShortlistCount();
        }
        if (btn.dataset.act === 'queue') {
          api('/api/pipeline/queue', {
            method: 'POST',
            body: JSON.stringify({
              url: j.url,
              company: j.company,
              title: j.title,
              location: j.location || '',
              postedAtMs: j.postedAtMs != null ? j.postedAtMs : null,
            }),
          })
            .then(() => {
              toast('Added to inbox queue');
              loadWorkspaceHints();
            })
            .catch((err) => toast(err.message));
        }
      });
    });
  } catch (e) {
    $('#job-stats').textContent = '';
    toast(e.message);
  }
});

function openOverlapModal(j) {
  const ex = overlapExplain(state.cvText, j.title, j.company);
  const body = $('#overlap-body');
  if (!body) return;
  const fmt = (arr) => (arr.length ? arr.map((w) => `<code>${escapeHtml(w)}</code>`).join(' ') : '—');
  body.innerHTML = `
    <p class="overlap-title"><strong>${escapeHtml(j.company)}</strong> — ${escapeHtml(j.title)}</p>
    <p class="overlap-note">${escapeHtml(ex.note)}</p>
    <h4 class="overlap-h4">Matched tokens</h4>
    <p>${fmt(ex.matched)}</p>
    <h4 class="overlap-h4">Generic / market terms</h4>
    <p>${fmt(ex.weakHits)}</p>
    <h4 class="overlap-h4">More specific overlaps</h4>
    <p>${fmt(ex.strongHits)}</p>`;
  $('#modal-overlap')?.showModal();
}

$('#close-overlap')?.addEventListener('click', () => $('#modal-overlap')?.close());
$('#btn-close-overlap')?.addEventListener('click', () => $('#modal-overlap')?.close());

async function openCompareModal() {
  const nums = [...state.comparePick].sort((a, b) => a - b);
  if (nums.length < 2 || nums.length > 3) return;
  try {
    const data = await api('/api/reports/compare', {
      method: 'POST',
      body: JSON.stringify({ nums }),
    });
    const thead = $('#compare-thead');
    const tbody = $('#compare-tbody');
    if (!thead || !tbody) return;
    const rows = data.rows || [];
    const heads = ['Field', ...rows.map((r) => `#${r.num} ${escapeHtml(r.company)}`)];
    thead.innerHTML = `<tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr>`;
    const fields = [
      { key: 'role', label: 'Role (ledger)' },
      { key: 'score', label: 'Score (ledger)' },
      { key: 'archetype', label: 'Archetype' },
      { key: 'seniority', label: 'Seniority' },
      { key: 'remote', label: 'Remote' },
      { key: 'location', label: 'Location' },
      { key: 'team', label: 'Team' },
      { key: 'comp', label: 'Comp (from report)' },
      { key: 'headerScore', label: 'Header score' },
      { key: 'url', label: 'Posting URL' },
    ];
    const sig = (r) => (r.signals && !r.signals.error ? r.signals : null);
    const cells = (r, fk) => {
      const s = sig(r);
      if (!s) return escapeHtml(r.signals?.error || '—');
      if (fk === 'role') return escapeHtml(r.role);
      if (fk === 'score') return escapeHtml(r.score);
      const v = s[fk];
      if (fk === 'url' && v) return `<a href="${escapeAttr(v)}" target="_blank" rel="noopener">Open</a>`;
      return escapeHtml(v != null ? String(v) : '—');
    };
    tbody.innerHTML = fields
      .map(
        (f) =>
          `<tr><th scope="row">${escapeHtml(f.label)}</th>${rows.map((r) => `<td>${cells(r, f.key)}</td>`).join('')}</tr>`
      )
      .join('');
    $('#modal-compare')?.showModal();
  } catch (e) {
    toast(e.message);
  }
}

$('#btn-compare-offers')?.addEventListener('click', () => openCompareModal());
$('#close-compare')?.addEventListener('click', () => $('#modal-compare')?.close());
$('#btn-close-compare')?.addEventListener('click', () => $('#modal-compare')?.close());

function fillCalibrationSelects() {
  const opts = state.applications
    .filter((a) => /\]\([^)]*reports\//i.test(a.report || ''))
    .map((a) => `<option value="${a.num}">#${a.num} — ${escapeHtml(a.company)} — ${escapeHtml(a.role)}</option>`)
    .join('');
  const sa = $('#cal-a');
  const sb = $('#cal-b');
  if (sa) sa.innerHTML = `<option value="">—</option>${opts}`;
  if (sb) sb.innerHTML = `<option value="">—</option>${opts}`;
}

$('#btn-score-lab')?.addEventListener('click', () => {
  fillCalibrationSelects();
  $('#cal-results').innerHTML = '';
  $('#modal-calibration')?.showModal();
});
$('#close-calibration')?.addEventListener('click', () => $('#modal-calibration')?.close());

$('#btn-cal-run')?.addEventListener('click', async () => {
  const a = parseInt($('#cal-a')?.value, 10);
  const b = parseInt($('#cal-b')?.value, 10);
  if (!a || !b || a === b) {
    toast('Pick two different applications with reports');
    return;
  }
  const mount = $('#cal-results');
  if (!mount) return;
  mount.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const data = await api('/api/reports/score-compare', { method: 'POST', body: JSON.stringify({ a, b }) });
    const L = data.left;
    const R = data.right;
    const dimRows = (data.dimensions || [])
      .map((d) => {
        const lv = d.left != null ? d.left : '—';
        const rv = d.right != null ? d.right : '—';
        const del = d.delta != null ? (d.delta > 0 ? `+${d.delta}` : String(d.delta)) : '—';
        return `<tr><th scope="row">${escapeHtml(d.label)}</th><td>${lv}</td><td>${rv}</td><td>${del}</td></tr>`;
      })
      .join('');
    mount.innerHTML = `
      <table class="apps-table cal-dim-table">
        <thead><tr><th>Dimension</th><th>#${L.num} ${escapeHtml(L.company)}</th><th>#${R.num} ${escapeHtml(R.company)}</th><th>Δ (B−A)</th></tr></thead>
        <tbody>${dimRows}</tbody>
      </table>
      <p class="muted cal-foot">Header scores: <strong>${L.headerScore ?? '—'}</strong> vs <strong>${R.headerScore ?? '—'}</strong> — re-run the same JD after a CV change to see what moved.</p>`;
  } catch (e) {
    mount.innerHTML = `<p class="run-err">${escapeHtml(e.message)}</p>`;
  }
});

// ── Runbook ───────────────────────────────────────────────────────

function renderRunField(cmdId, key, spec) {
  const fid = `run-${cmdId}-${key}`;
  const defVal = spec.default != null ? String(spec.default) : '';
  const valAttr = defVal && spec.type !== 'boolean' ? ` value="${escapeAttr(defVal)}"` : '';
  const checked = spec.type === 'boolean' && spec.default ? ' checked' : '';
  const depAttr = spec.dependsOn ? ` data-depends-on="${escapeAttr(spec.dependsOn)}"` : '';

  if (spec.type === 'boolean') {
    return `<label class="run-field run-check"${depAttr}><input type="checkbox" id="${fid}" data-run-field="${key}"${checked} /> <span>${escapeHtml(spec.label)}</span></label>`;
  }
  if (spec.type === 'number') {
    const ph = spec.placeholder ? ` placeholder="${escapeAttr(spec.placeholder)}"` : '';
    const opt = spec.optional ? ' data-run-optional="1"' : '';
    return `<label class="run-field run-field-inline"${depAttr}><span class="run-field-label">${escapeHtml(spec.label)}</span><input type="number" id="${fid}" data-run-field="${key}"${ph}${valAttr}${opt} class="run-input-sm" /></label>`;
  }
  if (spec.type === 'string') {
    const ph = spec.placeholder ? ` placeholder="${escapeAttr(spec.placeholder)}"` : '';
    const opt = spec.optional ? ' data-run-optional="1"' : '';
    return `<label class="run-field run-field-inline"${depAttr}><span class="run-field-label">${escapeHtml(spec.label)}</span><input type="text" id="${fid}" data-run-field="${key}"${ph}${valAttr}${opt} class="run-input" /></label>`;
  }
  if (spec.type === 'select' && spec.options) {
    const opts = spec.options
      .map((o) => `<option value="${escapeAttr(o.value)}">${escapeHtml(o.label)}</option>`)
      .join('');
    return `<label class="run-field run-field-inline"${depAttr}><span class="run-field-label">${escapeHtml(spec.label)}</span><select id="${fid}" data-run-field="${key}" class="run-select">${opts}</select></label>`;
  }
  return '';
}

function renderRunCard(cmd) {
  const fields = cmd.fields || {};
  const fieldKeys = Object.keys(fields);
  const fieldHtml = fieldKeys.map((k) => renderRunField(cmd.id, k, fields[k])).join('');
  const warn = cmd.destructive
    ? '<span class="run-destructive-badge">changes files</span>'
    : '';
  const icon = cmd.icon || '▸';
  return `<div class="card run-card" data-cmd-id="${escapeAttr(cmd.id)}">
    <div class="run-card-head">
      <span class="run-icon" aria-hidden="true">${icon}</span>
      <div class="run-card-head-text">
        <h3 class="run-card-title">${escapeHtml(cmd.label)}${warn}</h3>
        <p class="run-card-desc">${escapeHtml(cmd.description)}</p>
      </div>
    </div>
    ${fieldHtml ? `<div class="run-fields">${fieldHtml}</div>` : ''}
    <div class="run-card-foot">
      <button type="button" class="btn primary run-cmd-btn" data-run-cmd="${escapeAttr(cmd.id)}">Run</button>
      <span class="run-card-status" data-run-status="${escapeAttr(cmd.id)}"></span>
    </div>
  </div>`;
}

const GROUP_ORDER = ['Setup & Workspace', 'Find Jobs', 'Maintain Tracker', 'Insights', 'Generate', 'System'];
const GROUP_SUBTITLE = {
  'Setup & Workspace': 'Make sure everything is configured and consistent before you start.',
  'Find Jobs': 'Pull live openings from company career pages directly into your pipeline.',
  'Maintain Tracker': 'Keep your applications table clean — fix statuses, remove duplicates, merge batch results.',
  'Insights': 'Learn from your own data: what roles convert, what wastes time, who to follow up with.',
  'Generate': 'Produce polished outputs from your data.',
  'System': 'Keep career-ops itself up to date.',
};

function renderRunbook() {
  const mount = $('#runbook-mount');
  if (!mount) return;
  const cmds = state.runbookCommands;
  if (!cmds.length) {
    mount.innerHTML = '<p class="muted">Loading…</p>';
    return;
  }
  const groups = {};
  for (const c of cmds) {
    const g = c.group || 'Other';
    if (!groups[g]) groups[g] = [];
    groups[g].push(c);
  }
  const html = GROUP_ORDER
    .filter((g) => groups[g]?.length)
    .map(
      (g) => `<section class="runbook-group">
    <div class="runbook-group-head">
      <h3 class="runbook-group-title">${escapeHtml(g)}</h3>
      ${GROUP_SUBTITLE[g] ? `<p class="runbook-group-sub">${escapeHtml(GROUP_SUBTITLE[g])}</p>` : ''}
    </div>
    <div class="runbook-grid">${groups[g].map((c) => renderRunCard(c)).join('')}</div>
  </section>`
    )
    .join('');
  mount.innerHTML = html;

  wireRunbookDependsOn(mount);
}

function wireRunbookDependsOn(mount) {
  mount.querySelectorAll('[data-depends-on]').forEach((el) => {
    const dep = el.getAttribute('data-depends-on');
    const [field, value] = dep.split('=');
    const card = el.closest('.run-card');
    if (!card) return;
    const source = card.querySelector(`[data-run-field="${field}"]`);
    if (!source) return;
    const check = () => { el.hidden = source.value !== value; };
    source.addEventListener('change', check);
    check();
  });
}

function gatherRunPayload(card) {
  const id = card.getAttribute('data-cmd-id');
  const payload = { id };
  card.querySelectorAll('[data-run-field]').forEach((el) => {
    if (el.closest('[hidden]')) return;
    const key = el.getAttribute('data-run-field');
    if (!key) return;
    const optional = el.hasAttribute('data-run-optional');
    if (el.type === 'checkbox') {
      if (el.checked) payload[key] = true;
      return;
    }
    const v = el.value != null ? String(el.value).trim() : '';
    if (v === '' && optional) return;
    if (el.type === 'number') {
      if (v === '') return;
      payload[key] = Number(el.value);
    } else {
      payload[key] = el.value;
    }
  });
  if (id === 'scan') {
    const rec = card.querySelector('[data-run-field="recency"]');
    if (rec && rec.value !== 'since') delete payload.sinceDays;
    if (rec && !rec.value) delete payload.recency;
  }
  return payload;
}

function stripAnsi(s) {
  return String(s).replace(/\x1b\[[0-9;]*m/g, '');
}

function formatRunOutput(data) {
  const ok = data.exitCode === 0 && !data.timedOut;
  const raw = stripAnsi([data.stdout || '', data.stderr || ''].join('\n')).trim();
  if (!raw) return ok ? 'Done — no output.' : `Failed (exit ${data.exitCode}).`;
  return raw;
}

function setCardStatus(cmdId, text, ok) {
  const el = $(`[data-run-status="${cmdId}"]`);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('status-ok', ok === true);
  el.classList.toggle('status-err', ok === false);
}

async function loadRunbookView() {
  const mount = $('#runbook-mount');
  if (!mount) return;
  if (!state.runbookLoaded) {
    mount.innerHTML = '<p class="muted">Loading…</p>';
    try {
      const data = await api('/api/commands');
      state.runbookCommands = data.commands || [];
      state.runbookLoaded = true;
    } catch (e) {
      mount.innerHTML = `<p class="run-err">${escapeHtml(e.message)}</p>`;
      return;
    }
  }
  renderRunbook();
}

async function onRunbookClick(ev) {
  const btn = ev.target.closest('.run-cmd-btn');
  if (!btn) return;
  const card = btn.closest('.run-card');
  if (!card) return;
  const payload = gatherRunPayload(card);
  const cmdId = payload.id;
  const label = btn.textContent;

  btn.disabled = true;
  btn.textContent = 'Running…';
  setCardStatus(cmdId, '', null);

  const output = $('#run-output');
  if (output) {
    output.textContent = `Running ${cmdId}…`;
    output.classList.remove('output-ok', 'output-err');
  }

  try {
    const r = await fetch('/api/commands/run', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || r.statusText);

    const ok = data.exitCode === 0 && !data.timedOut;
    const formatted = formatRunOutput(data);

    if (output) {
      output.textContent = formatted;
      output.classList.toggle('output-ok', ok);
      output.classList.toggle('output-err', !ok);
      output.scrollTop = 0;
    }

    setCardStatus(cmdId, ok ? 'passed' : `exit ${data.exitCode}`, ok);
    toast(ok ? 'Done' : `Finished with exit ${data.exitCode}`);
  } catch (e) {
    if (output) {
      output.textContent = String(e.message || e);
      output.classList.add('output-err');
    }
    setCardStatus(cmdId, 'error', false);
    toast(String(e.message));
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

const btnRunClear = $('#btn-run-clear');
if (btnRunClear) {
  btnRunClear.addEventListener('click', () => {
    const pre = $('#run-output');
    if (pre) {
      pre.textContent = 'Pick an action and press Run.';
      pre.classList.remove('output-ok', 'output-err');
    }
  });
}

// ── Init ───────────────────────────────────────────────────────────

(async function init() {
  try {
    // If opened as a local file (file://), API calls will fail and the ledger will appear empty.
    if (window.location.protocol === 'file:') {
      toast('Open Desk from the server URL (http://127.0.0.1:3847) — not as a local file.');
      return;
    }

    // Surface runtime errors in the UI (helps diagnose “ledger empty” quickly).
    if (!window.__careerOpsErrWired) {
      window.__careerOpsErrWired = true;
      window.addEventListener('error', (ev) => {
        const msg = ev?.error?.message || ev?.message || 'Runtime error';
        toast(msg);
      });
      window.addEventListener('unhandledrejection', (ev) => {
        const msg = ev?.reason?.message || String(ev?.reason || 'Unhandled promise rejection');
        toast(msg);
      });
    }

    const boot = await fetch('/api/bootstrap', { credentials: 'same-origin' }).then((r) => r.json());
    if (boot.requireAuth) {
      const meProbe = await fetch('/api/me', { credentials: 'same-origin' }).then((r) => r.json());
      if (!meProbe.user) {
        const next = encodeURIComponent(`${window.location.pathname}${window.location.search}` || '/');
        window.location.replace(`/welcome?next=${next}`);
        return;
      }
    }

    await api('/api/health');
    wireLedgerChromeIcons({ deskIcon });

    const [st, cv0, appsData, profileRes, meRes, wsRes] = await Promise.all([
      api('/api/states'),
      api('/api/cv'),
      api('/api/applications'),
      api('/api/profile').catch(() => ({ profile: null })),
      api('/api/me').catch(() => ({ cloud: false, user: null })),
      api('/api/workspace').catch(() => ({ counts: {} })),
    ]);

    state.states = st.states || [];
    fillStatusSelects();
    updateShortlistCount();
    state.cvText = cv0.content || '';

    await loadCloudSession(meRes);
    await loadWorkspaceHints(wsRes);
    await loadTracker(appsData);
    await loadProfileFields(profileRes);

    const runMount = $('#runbook-mount');
    if (runMount && !runMount.dataset.wired) {
      runMount.dataset.wired = '1';
      runMount.addEventListener('click', onRunbookClick);
    }

    window.wireDeepView = wireDeepView;
    window.wireTrainingView = wireTrainingView;
    window.wireProjectView = wireProjectView;

  } catch (e) {
    toast(String(e.message));
  }
})();




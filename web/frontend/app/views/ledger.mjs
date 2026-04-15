import { $ } from '../core/dom.mjs';
import { api } from '../core/api.mjs';
import { escapeAttr, escapeHtml } from '../core/escape.mjs';
import { state } from '../state.mjs';

/** Set from `wireLedgerView` — used when code paths need a no-arg refresh (filters, dashboard bar). */
let refreshLedgerTableImpl = null;

function statusClass(st) {
  const s = String(st || '').toLowerCase();
  if (s.includes('evaluated')) return 'badge-evaluated';
  if (s.includes('applied')) return 'badge-applied';
  if (s.includes('interview')) return 'badge-interview';
  if (s.includes('offer')) return 'badge-offer';
  if (s.includes('reject')) return 'badge-rejected';
  if (s.includes('discard')) return 'badge-discarded';
  if (s.includes('skip')) return 'badge-skip';
  if (s.includes('respond')) return 'badge-responded';
  return 'badge-evaluated';
}

function parseScore(scoreRaw) {
  const m = String(scoreRaw || '').match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

export function reportHref(cell) {
  const m = String(cell || '').match(/\]\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].replace(/^\//, '');
  return `/${p}`;
}

function filteredApps() {
  let rows = [...(state.applications || [])];
  if (state.filter === 'top4') {
    rows = rows.filter((a) => parseScore(a.score) >= 4);
  } else if (state.filter !== 'all') {
    rows = rows.filter((a) => String(a.status || '').toLowerCase() === String(state.filter || '').toLowerCase());
  }
  const q = String(state.q || '').trim().toLowerCase();
  if (q) {
    rows = rows.filter((a) => {
      const blob = [a.company, a.role, a.notes, a.status].join(' ').toLowerCase();
      return blob.includes(q);
    });
  }
  const { key, dir } = state.sort;
  rows.sort((a, b) => {
    let va;
    let vb;
    if (key === 'score') {
      va = parseScore(a.score);
      vb = parseScore(b.score);
    } else {
      va = a[key];
      vb = b[key];
    }
    if (va == null) va = '';
    if (vb == null) vb = '';
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    let c = 0;
    if (va < vb) c = -1;
    else if (va > vb) c = 1;
    return dir === 'asc' ? c : -c;
  });
  return rows;
}

export function renderMetrics() {
  const el = $('#metrics');
  if (!el) return;
  const m = state.metrics;
  if (!m) {
    el.innerHTML = '';
    return;
  }
  const w = state.weather;
  let weatherRow = '';
  if (w) {
    const conv = w.conversion != null ? `${Math.round(w.conversion * 100)}%` : '—';
    const ghost = w.ghosting?.ghostPct != null ? `${w.ghosting.ghostPct}%` : '—';
    const med = w.ghosting?.medianDaysSinceApplyNoFollowup != null ? `${w.ghosting.medianDaysSinceApplyNoFollowup}d` : '—';
    weatherRow = `
    <div class="weather-strip" role="region" aria-label="Pipeline signals">
      <div class="weather-item"><span class="weather-label">7-day pace</span><strong>${escapeHtml(w.pace7d)}</strong><span class="weather-hint">rows dated in last 7d</span></div>
      <div class="weather-item"><span class="weather-label">Conversion</span><strong>${escapeHtml(conv)}</strong><span class="weather-hint">Applied ÷ Evaluated</span></div>
      <div class="weather-item"><span class="weather-label">Ghosting</span><strong>${escapeHtml(ghost)}</strong><span class="weather-hint">Applied with no follow-up logged</span></div>
      <div class="weather-item"><span class="weather-label">Median wait</span><strong>${escapeHtml(med)}</strong><span class="weather-hint">days since apply (no F/U)</span></div>
    </div>`;
  }
  el.innerHTML = `
    <div class="metric-row">
    <div class="metric-card"><strong>${escapeHtml(m.total)}</strong><span>Total</span></div>
    <div class="metric-card"><strong>${escapeHtml(m.actionable)}</strong><span>Active pipeline</span></div>
    <div class="metric-card"><strong>${escapeHtml(m.avgScore || '—')}</strong><span>Avg score</span></div>
    <div class="metric-card"><strong>${escapeHtml(m.topScore || '—')}</strong><span>Top score</span></div>
    <div class="metric-card"><strong>${escapeHtml(m.withPdf)}</strong><span>With PDF</span></div>
    </div>
    ${weatherRow}`;
}

/** Display order aligned with dashboard/internal/ui/screens/pipeline.go statusGroupOrder */
const LEDGER_STATUS_BAR_ORDER = [
  'Interview',
  'Offer',
  'Responded',
  'Applied',
  'Evaluated',
  'SKIP',
  'Rejected',
  'Discarded',
];

function ledgerSegModifierForStatus(label) {
  return statusClass(label).replace(/^badge-/, 'ledger-seg--');
}

export function renderLedgerDashboard() {
  const mount = $('#ledger-dashboard-body');
  if (!mount) return;
  const apps = state.applications || [];
  const m = state.metrics;
  const w = state.weather;
  if (!apps.length) {
    mount.innerHTML =
      '<p class="ledger-dash-empty muted">No ledger rows yet — add an application or run an evaluation to see the pipeline dashboard.</p>';
    return;
  }
  const by = m?.byStatus || {};
  const total = Math.max(1, m?.total || apps.length);
  let funnel = '';
  if (w) {
    const ev = w.evaluated ?? '—';
    const ap = w.applied ?? '—';
    const conv = w.conversion != null ? `${Math.round(w.conversion * 100)}%` : '—';
    funnel = `<p class="ledger-dash-funnel"><strong>Funnel:</strong> ${escapeHtml(ap)} applied · ${escapeHtml(ev)} evaluated · conversion (applied ÷ evaluated) <strong>${escapeHtml(conv)}</strong></p>`;
  }
  const segments = [];
  for (const label of LEDGER_STATUS_BAR_ORDER) {
    const n = by[label] ?? 0;
    if (n <= 0) continue;
    const mod = ledgerSegModifierForStatus(label);
    const active = state.filter === label ? ' ledger-seg--active' : '';
    const grow = Math.max(1, Math.round((n / total) * 100));
    segments.push(
      `<button type="button" class="ledger-seg ${mod}${active}" data-dash-filter="${escapeAttr(label)}" style="flex-grow:${grow}" title="Filter table: ${escapeAttr(label)}">${escapeHtml(label)} <strong>${escapeHtml(n)}</strong></button>`
    );
  }
  const bar = segments.length
    ? `<div class="ledger-status-bar" role="group" aria-label="Status counts — click to filter">${segments.join('')}</div>`
    : '';
  const top4Active = state.filter === 'top4' ? 'primary' : 'ghost';
  const allActive = state.filter === 'all' ? 'primary' : 'ghost';
  mount.innerHTML = `
    <div class="ledger-dash-head">
      <h3 class="ledger-dash-title">Pipeline dashboard</h3>
      <p class="ledger-dash-sub muted">Status mix and funnel — click the bar to filter.</p>
    </div>
    ${funnel}
    ${bar}
    <div class="ledger-dash-actions">
      <button type="button" class="btn ${allActive} btn-quiet-dash" data-dash-filter="all">All</button>
      <button type="button" class="btn ${top4Active} btn-quiet-dash" data-dash-filter="top4">Top ≥4</button>
    </div>`;
}

export function wireLedgerDashboardOnce() {
  const root = document.getElementById('ledger-dashboard');
  if (!root || root.dataset.dashWired === '1') return;
  root.dataset.dashWired = '1';
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-dash-filter]');
    if (!t) return;
    e.preventDefault();
    state.filter = t.getAttribute('data-dash-filter');
    renderFilters();
    refreshLedgerTableImpl?.();
    renderLedgerDashboard();
  });
}

export function renderFilters() {
  const el = $('#filters');
  if (!el) return;
  const filters = [{ id: 'all', label: 'All' }, { id: 'top4', label: 'Top ≥4' }, ...state.states.map((s) => ({ id: s, label: s }))];
  el.innerHTML = filters
    .map(({ id, label }) => {
      const active = state.filter === id ? 'active' : '';
      return `<button type="button" class="chip ${active}" data-filter="${String(id).replace(/"/g, '&quot;')}">${escapeHtml(label)}</button>`;
    })
    .join('');
  el.querySelectorAll('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filter = btn.getAttribute('data-filter');
      renderFilters();
      refreshLedgerTableImpl?.();
      renderLedgerDashboard();
    });
  });
}

export function renderTable({ deskIcon, wirePrepRowButtons, wireApplyRowButtons, wireOutreachRowButtons, openEdit, toast }) {
  const tbody = $('#apps-body');
  const empty = $('#empty-state');
  if (!tbody || !empty) return;
  const rows = filteredApps();

  const icon = (name, size) => (deskIcon ? deskIcon(name, size) : '');

  tbody.innerHTML = rows
    .map((a) => {
      const rep = a.report || '';
      const rh = reportHref(rep);
      const job = a.jobUrl
        ? `<a href="${escapeAttr(a.jobUrl)}" target="_blank" rel="noopener" class="ledger-link stop-row" title="Open posting" aria-label="Open posting"><span class="ledger-link-ic">${icon('external-link', 17)}</span></a>`
        : '<span class="td-placeholder">—</span>';
      const repCell = rh
        ? `<a href="${escapeAttr(rh)}" target="_blank" class="ledger-link stop-row" title="Open report" aria-label="Open report"><span class="ledger-link-ic">${icon('file-text', 17)}</span></a>`
        : escapeHtml(rep || '—');
      const pick = state.comparePick.has(a.num) ? 'checked' : '';
      return `<tr data-num="${a.num}">
        <td class="td-cb"><input type="checkbox" class="row-pick" data-num="${a.num}" ${pick} aria-label="Select for compare" /></td>
        <td>${escapeHtml(a.num)}</td>
        <td>${escapeHtml(a.date)}</td>
        <td>${escapeHtml(a.company)}</td>
        <td>${escapeHtml(a.role)}</td>
        <td class="score-cell">${escapeHtml(a.score)}</td>
        <td><span class="badge ${statusClass(a.status)}">${escapeHtml(a.status)}</span></td>
        <td>${escapeHtml(a.pdf)}</td>
        <td class="td-report">${repCell}</td>
        <td class="link-cell td-ledger-ico">${job}</td>
        <td class="td-prep desk-tools-cell">
          <button type="button" class="btn quiet prep-row-btn prep-row-btn-ic" data-num="${a.num}"><span class="ledger-link-ic" aria-hidden="true">${icon('book-open', 17)}</span><span>Prep</span></button>
          <button type="button" class="btn quiet apply-row-btn apply-row-btn-ic" data-num="${a.num}" title="Apply desk — form context"><span class="ledger-link-ic" aria-hidden="true">${icon('file-text', 17)}</span><span>Apply</span></button>
          <button type="button" class="btn quiet outreach-row-btn outreach-row-btn-ic" data-num="${a.num}" title="Outreach — LinkedIn (contacto)"><span class="ledger-link-ic" aria-hidden="true">${icon('link-2', 17)}</span><span>Outreach</span></button>
        </td>
      </tr>`;
    })
    .join('');

  empty.hidden = rows.length > 0;

  tbody.querySelectorAll('tr').forEach((tr) => {
    tr.addEventListener('click', (e) => {
      if (
        e.target.closest('a.stop-row') ||
        e.target.closest('.row-pick') ||
        e.target.closest('.prep-row-btn') ||
        e.target.closest('.apply-row-btn') ||
        e.target.closest('.outreach-row-btn')
      )
        return;
      openEdit(Number(tr.dataset.num));
    });
  });

  if (wirePrepRowButtons) wirePrepRowButtons(tbody);
  if (wireApplyRowButtons) wireApplyRowButtons(tbody);
  if (wireOutreachRowButtons) wireOutreachRowButtons(tbody);

  tbody.querySelectorAll('.row-pick').forEach((cb) => {
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      const n = Number(cb.dataset.num);
      if (cb.checked) {
        if (state.comparePick.size >= 3) {
          cb.checked = false;
          toast?.('Pick at most 3 rows to compare');
          return;
        }
        state.comparePick.add(n);
      } else state.comparePick.delete(n);
      updateCompareToolbar();
    });
  });
  updateCompareToolbar();
}

function updateCompareToolbar() {
  const n = state.comparePick.size;
  const btn = $('#btn-compare-offers');
  const hint = $('#compare-hint');
  if (btn) btn.disabled = n < 2 || n > 3;
  if (hint) hint.hidden = n === 0;
}

export async function loadTracker({
  prefetchedApplicationsPayload,
  fillStatusSelects,
  fillLedgerRowSelects,
  deskIcon,
  wirePrepRowButtons,
  wireApplyRowButtons,
  wireOutreachRowButtons,
  openEdit,
  toast,
} = {}) {
  const data =
    prefetchedApplicationsPayload != null ? prefetchedApplicationsPayload : await api('/api/applications');
  state.applications = data.applications;
  state.metrics = data.metrics;
  state.weather = data.weather || null;
  state.path = data.path || '';
  if (!state.states.length) {
    const st = await api('/api/states');
    state.states = st.states || [];
    fillStatusSelects?.();
  }
  renderMetrics();
  renderLedgerDashboard();
  renderFilters();
  renderTable({ deskIcon, wirePrepRowButtons, wireApplyRowButtons, wireOutreachRowButtons, openEdit, toast });
  fillLedgerRowSelects?.();
}

export function fillStatusSelects() {
  const opts = state.states.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  const f = $('#f-status');
  const a = $('#a-status');
  if (f) f.innerHTML = opts;
  if (a) a.innerHTML = opts;
}

export function openEdit(num, { togglePreApplyPanel }) {
  const a = (state.applications || []).find((x) => x.num === num);
  if (!a) return;
  state.editPrevStatus = a.status;
  $('#f-num').value = a.num;
  $('#f-date').value = a.date;
  $('#f-company').value = a.company;
  $('#f-role').value = a.role;
  $('#f-score').value = a.score;
  $('#f-status').value = a.status;
  $('#f-pdf').value = a.pdf;
  $('#f-report').value = a.report;
  $('#f-notes').value = a.notes;
  const why = $('#f-decision-why');
  if (why) why.value = '';
  const pac = $('#f-pa-custom');
  const pal = $('#f-pa-live');
  const palog = $('#f-pa-log');
  if (pac) pac.checked = false;
  if (pal) pal.checked = false;
  if (palog) palog.checked = false;
  togglePreApplyPanel?.();
  const wrap = $('#f-joburl-wrap');
  const ja = $('#f-joburl');
  if (a.jobUrl) {
    wrap.hidden = false;
    ja.href = a.jobUrl;
    ja.textContent = a.jobUrl;
  } else {
    wrap.hidden = true;
    ja.removeAttribute('href');
    ja.textContent = '';
  }
  const fromRep = $('#btn-edit-from-report');
  if (fromRep) {
    const hasReport = /\]\([^)]+\)/.test(String(a.report || ''));
    fromRep.disabled = !hasReport;
    fromRep.title = hasReport ? 'Pull A/B/C blocks from the linked report into prep' : 'Link a report on this row first';
  }
  $('#modal-edit').showModal();
}

export function togglePreApplyPanel() {
  const wrap = $('#preapply-wrap');
  const st = $('#f-status')?.value || '';
  if (wrap) wrap.hidden = st !== 'Applied';
}

export async function saveEdit(e, { toast }) {
  e.preventDefault();
  const num = Number($('#f-num').value);
  const newStatus = $('#f-status').value;
  const body = {
    date: $('#f-date').value,
    company: $('#f-company').value,
    role: $('#f-role').value,
    score: $('#f-score').value,
    status: newStatus,
    pdf: $('#f-pdf').value,
    report: $('#f-report').value,
    notes: $('#f-notes').value,
  };
  const note = ($('#f-decision-why') && $('#f-decision-why').value.trim()) || '';
  if (note) body.decisionNote = note;
  if (newStatus === 'Applied' && $('#f-pa-log')?.checked) {
    body.logPreApply = true;
    body.preApplyCustomized = !!$('#f-pa-custom')?.checked;
    body.preApplyVerified = !!$('#f-pa-live')?.checked;
  }
  const data = await api(`/api/applications/${num}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  state.applications = (state.applications || []).map((x) => (x.num === num ? { ...data.application } : x));
  state.metrics = data.metrics;
  if (data.weather) state.weather = data.weather;
  $('#modal-edit').close();
  toast?.('Saved');
  renderMetrics();
  renderLedgerDashboard();
  refreshLedgerTableImpl?.();
}

export async function saveAdd(e, { toast }) {
  e.preventDefault();
  const body = {
    date: $('#a-date').value || undefined,
    company: $('#a-company').value,
    role: $('#a-role').value,
    score: $('#a-score').value,
    status: $('#a-status').value,
    pdf: $('#a-pdf').value,
    report: $('#a-report').value,
    notes: $('#a-notes').value,
  };
  const data = await api('/api/applications', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  state.applications = [...(state.applications || []), data.application];
  state.metrics = data.metrics;
  $('#modal-add').close();
  toast?.('Application added');
  renderMetrics();
  renderLedgerDashboard();
  renderFilters();
  refreshLedgerTableImpl?.();
}

export function wireSort({ renderTable }) {
  document.querySelectorAll('#apps-table th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-sort');
      if (state.sort.key === key) {
        state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sort = { key, dir: key === 'date' ? 'desc' : 'asc' };
      }
      renderTable?.();
    });
  });
}

export function wireLedgerChromeIcons({ deskIcon }) {
  const add = $('#btn-add');
  if (add && !add.dataset.ic) {
    add.dataset.ic = '1';
    add.insertAdjacentHTML('afterbegin', `<span class="btn-inline-svg" aria-hidden="true">${deskIcon('plus', 18)}</span>`);
  }
  const ref = $('#btn-refresh');
  if (ref && !ref.dataset.ic) {
    ref.dataset.ic = '1';
    ref.innerHTML = `<span class="btn-inline-svg" aria-hidden="true">${deskIcon('refresh-cw', 18)}</span>`;
  }
}

export function wireLedgerView({
  deskIcon,
  toast,
  fillLedgerRowSelects,
  wirePrepRowButtons,
  wireApplyRowButtons,
  wireOutreachRowButtons,
} = {}) {
  // Wire buttons/forms once
  const root = document.getElementById('view-tracker');
  if (root && root.dataset.ledgerWired === '1') return;
  if (root) root.dataset.ledgerWired = '1';

  const openEditBound = (n) => openEdit(n, { togglePreApplyPanel });

  const renderTableBound = () =>
    renderTable({
      deskIcon,
      wirePrepRowButtons,
      wireApplyRowButtons,
      wireOutreachRowButtons,
      openEdit: openEditBound,
      toast,
    });

  refreshLedgerTableImpl = renderTableBound;

  wireLedgerDashboardOnce();
  wireSort({ renderTable: renderTableBound });

  $('#btn-refresh')?.addEventListener('click', () => {
    loadTracker({
      fillStatusSelects,
      fillLedgerRowSelects,
      deskIcon,
      wirePrepRowButtons,
      wireApplyRowButtons,
      wireOutreachRowButtons,
      openEdit: openEditBound,
      toast,
    }).catch((err) => toast?.(String(err.message)));
  });

  $('#btn-add')?.addEventListener('click', () => {
    const today = new Date().toISOString().slice(0, 10);
    $('#a-date').value = today;
    $('#a-company').value = '';
    $('#a-role').value = '';
    $('#a-score').value = '0.0/5';
    $('#a-status').value = state.states[0] || 'Evaluated';
    $('#a-pdf').value = '❌';
    $('#a-report').value = '';
    $('#a-notes').value = '';
    $('#modal-add')?.showModal();
  });

  $('#form-edit')?.addEventListener('submit', (e) => {
    saveEdit(e, { toast }).catch((err) => toast?.(err.message));
  });
  $('#form-add')?.addEventListener('submit', (e) => {
    saveAdd(e, { toast }).catch((err) => toast?.(err.message));
  });

  $('#close-edit, #cancel-edit')?.addEventListener('click', () => $('#modal-edit')?.close());
  $('#close-add, #cancel-add')?.addEventListener('click', () => $('#modal-add')?.close());
  $('#f-status')?.addEventListener('change', () => togglePreApplyPanel());

  $('#q')?.addEventListener('input', (e) => {
    state.q = e.target.value;
    renderTableBound();
  });

  return { renderTableBound, openEditBound };
}


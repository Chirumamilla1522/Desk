// Desk UI (minimal recovery build)
// Restores navigation + ledger loading.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => el.classList.remove('show'), 2400);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = data?.error || `${res.status} ${res.statusText}`;
    throw new Error(err);
  }
  return data;
}

function showView(view) {
  $$('.view').forEach((v) => (v.hidden = v.id !== `view-${view}`));
  $$('#main-nav .nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'tracker') void loadLedger();
}

function fmt(s) {
  return String(s ?? '').trim();
}

function esc(s) {
  return fmt(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function reportHref(cell) {
  const raw = fmt(cell);
  const m = raw.match(/\(([^)]+)\)/);
  return m ? m[1] : null;
}

function renderLedger(apps = []) {
  const body = $('#apps-body');
  const empty = $('#empty-state');
  if (!body) return;

  body.innerHTML = apps
    .map((a) => {
      const jobUrl = a.jobUrl || '';
      const rep = reportHref(a.report);
      const repText = fmt(a.report) || '—';
      const repLink = rep
        ? `<a class="linkish" href="${esc(rep)}" target="_blank" rel="noopener">${esc(repText)}</a>`
        : esc(repText);
      const openUrl = jobUrl ? `<a class="btn quiet" href="${esc(jobUrl)}" target="_blank" rel="noopener">Open</a>` : '—';

      return `
        <tr data-num="${esc(a.num)}">
          <td class="td-cb"><input type="checkbox" class="pick-cb" aria-label="Pick row" /></td>
          <td>${esc(a.num)}</td>
          <td>${esc(a.date)}</td>
          <td>${esc(a.company)}</td>
          <td>${esc(a.role)}</td>
          <td>${esc(a.score)}</td>
          <td>${esc(a.status)}</td>
          <td>${esc(a.pdf)}</td>
          <td>${repLink}</td>
          <td>${openUrl}</td>
          <td class="td-desk-tools">
            <button type="button" class="btn ghost js-nav" data-view="interview">Interview</button>
            <button type="button" class="btn ghost js-nav" data-view="apply">Apply</button>
            <button type="button" class="btn ghost js-nav" data-view="outreach">Outreach</button>
          </td>
        </tr>
      `;
    })
    .join('');

  if (empty) empty.hidden = apps.length > 0;
}

function renderMetrics(metrics) {
  const mount = $('#metrics');
  if (!mount || !metrics) return;
  mount.innerHTML = `
    <div class="metric"><span class="label">Total</span><span class="value">${esc(metrics.total)}</span></div>
    <div class="metric"><span class="label">Actionable</span><span class="value">${esc(metrics.actionable)}</span></div>
    <div class="metric"><span class="label">Avg score</span><span class="value">${esc(metrics.avgScore)}</span></div>
    <div class="metric"><span class="label">With PDF</span><span class="value">${esc(metrics.withPdf)}</span></div>
  `;
}

async function loadLedger() {
  try {
    const data = await api('/api/applications');
    renderLedger(data.applications || []);
    renderMetrics(data.metrics);
  } catch (e) {
    toast(`Ledger failed: ${e.message || e}`);
  }
}

function wireNav() {
  $$('#main-nav .nav-item').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });
}

function wireLedgerRowQuickNav() {
  const body = $('#apps-body');
  if (!body) return;
  body.addEventListener('click', (e) => {
    const btn = e.target.closest('.js-nav');
    if (!btn) return;
    e.preventDefault();
    showView(btn.dataset.view);
  });
}

function wireRefresh() {
  $('#btn-refresh')?.addEventListener('click', () => void loadLedger());
}

document.addEventListener('DOMContentLoaded', () => {
  wireNav();
  wireLedgerRowQuickNav();
  wireRefresh();
  showView('tracker');
});


export function explainApplyPackError(code) {
  const c = String(code || '');
  if (c === 'no_report' || c === 'no_link')
    return 'This row has no linked evaluation report — link a report cell first, or evaluate the job in career-ops.';
  if (c === 'missing_file') return 'Report file path is set but the file is missing on disk.';
  return 'Could not load report context.';
}

export async function loadApplyView({
  state,
  $,
  toast,
  loadTracker,
  fillLedgerRowSelects,
  wireApplyDeskView,
  loadApplyPack,
} = {}) {
  wireApplyDeskView?.();
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
  fillLedgerRowSelects?.();
  const pick = $('#apply-app-pick');
  if (pick && state.applyJumpNum != null) {
    pick.value = String(state.applyJumpNum);
    state.applyJumpNum = null;
  }
  if (state.applyAutoLoad && pick?.value) {
    state.applyAutoLoad = false;
    await loadApplyPack?.().catch((err) => toast(String(err.message || err)));
  }
}

export function renderApplyPackUi({ data, state, $, escapeAttr, escapeHtml, reportHref }) {
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
  const reportHref2 =
    (data.reportPath ? `/${String(data.reportPath).replace(/^\//, '')}` : '') || rowReportHref || '';
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
      hint.textContent =
        'This report includes block H (draft application answers). Open the details below or the full report while you fill the form.';
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
      [
        'Report',
        data.reportPath ? `<a href="${escapeAttr(`/${data.reportPath}`)}" target="_blank" rel="noopener">Open</a>` : '—',
      ],
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

export function buildApplyBundleText({ state, $ }) {
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

export async function loadApplyPack({ state, $, api, toast, renderApplyPackUi }) {
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

/** Delegate from #view-apply so clicks work reliably in embedded browsers. */
export function wireApplyDeskView({
  state,
  $,
  toast,
  reportHref,
  openEdit,
  togglePreApplyPanel,
  buildApplyBundleText,
  loadApplyPack,
} = {}) {
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
      if (!url) return void toast('Pick a ledger row with a posting URL');
      window.open(url, '_blank', 'noopener');
      return;
    }
    if (e.target.closest('#btn-apply-open-report')) {
      e.preventDefault();
      const rh = applySelectedReportHref();
      if (!rh) return void toast('Pick a ledger row with a linked report');
      window.open(rh, '_blank', 'noopener');
      return;
    }
    if (e.target.closest('#btn-apply-copy-ai')) {
      e.preventDefault();
      void (async () => {
        const t = buildApplyBundleText();
        if (!t.trim()) return void toast('Load context for the selected row first');
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
      if (!Number.isFinite(n) || n < 1) return void toast('Pick a ledger row');
      openEdit(n);
      const st = $('#f-status');
      if (st && [...st.options].some((o) => o.value === 'Applied')) st.value = 'Applied';
      togglePreApplyPanel();
      return;
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
      if (!url) return void toast('Paste a LinkedIn job URL or pick a row with a posting URL');
      window.open(url, '_blank', 'noopener');
      return;
    }
    if (e.target.closest('#btn-apply-copy-easy-bundle')) {
      e.preventDefault();
      void (async () => {
        const base = buildApplyBundleText();
        if (!base.trim()) return void toast('Pick a row and load context (recommended) before copying');
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

  syncApplyLinkButtons();
}


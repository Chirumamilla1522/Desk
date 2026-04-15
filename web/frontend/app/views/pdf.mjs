function findApp(state, num) {
  const n = Number(num);
  if (!Number.isFinite(n) || n < 1) return null;
  return (state.applications || []).find((x) => x.num === n) || null;
}

export async function refreshPdfLedgerContext({ state, $, escapeHtml, api, toast }) {
  const panel = document.getElementById('pdf-context-panel');
  if (!panel) return;

  const pick = document.getElementById('pdf-app-pick');
  const v = pick?.value ? Number(pick.value) : null;

  let cvWords = null;
  try {
    const d = await api('/api/cv');
    cvWords = typeof d.words === 'number' ? d.words : null;
  } catch {
    /* ignore */
  }

  if (!v) {
    const w = cvWords != null ? `${cvWords} words in cv.md` : 'Load CV via Manuscript';
    panel.innerHTML = `<dl>
      <dt>Resume source</dt><dd>Canonical <code>cv.md</code> — ${escapeHtml(w)}</dd>
      <dt>Role context</dt><dd class="muted">Select a ledger row to see an evaluated application — or use <strong>Job description → reference PDF</strong> for inbox queue roles.</dd>
    </dl>`;
    return;
  }

  const a = findApp(state, v);
  if (!a) {
    panel.innerHTML = `<p class="muted">Row not found — refresh the ledger.</p>`;
    return;
  }

  const job = a.jobUrl
    ? `<a href="${String(a.jobUrl).replace(/"/g, '&quot;')}" target="_blank" rel="noopener">${escapeHtml(a.jobUrl)}</a>`
    : '<span class="muted">—</span>';
  const pdfCell = a.pdf ? escapeHtml(String(a.pdf)) : '—';
  const rep = a.report && /\]\([^)]+\)/.test(String(a.report)) ? escapeHtml(String(a.report).slice(0, 120)) + (String(a.report).length > 120 ? '…' : '') : escapeHtml(String(a.report || '—'));

  const wLine = cvWords != null ? `${cvWords} words in cv.md` : 'cv.md';

  panel.innerHTML = `<dl>
    <dt>Company</dt><dd>${escapeHtml(a.company || '—')}</dd>
    <dt>Role</dt><dd>${escapeHtml(a.role || '—')}</dd>
    <dt>Resume</dt><dd>Manuscript: <code>cv.md</code> (${escapeHtml(wLine)}) — tracker PDF column: ${pdfCell}. Tailored HTML/PDF is usually created when you evaluate this row.</dd>
    <dt>Posting</dt><dd>${job}</dd>
    <dt>Report</dt><dd>${rep}</dd>
    <dt>Regenerate résumé PDF</dt><dd class="muted">Use <strong>Resume / CV — HTML → PDF</strong> with your evaluation output paths (e.g. <code>output/cv.html</code>). For a printable <em>JD</em> from the pipeline queue, use <strong>Job description → reference PDF</strong> and pick from inbox.</dd>
  </dl>`;
}

/** Sync inbox pipeline items to the JD reference dropdown (same data as the Inbox view). */
export function fillPdfInboxSelect(state, escapeHtml) {
  const sel = document.getElementById('pdf-inbox-pick');
  if (!sel) return;
  const items = Array.isArray(state.inboxItems) ? state.inboxItems : [];
  const prev = sel.value;
  const head = '<option value="">— Pick a queued role to pre-fill —</option>';
  const opts = items.map((it, idx) => {
    const label = `${it.company || '—'} — ${it.title || '—'}`;
    const bits = [it.posted || '', it.location || ''].filter(Boolean).join(' · ');
    const extra = bits ? ` · ${bits}` : '';
    return `<option value="${idx}">${escapeHtml(label)}${escapeHtml(extra)}</option>`;
  });
  sel.innerHTML = head + opts.join('');
  if (prev !== '' && items[parseInt(prev, 10)]) sel.value = prev;
}

export function wirePdfView({ api, toast, formatRunOutput, state, $, escapeHtml } = {}) {
  const root = document.getElementById('view-pdf');
  if (!root || root.dataset.pdfWired === '1') return;
  root.dataset.pdfWired = '1';

  const inEl = document.getElementById('pdf-input-html');
  const outEl = document.getElementById('pdf-output-pdf');
  const fmtEl = document.getElementById('pdf-format');
  const btn = document.getElementById('btn-pdf-run');
  const btnOpen = document.getElementById('btn-pdf-open');
  const pre = document.getElementById('pdf-output');
  const pick = document.getElementById('pdf-app-pick');
  const inboxPick = document.getElementById('pdf-inbox-pick');
  const btnInboxOpen = document.getElementById('btn-pdf-inbox-open');
  const btnStd = document.getElementById('btn-pdf-use-standard-paths');

  const extCompany = document.getElementById('pdf-ext-company');
  const extRole = document.getElementById('pdf-ext-role');
  const extUrl = document.getElementById('pdf-ext-url');
  const extBody = document.getElementById('pdf-ext-body');
  const btnExt = document.getElementById('btn-pdf-ext-build');
  const btnExtOpen = document.getElementById('btn-pdf-ext-open');
  const extOut = document.getElementById('pdf-ext-output');
  const extPath = document.getElementById('pdf-ext-path');

  const openPdf = (rel) => {
    const p = String(rel || outEl?.value || '').trim().replace(/^\//, '');
    if (!p) return;
    window.open(`/${p}`, '_blank', 'noopener');
  };

  const openExtPdf = () => {
    window.open('/output/jd-external-latest.pdf', '_blank', 'noopener');
  };

  btnOpen?.addEventListener('click', (e) => {
    e.preventDefault();
    openPdf();
  });

  btnStd?.addEventListener('click', () => {
    if (inEl) inEl.value = 'output/cv.html';
    if (outEl) outEl.value = 'output/cv.pdf';
    toast('Paths set to output/cv.html → output/cv.pdf');
  });

  pick?.addEventListener('change', () => {
    void refreshPdfLedgerContext({ state, $, escapeHtml, api, toast });
  });

  const applyInboxSelection = () => {
    const idx = inboxPick?.value;
    if (idx === '' || idx == null) {
      if (btnInboxOpen) {
        btnInboxOpen.disabled = true;
        btnInboxOpen.dataset.url = '';
      }
      return;
    }
    const it = state.inboxItems?.[parseInt(idx, 10)];
    if (!it) {
      if (btnInboxOpen) btnInboxOpen.disabled = true;
      return;
    }
    if (extCompany) extCompany.value = it.company || '';
    if (extRole) extRole.value = it.title || '';
    if (extUrl) extUrl.value = it.url || '';
    if (extBody) {
      extBody.placeholder =
        'Paste the full job description from this posting (inbox only stores the link). Use “Open posting” if you need to copy the page.';
    }
    if (btnInboxOpen && it.url) {
      btnInboxOpen.disabled = false;
      btnInboxOpen.dataset.url = it.url;
    } else if (btnInboxOpen) {
      btnInboxOpen.disabled = true;
      btnInboxOpen.dataset.url = '';
    }
  };

  inboxPick?.addEventListener('change', applyInboxSelection);

  btnInboxOpen?.addEventListener('click', (e) => {
    e.preventDefault();
    const u = btnInboxOpen.dataset.url || extUrl?.value;
    if (u) window.open(u, '_blank', 'noopener');
    else toast('No posting URL');
  });

  btn?.addEventListener('click', async () => {
    const inputHtml = String(inEl?.value || '').trim();
    const outputPdf = String(outEl?.value || '').trim();
    const format = fmtEl?.value === 'letter' ? 'letter' : 'a4';
    if (!inputHtml || !outputPdf) {
      toast('Input and output paths required');
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Generating…';
    }
    if (pre) pre.textContent = 'Running generate-pdf…';
    if (btnOpen) btnOpen.disabled = true;
    try {
      const data = await api('/api/commands/run', {
        method: 'POST',
        body: JSON.stringify({ id: 'generate-pdf', inputHtml, outputPdf, format }),
      });
      const ok = data.exitCode === 0 && !data.timedOut;
      const txt = formatRunOutput(data);
      if (pre) pre.textContent = txt;
      if (btnOpen) btnOpen.disabled = !ok;
      toast(ok ? 'PDF generated' : `PDF failed (exit ${data.exitCode})`);
    } catch (e) {
      if (pre) pre.textContent = String(e.message || e);
      toast(String(e.message || e));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Generate PDF';
      }
    }
  });

  btnExt?.addEventListener('click', async () => {
    const body = String(extBody?.value || '').trim();
    const company = String(extCompany?.value || '').trim();
    const role = String(extRole?.value || '').trim();
    const url = String(extUrl?.value || '').trim();
    const format = fmtEl?.value === 'letter' ? 'letter' : 'a4';
    if (!body) {
      toast('Paste the job description text first');
      return;
    }
    if (btnExt) {
      btnExt.disabled = true;
      btnExt.textContent = 'Building…';
    }
    if (btnExtOpen) btnExtOpen.disabled = true;
    if (extOut) extOut.textContent = 'Saving and running generate-pdf…';
    if (extPath) extPath.hidden = true;
    try {
      const data = await api('/api/desk/jd-reference-pdf', {
        method: 'POST',
        body: JSON.stringify({ company, role, url, body, format }),
      });
      const ok = data.ok;
      if (extOut) {
        extOut.textContent = [data.display || '', data.stdout || '', data.stderr || ''].filter(Boolean).join('\n').trim() || (ok ? 'OK' : 'Failed');
      }
      if (extPath) {
        extPath.hidden = false;
        extPath.innerHTML = `Saved: <code>${escapeHtml(data.markdownPath || '')}</code> → PDF: <code>${escapeHtml(data.pdfPath || '')}</code>`;
      }
      if (btnExtOpen) btnExtOpen.disabled = !ok;
      toast(ok ? 'JD reference PDF ready' : `JD PDF failed (exit ${data.exitCode})`);
    } catch (e) {
      if (extOut) extOut.textContent = String(e.message || e);
      toast(String(e.message || e));
    } finally {
      if (btnExt) {
        btnExt.disabled = false;
        btnExt.textContent = 'Save JD + build reference PDF';
      }
    }
  });

  btnExtOpen?.addEventListener('click', (e) => {
    e.preventDefault();
    openExtPdf();
  });
}

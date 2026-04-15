export function pipelineBundleForItem(it) {
  const url = it.url || '';
  const company = it.company || 'Company';
  const title = it.title || 'Role';
  const posted = it.posted || '';
  const location = it.location || '';
  return [
    '# Career-Ops — pipeline item bundle',
    '',
    `URL: ${url}`,
    `Company: ${company}`,
    `Role: ${title}`,
    posted ? `Posted: ${posted}` : '',
    location ? `Location: ${location}` : '',
    '',
    'Instructions: Run the full auto-pipeline on this URL: extract JD (Playwright if available), evaluate A–G, write report, generate PDF only if score is high enough, and add tracker TSV (never edit tracker directly for new rows).',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function refreshPipelineProcessor({ api, escapeAttr, escapeHtml } = {}) {
  const mount = document.getElementById('pipeline-mount');
  const errEl = document.getElementById('pipeline-error');
  const btnAll = document.getElementById('btn-pipeline-copy-all');
  if (errEl) {
    errEl.hidden = true;
    errEl.textContent = '';
  }
  if (mount) mount.innerHTML = '<p class="muted">Loading pipeline…</p>';
  const data = await api('/api/pipeline');
  const items = Array.isArray(data.items) ? data.items : [];
  if (btnAll) btnAll.disabled = items.length === 0;
  if (!mount) return;
  if (!items.length) {
    mount.innerHTML = '<p class="muted">No pending items in <code>data/pipeline.md</code>.</p>';
    return;
  }
  mount.innerHTML = items
    .map((it, idx) => {
      const meta = [it.listedLabel || it.posted || '', it.portal || '', it.location || ''].filter(Boolean).join(' · ');
      const label = `${it.company || it.scanCompany || 'Company'} — ${it.title || it.scanTitle || 'Role'}`;
      const url = it.url || '';
      return `<div class="pipeline-item" data-pi="${idx}">
        <div class="pipeline-item-head">
          <span class="pipeline-item-title">${escapeHtml(label)}</span>
          <span class="pipeline-item-meta">${escapeHtml(meta)}</span>
        </div>
        <div class="pipeline-item-meta">${escapeHtml(url)}</div>
        <div class="pipeline-item-actions">
          <button type="button" class="btn quiet" data-pipe-act="open" data-url="${escapeAttr(url)}">Open</button>
          <button type="button" class="btn ghost" data-pipe-act="copy" data-pi="${idx}">Copy bundle</button>
        </div>
      </div>`;
    })
    .join('');
  mount.dataset.pipeItems = JSON.stringify(items);
}

export function wirePipelineProcessorView({ api, toast, escapeAttr, escapeHtml } = {}) {
  const root = document.getElementById('view-pipeline');
  if (!root || root.dataset.pipeWired === '1') return;
  root.dataset.pipeWired = '1';

  const btnRef = document.getElementById('btn-pipeline-refresh');
  const btnAll = document.getElementById('btn-pipeline-copy-all');
  const mount = document.getElementById('pipeline-mount');
  const errEl = document.getElementById('pipeline-error');

  btnRef?.addEventListener('click', () => {
    void refreshPipelineProcessor({ api, escapeAttr, escapeHtml }).catch((e) => {
      if (errEl) {
        errEl.textContent = String(e.message || e);
        errEl.hidden = false;
      }
      toast(String(e.message || e));
    });
  });

  btnAll?.addEventListener('click', async () => {
    try {
      const items = JSON.parse(mount?.dataset.pipeItems || '[]');
      const txt = items.map(pipelineBundleForItem).join('\n\n---\n\n');
      if (!txt.trim()) return;
      await navigator.clipboard.writeText(txt);
      toast('Copied all bundles');
    } catch {
      toast('Clipboard blocked — copy items one by one');
    }
  });

  mount?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-pipe-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-pipe-act');
    if (act === 'open') {
      const url = btn.getAttribute('data-url');
      if (url) window.open(url, '_blank', 'noopener');
      return;
    }
    if (act === 'copy') {
      const idx = parseInt(btn.getAttribute('data-pi') || '', 10);
      const items = JSON.parse(mount?.dataset.pipeItems || '[]');
      const it = items[idx];
      const txt = pipelineBundleForItem(it || {});
      try {
        await navigator.clipboard.writeText(txt);
        toast('Copied bundle');
      } catch {
        toast('Clipboard blocked — copy from the page');
      }
    }
  });
}


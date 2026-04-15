export function wirePatternsView({ api, toast, stripAnsi, escapeHtml } = {}) {
  const root = document.getElementById('view-patterns');
  if (!root || root.dataset.patternsWired === '1') return;
  root.dataset.patternsWired = '1';

  const mount = document.getElementById('patterns-mount');
  const errEl = document.getElementById('patterns-error');
  const btn = document.getElementById('btn-patterns-run');
  const btnCopy = document.getElementById('btn-patterns-copy');
  const minEl = document.getElementById('patterns-min-threshold');

  const parseJsonSafe = (txt) => {
    const t = String(txt || '').trim();
    if (!t) return null;
    try {
      return JSON.parse(t);
    } catch {
      const a = t.indexOf('{');
      const b = t.lastIndexOf('}');
      if (a >= 0 && b > a) {
        try {
          return JSON.parse(t.slice(a, b + 1));
        } catch {
          return null;
        }
      }
      return null;
    }
  };

  const render = (json) => {
    if (!mount) return;
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = '';
    }
    if (!json) {
      mount.innerHTML = '<p class="muted">No output.</p>';
      return;
    }
    if (json.error) {
      mount.innerHTML = `<div class="p-card"><h4>Not ready yet</h4><p>${escapeHtml(json.error)}</p></div>`;
      if (btnCopy) btnCopy.disabled = true;
      root.dataset.patternsLast = '';
      return;
    }

    const meta = json.metadata || {};
    const funnel = json.funnel || {};
    const threshold = json.scoreThreshold || {};
    const blockers = Array.isArray(json.blockerAnalysis) ? json.blockerAnalysis : [];
    const recs = Array.isArray(json.recommendations) ? json.recommendations : [];

    const cards = [];
    cards.push(`<div class="p-card"><h4>Summary</h4>
      <dl class="p-kv">
        <dt>Analyzed</dt><dd>${escapeHtml(String(meta.total || '—'))}</dd>
        <dt>Date range</dt><dd>${escapeHtml(`${meta.from || '—'} → ${meta.to || '—'}`)}</dd>
        <dt>Outcomes</dt><dd>${escapeHtml(`${meta.positive || 0} positive · ${meta.negative || 0} negative · ${meta.self_filtered || 0} self · ${meta.pending || 0} pending`)}</dd>
      </dl></div>`);

    const funnelRows = Object.entries(funnel)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ');
    cards.push(`<div class="p-card"><h4>Funnel</h4><p>${escapeHtml(funnelRows || '—')}</p></div>`);

    cards.push(`<div class="p-card"><h4>Recommended score floor</h4>
      <p><strong>${escapeHtml(threshold.recommended ?? '—')}</strong> ${escapeHtml(threshold.reasoning || '')}</p>
    </div>`);

    if (blockers.length) {
      const top = blockers
        .slice(0, 6)
        .map((b) => `${b.type || b.blocker || 'blocker'} (${b.count ?? '—'})`)
        .join(' · ');
      cards.push(`<div class="p-card"><h4>Top blockers</h4><p>${escapeHtml(top)}</p></div>`);
    }

    if (recs.length) {
      const top = recs
        .slice(0, 5)
        .map(
          (r, i) =>
            `<p><strong>${i + 1}.</strong> ${escapeHtml(r.action || r.title || 'Recommendation')} <span class="muted">${escapeHtml(r.impact || '')}</span></p>`
        )
        .join('');
      cards.push(`<div class="p-card"><h4>Recommendations</h4>${top}</div>`);
    }

    mount.innerHTML = cards.join('');

    const summaryText = [
      `Pattern analysis — ${meta.total || '—'} apps (${meta.from || '—'} → ${meta.to || '—'})`,
      `Outcomes: ${meta.positive || 0} positive · ${meta.negative || 0} negative · ${meta.self_filtered || 0} self · ${meta.pending || 0} pending`,
      `Score floor: ${threshold.recommended ?? '—'}${threshold.reasoning ? ` — ${threshold.reasoning}` : ''}`,
      blockers.length
        ? `Top blockers: ${blockers
            .slice(0, 4)
            .map((b) => `${b.type || b.blocker}(${b.count})`)
            .join(', ')}`
        : '',
      recs.length ? `Top rec: ${recs[0].action || recs[0].title || ''}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    root.dataset.patternsLast = summaryText;
    if (btnCopy) btnCopy.disabled = !summaryText.trim();
  };

  const run = async () => {
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Running…';
    }
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = '';
    }
    if (mount) mount.innerHTML = '<div class="p-card"><p>Running analysis…</p></div>';
    try {
      const minThreshold = minEl?.value ? Number(minEl.value) : undefined;
      const data = await api('/api/commands/run', {
        method: 'POST',
        body: JSON.stringify({
          id: 'analyze-patterns',
          summary: false,
          minThreshold: Number.isFinite(minThreshold) ? minThreshold : undefined,
        }),
      });
      const raw = stripAnsi([data.stdout || '', data.stderr || ''].join('\n')).trim();
      const json = parseJsonSafe(raw);
      if (!json) {
        if (mount)
          mount.innerHTML = `<div class="p-card"><h4>Raw output</h4><pre class="pdf-output">${escapeHtml(raw || '')}</pre></div>`;
        if (btnCopy) btnCopy.disabled = true;
        root.dataset.patternsLast = '';
      } else render(json);
      toast('Patterns updated');
    } catch (e) {
      if (errEl) {
        errEl.textContent = String(e.message || e);
        errEl.hidden = false;
      }
      if (mount) mount.innerHTML = '';
      toast(String(e.message || e));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Run analysis';
      }
    }
  };

  btn?.addEventListener('click', () => void run());
  btnCopy?.addEventListener('click', async () => {
    const t = root.dataset.patternsLast || '';
    if (!t.trim()) return;
    try {
      await navigator.clipboard.writeText(t);
      toast('Copied summary');
    } catch {
      toast('Clipboard blocked — copy from the page');
    }
  });
}


export function wireFollowupView({ api, toast, stripAnsi, escapeHtml } = {}) {
  const root = document.getElementById('view-followup');
  if (!root || root.dataset.followupWired === '1') return;
  root.dataset.followupWired = '1';

  const mount = document.getElementById('followup-mount');
  const errEl = document.getElementById('followup-error');
  const btn = document.getElementById('btn-followup-run');
  const cb = document.getElementById('followup-overdue-only');

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

  const urgencyBadge = (u) => {
    const v = String(u || '');
    const cls =
      v === 'urgent'
        ? 'fu-badge fu-urgent'
        : v === 'overdue'
          ? 'fu-badge fu-overdue'
          : v === 'cold'
            ? 'fu-badge fu-cold'
            : 'fu-badge fu-waiting';
    return `<span class="${cls}">${escapeHtml(v.toUpperCase())}</span>`;
  };

  const render = (json) => {
    if (!mount) return;
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = '';
    }
    if (!json || json.error) {
      mount.innerHTML = `<p class="muted">${escapeHtml(json?.error || 'No data.')}</p>`;
      return;
    }
    const meta = json.metadata || {};
    const entries = Array.isArray(json.entries) ? json.entries : [];
    const head = `
      <div class="fu-head">
        <h3 class="fu-title">Cadence dashboard</h3>
        <p class="fu-meta">${escapeHtml(meta.date || '')} · ${escapeHtml(String(meta.actionable ?? entries.length))} actionable</p>
      </div>`;
    const rows = entries
      .map((e) => {
        const contact =
          Array.isArray(e.contacts) && e.contacts.length
            ? e.contacts[0].email || e.contacts[0].name || '—'
            : '—';
        const next = e.nextFollowupDate || '—';
        return `<tr>
          <td>#${escapeHtml(String(e.num))}</td>
          <td>${escapeHtml(e.company || '')}</td>
          <td>${escapeHtml(e.role || '')}</td>
          <td>${escapeHtml(e.status || '')}</td>
          <td>${escapeHtml(String(e.daysSinceApplication ?? '—'))}</td>
          <td>${escapeHtml(String(e.followupCount ?? 0))}</td>
          <td>${escapeHtml(next)}</td>
          <td>${urgencyBadge(e.urgency)}</td>
          <td>${escapeHtml(contact)}</td>
        </tr>`;
      })
      .join('');
    mount.innerHTML = `${head}
      <table class="fu-table">
        <thead>
          <tr>
            <th>#</th><th>Company</th><th>Role</th><th>Status</th><th>Days</th><th>F/U</th><th>Next</th><th>Urgency</th><th>Contact</th>
          </tr>
        </thead>
        <tbody>${rows || ''}</tbody>
      </table>`;
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
    if (mount) mount.innerHTML = '<p class="muted">Running follow-up cadence…</p>';
    try {
      const data = await api('/api/commands/run', {
        method: 'POST',
        body: JSON.stringify({
          id: 'followup',
          summary: false,
          overdueOnly: !!cb?.checked,
        }),
      });
      const raw = stripAnsi([data.stdout || '', data.stderr || ''].join('\n')).trim();
      const json = parseJsonSafe(raw);
      if (!json) {
        if (mount)
          mount.innerHTML = `<p class="muted">Could not parse JSON output. Showing raw output.</p><pre class="pdf-output">${escapeHtml(raw || '')}</pre>`;
      } else {
        render(json);
      }
      toast('Cadence updated');
    } catch (e) {
      if (errEl) {
        errEl.textContent = String(e.message || e);
        errEl.hidden = false;
      }
      if (mount) mount.innerHTML = '<p class="muted">—</p>';
      toast(String(e.message || e));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Run cadence';
      }
    }
  };

  btn?.addEventListener('click', () => void run());
}


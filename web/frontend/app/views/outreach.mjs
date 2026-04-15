export function explainOutreachPackError(code) {
  const c = String(code || '');
  if (c === 'no_report' || c === 'no_link')
    return 'This row has no linked evaluation report — link a report cell first, or evaluate the job in career-ops.';
  if (c === 'missing_file') return 'Report file path is set but the file is missing on disk.';
  return 'Could not load outreach context.';
}

export function contactoTypeLabel(v) {
  if (v === 'recruiter') return 'Recruiter';
  if (v === 'hiring_manager') return 'Hiring manager';
  if (v === 'peer') return 'Peer';
  if (v === 'interviewer') return 'Interviewer';
  return 'Recruiter';
}

export function buildOutreachDraft(pack, type) {
  const headline = pack?.profile?.narrative?.headline || '';
  const company = pack?.application?.company || pack?.signals?.company || 'the team';
  const role = pack?.application?.role || pack?.signals?.roleTitle || 'this role';
  const pp = headline ? headline.replace(/\s+/g, ' ').trim() : '';
  const proof = pp ? `— ${pp}` : '';

  if (type === 'recruiter') {
    return `Hi — I’m applying for ${role} at ${company}. ${proof} If this aligns with what you’re hiring for, happy to share my CV.`.trim();
  }
  if (type === 'hiring_manager') {
    return `Hi — I’m applying for ${role} at ${company}. I’ve shipped production AI systems at scale${pp ? ` (${pp})` : ''}. Would love to hear what success looks like in the first 90 days.`.trim();
  }
  if (type === 'peer') {
    return `Hi — I’m exploring ${company} (${role}). I work on production LLM/RAG + eval systems${pp ? ` (${pp})` : ''}. Would love your take on what matters most on the team.`.trim();
  }
  return `Hi — looking forward to our conversation about ${role} at ${company}. I’ve been preparing around production LLM systems and evaluation${pp ? ` (${pp})` : ''}. See you soon.`.trim();
}

export async function loadOutreachView({
  state,
  $,
  toast,
  loadTracker,
  fillLedgerRowSelects,
  wireOutreachDeskView,
  loadOutreachPack,
} = {}) {
  await wireOutreachDeskView?.();
  const errEl = $('#outreach-load-error');
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
  const pick = $('#outreach-app-pick');
  if (pick && state.outreachJumpNum != null) {
    pick.value = String(state.outreachJumpNum);
    state.outreachJumpNum = null;
  }
  if (state.outreachAutoLoad && pick?.value) {
    state.outreachAutoLoad = false;
    await loadOutreachPack?.().catch((err) => toast(String(err.message || err)));
  }
}

export function renderOutreachPackUi({ data, state, $, escapeHtml }) {
  const hint = $('#outreach-pack-hint');
  const btnPost = $('#btn-outreach-open-posting');
  const btnRep = $('#btn-outreach-open-report');
  const type = $('#outreach-type')?.value || 'recruiter';
  const draft = $('#outreach-draft');
  const jobUrl = data.application?.jobUrl || data.signals?.url || '';
  if (btnPost) btnPost.classList.toggle('outreach-link-inactive', !jobUrl);
  if (btnRep) btnRep.classList.toggle('outreach-link-inactive', !data.reportPath);

  if (data.packError) {
    if (hint) {
      hint.textContent = explainOutreachPackError(data.packError);
      hint.hidden = false;
    }
    state.outreachPack = data;
    if (draft) draft.value = '';
    return;
  }

  if (hint) {
    hint.textContent = `Loaded context for ${data.application.company} — ${data.application.role}. Contact type: ${contactoTypeLabel(
      type
    )}. Edit to stay under 300 characters.`;
    hint.hidden = false;
  }
  if (draft) draft.value = buildOutreachDraft(data, type).slice(0, 600);
  state.outreachPack = data;
}

export function buildOutreachBundleText({ state, $ }) {
  const data = state.outreachPack;
  const pick = parseInt($('#outreach-app-pick')?.value || '', 10);
  const rowNum = Number(data?.application?.num);
  if (!data?.application || !Number.isFinite(pick) || rowNum !== pick) return '';

  const type = $('#outreach-type')?.value || 'recruiter';
  const tgtName = ($('#outreach-target-name')?.value || '').trim();
  const tgtTitle = ($('#outreach-target-title')?.value || '').trim();
  const tgtUrl = ($('#outreach-target-url')?.value || '').trim();
  const draft = ($('#outreach-draft')?.value || '').trim();

  const app = data.application;
  const jobUrl = app.jobUrl || data.signals?.url || '';
  const prof = data.profile || {};

  const lines = [
    '# Career-Ops — LinkedIn outreach context (contacto)',
    '',
    `Ledger: #${app.num} | ${app.company} | ${app.role}`,
    `Posting: ${jobUrl || '—'}`,
    `Report file: ${data.reportPath || '—'}`,
    '',
    '## Contact type',
    `- Type: ${contactoTypeLabel(type)}`,
    `- Target name: ${tgtName || '—'}`,
    `- Target title: ${tgtTitle || '—'}`,
    `- Target LinkedIn: ${tgtUrl || '—'}`,
    '',
    '## Candidate (from profile.yml)',
    `- Name: ${prof?.candidate?.full_name || '—'}`,
    `- Location: ${prof?.candidate?.location || '—'}`,
    `- LinkedIn: ${prof?.candidate?.linkedin || '—'}`,
    `- Headline: ${prof?.narrative?.headline || '—'}`,
    '',
  ];

  if (data.packError) {
    lines.push('## Report load', explainOutreachPackError(data.packError), '');
  } else {
    const sec = data.sections || {};
    const add = (label, body) => {
      if (body && String(body).trim()) lines.push(`## ${label}`, '', String(body).trim(), '');
    };
    add('F — Interview angles / STAR', sec.F);
    add('B — CV match', sec.B);
    add('H — Draft application answers (if present)', sec.H);
  }

  lines.push('## Draft message (current)', '', draft || '(empty)', '', '---', '');
  lines.push(
    'Rules (from contacto): 3 sentences; connection request ≤300 chars; no corporate-speak; no “passionate”; never share phone; do not ask for a job directly (especially peers). Output copy-paste text only.'
  );
  return lines.join('\n');
}

export async function loadOutreachPack({ state, $, api, toast, renderOutreachPackUi }) {
  const n = parseInt($('#outreach-app-pick')?.value || '', 10);
  const errEl = $('#outreach-load-error');
  if (!Number.isFinite(n) || n < 1) {
    toast('Pick a ledger row');
    return;
  }
  if (errEl) {
    errEl.hidden = true;
    errEl.textContent = '';
  }
  const btn = $('#btn-outreach-load');
  const prev = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Loading…';
  }
  try {
    const data = await api(`/api/applications/${n}/outreach-pack`);
    renderOutreachPackUi(data);
    toast('Outreach context loaded');
  } catch (e) {
    state.outreachPack = null;
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

/** Outreach view delegates from #view-outreach for reliable clicks. */
export function wireOutreachDeskView({
  state,
  $,
  toast,
  renderOutreachPackUi,
  buildOutreachBundleText,
  loadOutreachPack,
} = {}) {
  const root = document.getElementById('view-outreach');
  if (!root || root.dataset.outreachWired === '1') return;
  root.dataset.outreachWired = '1';

  root.addEventListener('change', (e) => {
    if (e.target?.id === 'outreach-type' && state.outreachPack) {
      renderOutreachPackUi(state.outreachPack);
    }
  });

  root.addEventListener('click', (e) => {
    if (e.target.closest('#btn-outreach-load')) {
      e.preventDefault();
      void loadOutreachPack().catch((err) => toast(String(err.message || err)));
      return;
    }
    if (e.target.closest('#btn-outreach-open-posting')) {
      e.preventDefault();
      const url = state.outreachPack?.application?.jobUrl || state.outreachPack?.signals?.url;
      if (!url) {
        toast('Load context first — or pick a row with a posting URL in its report');
        return;
      }
      window.open(url, '_blank', 'noopener');
      return;
    }
    if (e.target.closest('#btn-outreach-open-report')) {
      e.preventDefault();
      const p = state.outreachPack?.reportPath;
      if (!p) {
        toast('Load context first — you need a linked report file on this row');
        return;
      }
      window.open(`/${String(p).replace(/^\//, '')}`, '_blank', 'noopener');
      return;
    }
    if (e.target.closest('#btn-outreach-copy-message')) {
      e.preventDefault();
      const t = ($('#outreach-draft')?.value || '').trim();
      if (!t) {
        toast('Nothing to copy yet');
        return;
      }
      void (async () => {
        try {
          await navigator.clipboard.writeText(t);
          toast('Copied message');
        } catch {
          toast('Clipboard blocked — copy manually from the text box');
        }
      })();
      return;
    }
    if (e.target.closest('#btn-outreach-copy-ai')) {
      e.preventDefault();
      const t = buildOutreachBundleText();
      if (!t.trim()) {
        toast('Load context for the selected row first');
        return;
      }
      void (async () => {
        try {
          await navigator.clipboard.writeText(t);
          toast('Copied bundle for AI');
        } catch {
          toast('Clipboard blocked — copy manually from the report + draft');
        }
      })();
    }
  });
}


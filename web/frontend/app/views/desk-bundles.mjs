/**
 * Desk “bundle” views: Deep research, Training assessment, Project idea —
 * copy-to-clipboard prompts aligned with career-ops modes.
 */

export function wireDeepView({ buildDeepPrompt, toast, $, api } = {}) {
  const root = document.getElementById('view-deep');
  if (!root || root.dataset.deepWired === '1') return;
  root.dataset.deepWired = '1';

  const pre = document.getElementById('deep-preview');
  let headline = '';

  const update = () => {
    const c = ($('#deep-company') && $('#deep-company').value.trim()) || '';
    const r = ($('#deep-role') && $('#deep-role').value.trim()) || '';
    if (pre) pre.textContent = buildDeepPrompt(c, r, headline);
  };

  root.addEventListener('input', (e) => {
    if (e.target?.id === 'deep-company' || e.target?.id === 'deep-role') update();
  });

  document.getElementById('btn-deep-copy')?.addEventListener('click', async () => {
    const c = ($('#deep-company') && $('#deep-company').value.trim()) || '';
    const r = ($('#deep-role') && $('#deep-role').value.trim()) || '';
    const txt = buildDeepPrompt(c, r, headline);
    try {
      await navigator.clipboard.writeText(txt);
      toast('Copied research prompt');
    } catch {
      toast('Clipboard blocked — select text in the preview');
    }
  });

  void (async () => {
    try {
      const { profile } = await api('/api/profile');
      headline = profile?.narrative?.headline || '';
    } catch {
      headline = '';
    }
    update();
  })();
}

function buildTrainingBundle(title, details) {
  const t = title?.trim() || '[Course / certification]';
  const d = (details || '').trim();
  return `## Training assessment: ${t}

${d ? `### Context from you\n${d}\n\n` : ''}### Instructions for the AI (career-ops training mode)

Evaluate using these dimensions:
- **North Star alignment** — does it move you toward your stated goals?
- **Recruiter signal** — what does a hiring manager infer from this on a CV?
- **Time & effort** — realistic weeks × hours/week.
- **Opportunity cost** — what you cannot do while doing this.
- **Risks** — outdated content, weak brand, too shallow.
- **Portfolio deliverable** — does it produce a demonstrable artifact?

Return one verdict: **DO IT**, **DON'T DO IT**, or **DO IT (TIMEBOXED)** with a concrete weekly plan (or a better alternative if DON'T).
`;
}

export function wireTrainingView({ toast, $ } = {}) {
  const root = document.getElementById('view-training');
  if (!root || root.dataset.trainingWired === '1') return;
  root.dataset.trainingWired = '1';

  const pre = document.getElementById('training-preview');

  const update = () => {
    const title = ($('#training-title') && $('#training-title').value.trim()) || '';
    const details = ($('#training-details') && $('#training-details').value.trim()) || '';
    if (pre) pre.textContent = buildTrainingBundle(title, details);
  };

  root.addEventListener('input', (e) => {
    if (e.target?.id === 'training-title' || e.target?.id === 'training-details') update();
  });

  document.getElementById('btn-training-copy')?.addEventListener('click', async () => {
    const title = ($('#training-title') && $('#training-title').value.trim()) || '';
    const details = ($('#training-details') && $('#training-details').value.trim()) || '';
    if (!title.trim() && !details.trim()) {
      toast('Add a course title or paste details first');
      return;
    }
    try {
      await navigator.clipboard.writeText(buildTrainingBundle(title, details));
      toast('Copied assessment bundle');
    } catch {
      toast('Clipboard blocked');
    }
  });

  update();
}

function buildProjectBundle(title, details) {
  const t = title?.trim() || '[Project idea]';
  const d = (details || '').trim();
  return `## Portfolio project evaluation: ${t}

${d ? `### Context from you\n${d}\n\n` : ''}### Instructions for the AI (career-ops project mode)

Score **six dimensions** (1–5 each; weights: signal 25%, uniqueness 20%, demo-ability 20%, metrics 15%, time-to-MVP 10%, STAR potential 10%):
- Signal for target roles, Uniqueness, Demo-ability (2 min), Metrics potential, Time to MVP, STAR story potential.

Return verdict: **BUILD**, **SKIP**, or **PIVOT TO [alternative]** with an 80/20 plan (week 1 MVP + week 2 interview pack: one-pager, demo, postmortem checklist).
`;
}

export function wireProjectView({ toast, $ } = {}) {
  const root = document.getElementById('view-project');
  if (!root || root.dataset.projectWired === '1') return;
  root.dataset.projectWired = '1';

  const pre = document.getElementById('project-preview');

  const update = () => {
    const title = ($('#project-title') && $('#project-title').value.trim()) || '';
    const details = ($('#project-details') && $('#project-details').value.trim()) || '';
    if (pre) pre.textContent = buildProjectBundle(title, details);
  };

  root.addEventListener('input', (e) => {
    if (e.target?.id === 'project-title' || e.target?.id === 'project-details') update();
  });

  document.getElementById('btn-project-copy')?.addEventListener('click', async () => {
    const title = ($('#project-title') && $('#project-title').value.trim()) || '';
    const details = ($('#project-details') && $('#project-details').value.trim()) || '';
    if (!title.trim() && !details.trim()) {
      toast('Add a project title or context first');
      return;
    }
    try {
      await navigator.clipboard.writeText(buildProjectBundle(title, details));
      toast('Copied project bundle');
    } catch {
      toast('Clipboard blocked');
    }
  });

  update();
}

/**
 * Interview prep backed by Supabase workspace_documents (paths interview-prep/*.md).
 */
import { readFileSync } from 'fs';
import { basename } from 'path';
import {
  humanLabelForPrepFile,
  slugifyStem,
  assertSafeBasename,
  prepTitleFromParts,
  findPrepNotebookInItems,
  extractReportLetterSections,
  buildSeededPrepMarkdown,
  defaultPrepBodyFromTitle,
  buildRehearsalPackWithRead,
} from './interview-prep-io.mjs';
import { upsertWorkspaceBody } from './workspace-remote.mjs';

const PREFIX = 'interview-prep/';

function storagePath(name) {
  return `${PREFIX}${assertSafeBasename(name)}`;
}

async function upsertDoc(sb, userId, path, body) {
  await upsertWorkspaceBody(sb, userId, path, body, { mimeType: 'text/markdown' });
}

export async function listInterviewPrepItemsRemote(sb, _userId) {
  const { data, error } = await sb
    .from('workspace_documents')
    .select('path')
    .like('path', `${PREFIX}%`);
  if (error) throw new Error(error.message);
  const names = (data || [])
    .map((r) => basename(r.path))
    .filter((f) => f.endsWith('.md'));
  names.sort((a, b) => {
    if (a === 'story-bank.md') return -1;
    if (b === 'story-bank.md') return 1;
    return a.localeCompare(b);
  });
  return names.map((name) => ({
    name,
    label: humanLabelForPrepFile(name),
    kind: name.toLowerCase() === 'story-bank.md' ? 'story' : 'prep',
  }));
}

export async function readInterviewPrepDocRemote(sb, _userId, name) {
  const base = assertSafeBasename(name);
  const path = storagePath(base);
  const { data, error } = await sb.from('workspace_documents').select('body').eq('path', path).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    return { name: base, label: humanLabelForPrepFile(base), content: '', exists: false };
  }
  return {
    name: base,
    label: humanLabelForPrepFile(base),
    content: data.body || '',
    exists: true,
  };
}

export async function writeInterviewPrepDocRemote(sb, userId, name, content) {
  const base = assertSafeBasename(name);
  await upsertDoc(sb, userId, storagePath(base), content);
  return { name: base };
}

async function existingBasenames(sb) {
  const { data, error } = await sb
    .from('workspace_documents')
    .select('path')
    .like('path', `${PREFIX}%`);
  if (error) throw new Error(error.message);
  return new Set((data || []).map((r) => basename(r.path)));
}

export async function createInterviewPrepFromTitleRemote(sb, userId, displayTitle, bodyOverride = null) {
  const title = String(displayTitle || '').trim();
  if (title.length < 2) throw new Error('Give it a short name (e.g. Stripe — solutions engineer)');
  const existing = await existingBasenames(sb);
  const stem0 = slugifyStem(title);
  let stem = stem0;
  let n = 2;
  let base;
  for (;;) {
    base = `${stem}.md`;
    assertSafeBasename(base);
    if (!existing.has(base)) {
      const body =
        bodyOverride != null && String(bodyOverride).trim()
          ? String(bodyOverride)
          : defaultPrepBodyFromTitle(title);
      await upsertDoc(sb, userId, storagePath(base), body);
      return { name: base };
    }
    stem = `${stem0}-${n++}`;
  }
}

const EMPTY_PREP_SEED = `# Interview prep

## Company / role

## Angles

## Questions for them

## Notes

`;

export async function createInterviewPrepDocRemote(sb, userId, name) {
  const base = assertSafeBasename(name);
  const ex = await existingBasenames(sb);
  if (ex.has(base)) throw new Error('file already exists');
  await upsertDoc(sb, userId, storagePath(base), EMPTY_PREP_SEED);
  return { name: base };
}

export async function ensurePrepNotebookRemote(sb, userId, company, role) {
  const title = prepTitleFromParts(company, role);
  if (title.length < 3) throw new Error('company and role required');
  const items = await listInterviewPrepItemsRemote(sb, userId);
  const found = findPrepNotebookInItems(items, company, role);
  if (found) return { name: found.name, label: found.label, created: false };
  const { name } = await createInterviewPrepFromTitleRemote(sb, userId, title);
  return { name, label: humanLabelForPrepFile(name), created: true };
}

export async function applyReportSeedToNotebookRemote(sb, userId, company, role, reportNum, reportAbsPath) {
  const title = prepTitleFromParts(company, role);
  if (!title) throw new Error('company and role required');
  const raw = readFileSync(reportAbsPath, 'utf8');
  const sec = extractReportLetterSections(raw);
  const body = buildSeededPrepMarkdown(title, reportNum, sec);
  const marker = `<!--prep-seed:${reportNum}-->`;

  const items = await listInterviewPrepItemsRemote(sb, userId);
  const found = findPrepNotebookInItems(items, company, role);
  if (!found) {
    const { name } = await createInterviewPrepFromTitleRemote(sb, userId, title, body);
    return {
      name,
      label: humanLabelForPrepFile(name),
      created: true,
      seeded: true,
      mode: 'created',
    };
  }

  const name = found.name;
  const doc = await readInterviewPrepDocRemote(sb, userId, name);
  const content = doc.content || '';
  if (content.includes(marker)) {
    return { name, label: doc.label, created: false, seeded: false, mode: 'already-seeded' };
  }
  const compact = content.replace(/\s/g, '').length < 420;
  if (compact) {
    await writeInterviewPrepDocRemote(sb, userId, name, body);
    return { name, label: doc.label, created: false, seeded: true, mode: 'replaced-empty' };
  }
  const snapshot = `\n\n${marker}\n## Snapshot from report #${reportNum}\n\n### Role (evaluation excerpt)\n\n${sec.a ? sec.a.slice(0, 2200) : '—'}\n\n### Fit / gaps\n\n${sec.b ? sec.b.slice(0, 2200) : '—'}\n\n`;
  await writeInterviewPrepDocRemote(sb, userId, name, content.trimEnd() + snapshot);
  return { name, label: doc.label, created: false, seeded: true, mode: 'appended' };
}

export async function buildRehearsalPackRemote(sb, userId, company, role) {
  return buildRehearsalPackWithRead(
    company,
    role,
    () => listInterviewPrepItemsRemote(sb, userId),
    (name) => readInterviewPrepDocRemote(sb, userId, name)
  );
}

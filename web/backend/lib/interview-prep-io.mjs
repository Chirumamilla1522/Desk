/**
 * Read/write markdown under interview-prep/ (user layer).
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, basename, resolve, relative } from 'path';

const DIR = 'interview-prep';

function prepDir(root) {
  return join(root, DIR);
}

export function assertSafeBasename(name) {
  const base = basename(String(name || '').trim());
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.md$/.test(base)) {
    throw new Error('invalid filename — use letters, numbers, . _ - and end with .md');
  }
  return base;
}

export function listInterviewPrepFiles(root) {
  const dir = prepDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort((a, b) => {
      if (a === 'story-bank.md') return -1;
      if (b === 'story-bank.md') return 1;
      return a.localeCompare(b);
    });
}

/** User-facing label — never a path */
export function humanLabelForPrepFile(base) {
  const b = basename(String(base || ''));
  if (b.toLowerCase() === 'story-bank.md') return 'STAR story bank';
  const stem = b.replace(/\.md$/i, '');
  const spaced = stem.replace(/[-_]+/g, ' ').trim();
  if (!spaced) return 'Notes';
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function listInterviewPrepItems(root) {
  return listInterviewPrepFiles(root).map((name) => ({
    name,
    label: humanLabelForPrepFile(name),
    kind: name.toLowerCase() === 'story-bank.md' ? 'story' : 'prep',
  }));
}

export function slugifyStem(raw) {
  let s = String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!s) s = 'prep';
  return s.slice(0, 72);
}

/** Create a new prep doc from a human title (slug is derived; title is the H1). */
const DEFAULT_PREP_TEMPLATE = (titleLine) => `# ${titleLine.replace(/\r?\n/g, ' ')}

## What they’re hiring for

## Your angles

## Questions you’ll ask them

## Session notes

`;

export function defaultPrepBodyFromTitle(displayTitle) {
  const titleLine = String(displayTitle || '').trim();
  return DEFAULT_PREP_TEMPLATE(titleLine);
}

export function createInterviewPrepFromTitle(root, displayTitle, bodyOverride = null) {
  const title = String(displayTitle || '').trim();
  if (title.length < 2) throw new Error('Give it a short name (e.g. Stripe — solutions engineer)');
  const dir = prepDir(root);
  mkdirSync(dir, { recursive: true });
  const stem0 = slugifyStem(title);
  let stem = stem0;
  let n = 2;
  let base;
  for (;;) {
    base = `${stem}.md`;
    assertSafeBasename(base);
    const full = join(dir, base);
    if (!existsSync(full)) {
      const body =
        bodyOverride != null && String(bodyOverride).trim()
          ? String(bodyOverride)
          : defaultPrepBodyFromTitle(title);
      writeFileSync(full, body, 'utf8');
      return { name: base };
    }
    stem = `${stem0}-${n++}`;
  }
}

export function prepTitleFromParts(company, role) {
  const c = String(company || '').trim();
  const r = String(role || '').trim();
  if (!c || !r) return '';
  return `${c} — ${r}`;
}

export function normPrepKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2013\u2014\-–—]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function findPrepNotebookInItems(items, company, role) {
  const title = prepTitleFromParts(company, role);
  if (!title) return null;
  const key = normPrepKey(title);
  for (const it of items) {
    if (it.kind !== 'prep') continue;
    if (normPrepKey(it.label) === key) return it;
  }
  return null;
}

export function findPrepNotebookByApp(root, company, role) {
  return findPrepNotebookInItems(listInterviewPrepItems(root), company, role);
}

export function ensurePrepNotebook(root, company, role) {
  const title = prepTitleFromParts(company, role);
  if (title.length < 3) throw new Error('company and role required');
  const found = findPrepNotebookByApp(root, company, role);
  if (found) return { name: found.name, label: found.label, created: false };
  const { name } = createInterviewPrepFromTitle(root, title);
  return { name, label: humanLabelForPrepFile(name), created: true };
}

/** Next markdown section after `## L)` (evaluation reports use A/B/C blocks). */
export function extractReportLetterSection(text, letter) {
  const re = new RegExp(`^##\\s*${letter}\\)[^\\n]*`, 'm');
  const mi = String(text || '').match(re);
  if (!mi) return '';
  const start = mi.index + mi[0].length;
  const rest = String(text || '').slice(start);
  const next = rest.search(/\n##\s/);
  const body = (next >= 0 ? rest.slice(0, next) : rest).trim();
  return body.slice(0, 3200);
}

export function extractReportLetterSections(text) {
  return {
    a: extractReportLetterSection(text, 'A'),
    b: extractReportLetterSection(text, 'B'),
    c: extractReportLetterSection(text, 'C'),
  };
}

export function buildSeededPrepMarkdown(displayTitle, reportNum, sec) {
  const t = String(displayTitle || '').replace(/\r?\n/g, ' ').trim();
  return `# ${t}

## What they're hiring for

${sec.a || '_No block A in report — paste from posting._'}

## Match & gaps (from evaluation)

${sec.b || '_No block B in report._'}

## Strategy / level (from evaluation)

${sec.c || '_No block C in report._'}

## Your angles

## Questions you'll ask them

## Session notes

---
_Prep seeded from evaluation report #${reportNum}. Edit freely._
`;
}

export function applyReportSeedToNotebook(root, company, role, reportNum, reportAbsPath) {
  const title = prepTitleFromParts(company, role);
  if (!title) throw new Error('company and role required');
  const raw = readFileSync(reportAbsPath, 'utf8');
  const sec = extractReportLetterSections(raw);
  const body = buildSeededPrepMarkdown(title, reportNum, sec);
  const marker = `<!--prep-seed:${reportNum}-->`;

  const found = findPrepNotebookByApp(root, company, role);
  if (!found) {
    const { name } = createInterviewPrepFromTitle(root, title, body);
    return {
      name,
      label: humanLabelForPrepFile(name),
      created: true,
      seeded: true,
      mode: 'created',
    };
  }

  const name = found.name;
  const doc = readInterviewPrepDoc(root, name);
  const content = doc.content || '';
  if (content.includes(marker)) {
    return { name, label: doc.label, created: false, seeded: false, mode: 'already-seeded' };
  }
  const compact = content.replace(/\s/g, '').length < 420;
  if (compact) {
    writeInterviewPrepDoc(root, name, body);
    return { name, label: doc.label, created: false, seeded: true, mode: 'replaced-empty' };
  }
  const snapshot = `\n\n${marker}\n## Snapshot from report #${reportNum}\n\n### Role (evaluation excerpt)\n\n${sec.a ? sec.a.slice(0, 2200) : '—'}\n\n### Fit / gaps\n\n${sec.b ? sec.b.slice(0, 2200) : '—'}\n\n`;
  writeInterviewPrepDoc(root, name, content.trimEnd() + snapshot);
  return { name, label: doc.label, created: false, seeded: true, mode: 'appended' };
}

function splitStorySnippets(md) {
  const s = String(md || '').trim();
  if (!s) return [];
  const chunks = s.split(/^##\s+/m).map((c) => c.trim()).filter(Boolean);
  if (chunks.length <= 1) return [s.slice(0, 1400)];
  return chunks.map((c) => c.slice(0, 1400));
}

function extractQuestionBulletLines(md) {
  const m = String(md || '').match(/^##[^\n]*question[^\n]*\n([\s\S]*?)(?=^##\s)/im);
  let block = '';
  if (m) block = m[1];
  else {
    const m2 = String(md || '').match(/^##[^\n]*question[^\n]*\n([\s\S]*)$/im);
    if (m2) block = m2[1];
  }
  const lines = [];
  for (const line of block.split('\n')) {
    const t = line.trim();
    if (/^[-*]\s+\S/.test(t)) lines.push(t.replace(/^[-*]\s+/, '').trim());
    else if (/^\d+\.\s+\S/.test(t)) lines.push(t.replace(/^\d+\.\s+/, '').trim());
  }
  return lines.slice(0, 36);
}

/** Resolve `reports/…` path from tracker report cell; must stay under `reports/`. */
export function resolveReportFileUnderRoot(careerOpsRoot, reportCell) {
  const m = String(reportCell || '').match(/\]\(([^)]+)\)/);
  if (!m) return null;
  let rel = m[1].replace(/^\//, '').replace(/^\.\/+/, '');
  if (!rel || rel.includes('..') || rel.includes('\0')) return null;
  const full = resolve(careerOpsRoot, rel);
  const reportsRoot = resolve(careerOpsRoot, 'reports');
  const relToReports = relative(reportsRoot, full);
  if (relToReports.startsWith('..') || relToReports === '') return null;
  if (!existsSync(full) || !full.endsWith('.md')) return null;
  return full;
}

/**
 * @param {() => Promise<Array<{ name: string; label: string; kind: string }>>} listItems
 * @param {(name: string) => Promise<{ content?: string; exists?: boolean }>} readPrepDoc
 */
export async function buildRehearsalPackWithRead(company, role, listItems, readPrepDoc) {
  const title = prepTitleFromParts(company, role);
  if (!title) throw new Error('company and role required');
  const items = await listItems();
  const storyDoc = await readPrepDoc('story-bank.md');
  const storySnippets = splitStorySnippets(storyDoc.content || '');
  const prepItem = findPrepNotebookInItems(items, company, role);
  let questionPrompts = [];
  let prepName = null;
  let prepLabel = null;
  if (prepItem) {
    prepName = prepItem.name;
    prepLabel = prepItem.label;
    const pdoc = await readPrepDoc(prepName);
    questionPrompts = extractQuestionBulletLines(pdoc.content || '');
  }
  return {
    title,
    company: String(company || '').trim(),
    role: String(role || '').trim(),
    prepName,
    prepLabel,
    storySnippets,
    questionPrompts,
  };
}

export async function buildRehearsalPack(root, company, role) {
  return buildRehearsalPackWithRead(
    company,
    role,
    () => Promise.resolve(listInterviewPrepItems(root)),
    (name) => Promise.resolve(readInterviewPrepDoc(root, name))
  );
}

export function readInterviewPrepDoc(root, name) {
  const base = assertSafeBasename(name);
  const full = join(prepDir(root), base);
  if (!existsSync(full)) {
    return { name: base, label: humanLabelForPrepFile(base), content: '', exists: false };
  }
  return {
    name: base,
    label: humanLabelForPrepFile(base),
    content: readFileSync(full, 'utf8'),
    exists: true,
  };
}

export function writeInterviewPrepDoc(root, name, content) {
  const base = assertSafeBasename(name);
  const dir = prepDir(root);
  mkdirSync(dir, { recursive: true });
  const full = join(dir, base);
  writeFileSync(full, String(content ?? ''), 'utf8');
  return { name: base };
}

export function createInterviewPrepDoc(root, name) {
  const base = assertSafeBasename(name);
  const dir = prepDir(root);
  mkdirSync(dir, { recursive: true });
  const full = join(dir, base);
  if (existsSync(full)) {
    throw new Error('file already exists');
  }
  const seed = `# Interview prep\n\n## Company / role\n\n## Angles\n\n## Questions for them\n\n## Notes\n\n`;
  writeFileSync(full, seed, 'utf8');
  return { name: base };
}

/**
 * Append-only logs under data/ — decision notes + optional pre-apply checklist.
 */
import { appendFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

function ensureData(root) {
  mkdirSync(join(root, 'data'), { recursive: true });
}

function esc(s) {
  return String(s ?? '')
    .replace(/\|/g, '¦')
    .replace(/\r?\n/g, ' ')
    .trim();
}

export function appendDecisionEntrySync(root, entry) {
  ensureData(root);
  const p = join(root, 'data', 'decisions.md');
  const line = `| ${esc(entry.iso)} | #${entry.num} | ${esc(entry.company)} | ${esc(entry.role)} | ${esc(entry.fromStatus)} → ${esc(entry.toStatus)} | ${esc(entry.note)} |\n`;
  const header = `# Decision journal

| When (UTC) | # | Company | Role | Change | Why |
|------------|---|---------|------|--------|-----|
`;
  if (!existsSync(p)) writeFileSync(p, header + line, 'utf8');
  else appendFileSync(p, line, 'utf8');
}

export function appendPreApplyChecklistSync(root, entry) {
  ensureData(root);
  const p = join(root, 'data', 'apply-checklist.md');
  const line = `| ${esc(entry.iso)} | #${entry.num} | ${esc(entry.company)} | ${esc(entry.role)} | ${entry.customized ? 'yes' : 'no'} | ${entry.verifiedLive ? 'yes' : 'no'} |\n`;
  const header = `# Pre-apply checklist log

| When (UTC) | # | Company | Role | Customized | Verified live |
|------------|---|---------|------|------------|---------------|
`;
  if (!existsSync(p)) writeFileSync(p, header + line, 'utf8');
  else appendFileSync(p, line, 'utf8');
}

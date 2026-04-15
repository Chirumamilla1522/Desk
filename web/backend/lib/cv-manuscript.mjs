/**
 * Structured CV → markdown for cv.md · JSON at data/cv-manuscript.json
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export function manuscriptPath(careerOpsRoot) {
  return join(careerOpsRoot, 'data', 'cv-manuscript.json');
}

export const EMPTY_MANUSCRIPT = () => ({
  fullName: '',
  email: '',
  phone: '',
  location: '',
  linkedin: '',
  headline: '',
  summary: '',
  skills: [],
  experience: [{ company: '', title: '', dates: '', bullets: [''] }],
  education: [{ school: '', degree: '', year: '' }],
});

export function readManuscript(careerOpsRoot) {
  const p = manuscriptPath(careerOpsRoot);
  if (!existsSync(p)) return EMPTY_MANUSCRIPT();
  try {
    const data = JSON.parse(readFileSync(p, 'utf8'));
    return normalizeManuscript(data);
  } catch {
    return EMPTY_MANUSCRIPT();
  }
}

export function normalizeManuscript(data) {
  const d = { ...EMPTY_MANUSCRIPT(), ...data };
  if (!Array.isArray(d.skills)) d.skills = [];
  if (!Array.isArray(d.experience) || !d.experience.length) {
    d.experience = [{ company: '', title: '', dates: '', bullets: [''] }];
  }
  if (!Array.isArray(d.education) || !d.education.length) {
    d.education = [{ school: '', degree: '', year: '' }];
  }
  d.experience = d.experience.map((x) => ({
    company: x.company || '',
    title: x.title || '',
    dates: x.dates || '',
    bullets: Array.isArray(x.bullets) && x.bullets.length ? x.bullets : [''],
  }));
  d.education = d.education.map((x) => ({
    school: x.school || '',
    degree: x.degree || '',
    year: x.year || '',
  }));
  return d;
}

export function writeManuscript(careerOpsRoot, data) {
  const normalized = normalizeManuscript(data);
  writeFileSync(manuscriptPath(careerOpsRoot), JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

export function buildCvMarkdown(m) {
  const lines = [];
  const name = m.fullName?.trim() || 'Your Name';
  lines.push(`# ${name}`);
  lines.push('');
  const contact = [m.email, m.phone, m.location, m.linkedin].filter(Boolean).join(' · ');
  if (contact) {
    lines.push(contact);
    lines.push('');
  }
  if (m.headline?.trim() || m.summary?.trim()) {
    lines.push(`## Summary`);
    lines.push('');
    if (m.headline?.trim()) lines.push(m.headline.trim());
    if (m.headline?.trim() && m.summary?.trim()) lines.push('');
    if (m.summary?.trim()) lines.push(m.summary.trim());
    lines.push('');
  }
  if (m.skills?.length) {
    const sk = m.skills.map((s) => String(s).trim()).filter(Boolean);
    if (sk.length) {
      lines.push(`## Skills`);
      lines.push('');
      lines.push(sk.join(', '));
      lines.push('');
    }
  }
  const ex = (m.experience || []).filter((e) => e.company?.trim() || e.title?.trim() || e.bullets?.some((b) => b?.trim()));
  if (ex.length) {
    lines.push(`## Experience`);
    lines.push('');
    for (const e of ex) {
      const head = [e.title, e.company].filter(Boolean).join(' — ');
      const line = [head, e.dates].filter(Boolean).join(' · ');
      if (line) lines.push(`### ${line}`);
      else lines.push(`### Role`);
      lines.push('');
      for (const b of e.bullets || []) {
        const t = String(b || '').trim();
        if (t) lines.push(`- ${t}`);
      }
      lines.push('');
    }
  }
  const ed = (m.education || []).filter((x) => x.school?.trim() || x.degree?.trim());
  if (ed.length) {
    lines.push(`## Education`);
    lines.push('');
    for (const x of ed) {
      const row = [x.degree, x.school].filter(Boolean).join(', ');
      const y = x.year?.trim();
      lines.push(`- ${row}${y ? ` (${y})` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim() + '\n';
}

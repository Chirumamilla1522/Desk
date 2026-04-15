/**
 * Extract comparable fields + score dimensions from evaluation report markdown.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function rowMatch(plain, labelPattern) {
  const re = new RegExp(`\\|\\s*(?:${labelPattern})\\s*\\|\\s*(.*?)\\s*\\|`, 'i');
  const m = plain.match(re);
  return m ? m[1].replace(/\*\*/g, '').trim() : '';
}

function blockAOnly(plain) {
  const cut = plain.search(/\n##\s*B\)/i);
  return cut === -1 ? plain.slice(0, 12000) : plain.slice(0, cut);
}

/** @param {string} content */
export function parseReportSignals(content) {
  const plain = content.replace(/\*\*/g, '');
  const aBlock = blockAOnly(plain);
  const headerScore = plain.match(/\*\*Score:\*\*\s*([\d.]+)\/5/i) || plain.match(/^Score:\s*([\d.]+)\/5/im);
  const headerUrl = plain.match(/\*\*URL:\*\*\s*(https?:\/\/\S+)/im);

  const archetype =
    rowMatch(aBlock, 'Archetype|Arquetipo') || plain.match(/\*\*Arquetipo:\*\*\s*(.+)/i)?.[1]?.trim() || '';
  const seniority = rowMatch(aBlock, 'Seniority|Nivel|Level');
  const remote = rowMatch(aBlock, 'Remote|Remoto|Location');
  const team = rowMatch(aBlock, 'Team|Team size|Equipo');
  const roleTitle = rowMatch(aBlock, 'Role|Rol|Puesto');
  const company = rowMatch(aBlock, 'Company|Empresa');
  const location = rowMatch(aBlock, 'Location|Ubicación|Ubicacion');
  const compLine = plain.match(/\*\*Comp\s*Score:\*\*\s*([^\n]+)/i);
  const comp = compLine ? compLine[1].trim() : rowMatch(aBlock, 'Listed salary|Salary band');

  const pickScore = (label) => {
    const re = new RegExp(`\\|\\s*(?:${label})\\s*\\|\\s*([\\d.]+)\\/5\\s*\\|`, 'i');
    const m = plain.match(re);
    return m ? parseFloat(m[1]) : null;
  };

  const dimensions = {
    cvMatch: pickScore('CV Match|Match con CV'),
    northStar: pickScore('North Star'),
    compScore: pickScore('^Comp\\b'),
    cultural: pickScore('Cultural signals|Cultural'),
    redFlags: (() => {
      const m = plain.match(/\|\s*(?:Red flags|Red Flags)\s*\|\s*([-+]?[\d.]+)\s*\|/i);
      return m ? parseFloat(m[1]) : null;
    })(),
    global: pickScore('^Global\\b'),
  };

  return {
    headerScore: headerScore ? parseFloat(headerScore[1]) : null,
    url: headerUrl ? headerUrl[1].replace(/[)\]}>.,;]+$/, '') : '',
    archetype: archetype || '—',
    seniority: seniority || '—',
    remote: remote || '—',
    team: team || '—',
    comp: comp || '—',
    roleTitle: roleTitle || '—',
    company: company || '—',
    location: location || '—',
    dimensions,
  };
}

export function readReportSignals(root, reportCell) {
  if (!reportCell || reportCell === '—') return { error: 'no_report' };
  const m = String(reportCell).match(/\]\(([^)]+)\)/);
  if (!m) return { error: 'no_link' };
  const rel = m[1].replace(/^\//, '');
  const full = join(root, rel);
  if (!existsSync(full)) return { error: 'missing_file', path: rel };
  const content = readFileSync(full, 'utf8');
  return { path: rel, ...parseReportSignals(content) };
}

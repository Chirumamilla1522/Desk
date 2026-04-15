/**
 * Express app (used by `server.mjs` locally and root `server.mjs` on Vercel).
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import Busboy from 'busboy';
import pdfParse from 'pdf-parse';

import {
  readApplications,
  readApplicationsFromContent,
  writeApplications,
  updateApp,
  addApp,
  parseScoreValue,
  getCareerOpsRoot,
  loadCanonicalStates,
  normalizeStatus,
  serializeApplications,
} from './lib/tracker-store.mjs';
import { jobUrlFromReport } from './lib/enrich.mjs';
import {
  collectMatchingJobs,
  formatPostedYmd,
  detectApi,
  appendToPipeline,
  appendOffersToPipelineMarkdown,
} from '../../scan-core.mjs';
import {
  readPortalsDoc,
  writePortalsDoc,
  summarizeForUi,
  applyPortalsPatch,
} from './lib/portals-io.mjs';
import { readProfile, writeProfile, profileSummary, mergeProfilePatch } from './lib/profile-io.mjs';
import { parsePipelinePending, parsePipelinePendingFromText } from './lib/pipeline-io.mjs';
import { loadScanHistoryByUrl } from './lib/scan-history-index.mjs';
import { readManuscript, writeManuscript, buildCvMarkdown } from './lib/cv-manuscript.mjs';
import { listCommandsForApi, runCommand } from './lib/command-runner.mjs';
import { buildJdReferenceHtml, slugifyDesk } from './lib/jd-reference-build.mjs';
import { computePipelineWeather } from './lib/pipeline-weather.mjs';
import { readReportSignals } from './lib/report-signals.mjs';
import { buildApplyPack } from './lib/apply-pack.mjs';
import { buildOutreachPack } from './lib/outreach-pack.mjs';
import { appendDecisionEntrySync, appendPreApplyChecklistSync } from './lib/desk-journal.mjs';
import {
  listInterviewPrepItems,
  readInterviewPrepDoc,
  writeInterviewPrepDoc,
  createInterviewPrepDoc,
  createInterviewPrepFromTitle,
  ensurePrepNotebook,
  applyReportSeedToNotebook,
  resolveReportFileUnderRoot,
  buildRehearsalPack,
} from './lib/interview-prep-io.mjs';
import {
  listInterviewPrepItemsRemote,
  readInterviewPrepDocRemote,
  writeInterviewPrepDocRemote,
  createInterviewPrepFromTitleRemote,
  createInterviewPrepDocRemote,
  ensurePrepNotebookRemote,
  applyReportSeedToNotebookRemote,
  buildRehearsalPackRemote,
} from './lib/interview-prep-cloud.mjs';
import {
  isCloudEnabled,
  isDeskAuthEnforced,
  getSessionUser,
  supabaseForAccessToken,
  attachSessionCookies,
  clearSessionCookies,
  createAnonClient,
} from './lib/auth-supabase.mjs';
import {
  getWorkspaceBody,
  upsertWorkspaceBody,
  isWorkspacePathWritable,
  WS,
} from './lib/workspace-remote.mjs';

const ROOT = getCareerOpsRoot();
const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_FALLBACK = join(__dirname, '..', 'frontend');
const PUBLIC_BUILD = join(ROOT, 'public');
const PUBLIC = existsSync(join(PUBLIC_BUILD, 'desk.html')) ? PUBLIC_BUILD : PUBLIC_FALLBACK;
const FOCUS_PRESETS = JSON.parse(readFileSync(join(__dirname, 'lib', 'focus-presets.json'), 'utf8'));

function sbFor(sessionUser) {
  return supabaseForAccessToken(sessionUser.accessToken);
}

const APPLICATIONS_PATH = join(ROOT, 'data', 'applications.md');

/** Tracker rows: disk, or Supabase workspace_documents for signed-in cloud users. */
async function loadApplicationsContext(req) {
  const cu = await getSessionUser(req);
  if (cu && isCloudEnabled()) {
    const sb = sbFor(cu);
    const raw = await getWorkspaceBody(sb, WS.APPLICATIONS);
    const cloudDocExists = raw != null && String(raw).trim().length > 0;
    const parsed = cloudDocExists
      ? readApplicationsFromContent(raw, APPLICATIONS_PATH)
      : readApplicationsFromContent('', APPLICATIONS_PATH);
    return { ...parsed, cu, sb, remote: true, cloudDocExists };
  }
  return { ...readApplications(), cu: null, sb: null, remote: false, cloudDocExists: false };
}

const app = express();
app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: '4mb' }));
app.use(cookieParser());

/** When cloud is on (and not opted out), all /api routes except a small allowlist need a session. */
function requireApiAuth() {
  return isDeskAuthEnforced();
}

function isPublicApiPath(path) {
  if (!path.startsWith('/api/')) return false;
  const rest = path.slice('/api/'.length);
  if (rest === 'health' || rest === 'bootstrap' || rest === 'states' || rest === 'me') return true;
  if (rest.startsWith('auth/')) return true;
  return false;
}

app.use(async (req, res, next) => {
  if (!requireApiAuth()) return next();
  if (!req.path.startsWith('/api/')) return next();
  if (isPublicApiPath(req.path)) return next();
  try {
    const u = await getSessionUser(req);
    if (!u) return res.status(401).json({ error: 'Sign in required', auth: true });
    next();
  } catch (e) {
    next(e);
  }
});

function enrichPipelineItems(root, pending) {
  const hist = loadScanHistoryByUrl(root);
  return pending.map((p) => {
    const h = hist.get(p.url);
    const listed = p.posted || '';
    const firstSeen = h?.first_seen || '';
    return {
      ...p,
      firstSeen,
      portal: h?.portal || '',
      scanTitle: h?.title || '',
      scanCompany: h?.company || '',
      listedLabel: listed || firstSeen || '',
    };
  });
}

function computeMetrics(apps) {
  const byStatus = {};
  let totalScore = 0;
  let scored = 0;
  let withPdf = 0;
  let actionable = 0;
  let topScore = 0;

  for (const a of apps) {
    const st = normalizeStatus(a.status);
    byStatus[st] = (byStatus[st] || 0) + 1;
    const sc = parseScoreValue(a.score);
    if (sc > 0) {
      totalScore += sc;
      scored++;
      if (sc > topScore) topScore = sc;
    }
    if (String(a.pdf).includes('✅')) withPdf++;
    const low = st.toLowerCase();
    if (!['skip', 'rejected', 'discarded'].includes(low)) actionable++;
  }

  return {
    total: apps.length,
    byStatus,
    avgScore: scored ? Math.round((totalScore / scored) * 100) / 100 : 0,
    scored,
    topScore,
    withPdf,
    actionable,
  };
}

function withJobUrls(apps) {
  return apps.map((a) => ({
    ...a,
    jobUrl: jobUrlFromReport(ROOT, a.report) || null,
  }));
}

function cvPath() {
  return join(ROOT, 'cv.md');
}

// ── API: health / CV / profile / portals / jobs / applications ──

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, cloud: isCloudEnabled() });
});

/** Public client bootstrap (anon key is safe for browser; only when cloud is enabled). */
app.get('/api/bootstrap', (_req, res) => {
  res.json({
    cloud: isCloudEnabled(),
    requireAuth: requireApiAuth(),
    supabase: isCloudEnabled()
      ? { url: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY }
      : null,
  });
});

app.get('/api/me', async (req, res) => {
  try {
    if (!isCloudEnabled()) return res.json({ cloud: false, user: null });
    const u = await getSessionUser(req);
    if (!u) return res.json({ cloud: true, user: null });
    res.json({
      cloud: true,
      user: { id: u.user.id, email: u.user.email },
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/auth/session', (req, res) => {
  try {
    if (!isCloudEnabled()) return res.status(400).json({ error: 'Cloud auth not enabled' });
    const access_token = String(req.body?.access_token || '').trim();
    const refresh_token = String(req.body?.refresh_token || '').trim();
    if (!access_token) return res.status(400).json({ error: 'access_token required' });
    attachSessionCookies(res, access_token, refresh_token || null);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/auth/logout', (_req, res) => {
  clearSessionCookies(res);
  res.json({ ok: true });
});

/** Browser-friendly logout (clears cookies and redirects). */
app.get('/logout', (_req, res) => {
  clearSessionCookies(res);
  res.status(302).setHeader('Location', '/welcome').end();
});

/** Server-side email/password (alternative to Supabase client on /auth.html). */
app.post('/api/auth/login', async (req, res) => {
  try {
    if (!isCloudEnabled()) return res.status(400).json({ error: 'Cloud auth not enabled' });
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const sb = createAnonClient();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: error.message });
    if (!data.session) return res.status(401).json({ error: 'No session returned' });
    attachSessionCookies(res, data.session.access_token, data.session.refresh_token);
    res.json({
      ok: true,
      user: { id: data.user.id, email: data.user.email },
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    if (!isCloudEnabled()) return res.status(400).json({ error: 'Cloud auth not enabled' });
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });
    const sb = createAnonClient();
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) return res.status(400).json({ error: error.message });
    if (data.session) {
      attachSessionCookies(res, data.session.access_token, data.session.refresh_token);
      return res.json({
        ok: true,
        user: data.user ? { id: data.user.id, email: data.user.email } : null,
        confirmed: true,
      });
    }
    res.json({
      ok: true,
      needsConfirmation: true,
      email: data.user?.email || email,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** Readiness + counts for the workspace shell (no PII beyond what’s already on disk). */
app.get('/api/workspace', async (req, res) => {
  try {
    const cu = await getSessionUser(req);
    let cvText = '';
    let profile = null;
    let portals = null;
    let apps = [];
    let pending = [];

    if (cu && isCloudEnabled()) {
      const sb = sbFor(cu);
      const cvRaw = await getWorkspaceBody(sb, WS.CV);
      const cvP = cvPath();
      cvText =
        cvRaw != null
          ? String(cvRaw)
          : existsSync(cvP)
            ? readFileSync(cvP, 'utf8')
            : '';
      const profRaw = await getWorkspaceBody(sb, WS.PROFILE);
      try {
        profile =
          profRaw != null && String(profRaw).trim()
            ? yaml.load(profRaw)
            : readProfile(ROOT);
      } catch {
        profile = readProfile(ROOT);
      }
      const portRaw = await getWorkspaceBody(sb, WS.PORTALS);
      try {
        portals =
          portRaw != null && String(portRaw).trim()
            ? yaml.load(portRaw)
            : readPortalsDoc(ROOT);
      } catch {
        portals = readPortalsDoc(ROOT);
      }
      const ctx = await loadApplicationsContext(req);
      apps = ctx.apps;
      const pipPath = join(ROOT, 'data', 'pipeline.md');
      const pipRaw = await getWorkspaceBody(sb, WS.PIPELINE);
      const pipText =
        pipRaw != null && String(pipRaw).trim()
          ? String(pipRaw)
          : existsSync(pipPath)
            ? readFileSync(pipPath, 'utf8')
            : '';
      pending = parsePipelinePendingFromText(pipText, pipPath).pending;
    } else {
      const cvP = cvPath();
      cvText = existsSync(cvP) ? readFileSync(cvP, 'utf8') : '';
      profile = readProfile(ROOT);
      portals = readPortalsDoc(ROOT);
      apps = readApplications().apps;
      pending = parsePipelinePending(ROOT).pending;
    }

    const cvWords = cvText.trim() ? cvText.trim().split(/\s+/).length : 0;

    const name = profile?.candidate?.full_name?.trim();
    const email = profile?.candidate?.email?.trim();
    const headline = profile?.narrative?.headline?.trim();
    const profileOk = !!(name && email) || !!(headline && headline.length > 8);

    const pos = portals?.title_filter?.positive?.length ?? 0;
    let enabledWithApi = 0;
    if (portals?.tracked_companies) {
      for (const c of portals.tracked_companies) {
        if (c.enabled === false) continue;
        if (detectApi(c)) enabledWithApi++;
      }
    }

    const portalsOk = pos >= 2 && enabledWithApi >= 1;

    const setup = {
      cv: cvWords >= 80,
      profile: profileOk,
      portals: portalsOk,
      cvWords,
      positiveKeywordCount: pos,
      enabledPortals: enabledWithApi,
    };

    const complete = setup.cv && setup.profile && setup.portals;

    res.json({
      setup,
      complete,
      counts: {
        pipelinePending: pending.length,
        applications: apps.length,
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put('/api/workspace/document', async (req, res) => {
  try {
    if (!isCloudEnabled()) return res.status(400).json({ error: 'Cloud workspace not enabled' });
    const u = await getSessionUser(req);
    if (!u) return res.status(401).json({ error: 'Sign in required', auth: true });
    const rel = String(req.body?.path || '').trim().replace(/^\/+/, '');
    if (!isWorkspacePathWritable(rel)) {
      return res.status(400).json({ error: 'path not allowed' });
    }
    const body = req.body?.content != null ? String(req.body.content) : '';
    const mimeType = String(req.body?.mimeType || '').trim() || undefined;
    await upsertWorkspaceBody(sbFor(u), u.user.id, rel, body, { mimeType });
    res.json({ ok: true, path: rel });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/pipeline', async (req, res) => {
  try {
    const pipPath = join(ROOT, 'data', 'pipeline.md');
    const cu = await getSessionUser(req);
    if (cu && isCloudEnabled()) {
      const sb = sbFor(cu);
      const raw = await getWorkspaceBody(sb, WS.PIPELINE);
      const text =
        raw != null && String(raw).trim()
          ? String(raw)
          : existsSync(pipPath)
            ? readFileSync(pipPath, 'utf8')
            : '';
      const storage = raw != null && String(raw).trim() ? 'cloud' : 'seed';
      const { path, pending } = parsePipelinePendingFromText(text, pipPath);
      const items = enrichPipelineItems(ROOT, pending);
      return res.json({ path, pending, items, storage });
    }
    const { path, pending } = parsePipelinePending(ROOT);
    const items = enrichPipelineItems(ROOT, pending);
    res.json({ path, pending, items, storage: 'disk' });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * Queue one URL into pipeline Pendientes.
 * Body: { url, company, title, location?, postedAtMs?, includePostedDate? }
 */
app.post('/api/pipeline/queue', async (req, res) => {
  try {
    const url = String(req.body?.url || '').trim();
    const company = String(req.body?.company || 'Company').trim();
    const title = String(req.body?.title || 'Role').trim();
    const location = String(req.body?.location || '').trim();
    let postedAtMs = req.body?.postedAtMs != null ? Number(req.body.postedAtMs) : NaN;
    if (!Number.isFinite(postedAtMs)) postedAtMs = null;
    const showDate = postedAtMs != null;

    if (!/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: 'valid url required' });
    }
    const pipelineFile = join(ROOT, 'data', 'pipeline.md');
    const offer = {
      url,
      company,
      title,
      postedAtMs: showDate ? postedAtMs : null,
      location,
      source: 'web-queue',
    };

    const cu = await getSessionUser(req);
    if (cu && isCloudEnabled()) {
      const sb = sbFor(cu);
      const raw = await getWorkspaceBody(sb, WS.PIPELINE);
      let text =
        raw != null && String(raw).trim()
          ? String(raw)
          : existsSync(pipelineFile)
            ? readFileSync(pipelineFile, 'utf8')
            : '';
      if (!text.trim()) {
        return res.status(404).json({ error: 'data/pipeline.md missing or empty on server' });
      }
      const next = appendOffersToPipelineMarkdown(text, [offer], { showPostedInPipeline: showDate });
      await upsertWorkspaceBody(sb, cu.user.id, WS.PIPELINE, next);
      const pending = parsePipelinePendingFromText(next, pipelineFile).pending;
      return res.status(201).json({ ok: true, pendingCount: pending.length, storage: 'cloud' });
    }

    if (!existsSync(pipelineFile)) {
      return res.status(404).json({ error: 'data/pipeline.md missing' });
    }
    appendToPipeline(ROOT, [offer], { showPostedInPipeline: showDate });
    const { pending } = parsePipelinePending(ROOT);
    res.status(201).json({ ok: true, pendingCount: pending.length, storage: 'disk' });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/cv', async (req, res) => {
  try {
    const p = cvPath();
    const cu = await getSessionUser(req);
    if (cu && isCloudEnabled()) {
      const sb = sbFor(cu);
      const remote = await getWorkspaceBody(sb, WS.CV);
      const content = remote != null ? remote : existsSync(p) ? readFileSync(p, 'utf8') : '';
      return res.json({
        exists: content.trim().length > 0,
        content,
        path: p,
        words: content.trim() ? content.trim().split(/\s+/).length : 0,
        storage: remote != null ? 'cloud' : 'disk',
      });
    }
    const exists = existsSync(p);
    const content = exists ? readFileSync(p, 'utf8') : '';
    res.json({
      exists,
      content,
      path: p,
      words: content ? content.trim().split(/\s+/).length : 0,
      storage: 'disk',
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put('/api/cv', async (req, res) => {
  try {
    const content = req.body?.content != null ? String(req.body.content) : '';
    const p = cvPath();
    const cu = await getSessionUser(req);
    if (cu && isCloudEnabled()) {
      const sb = sbFor(cu);
      await upsertWorkspaceBody(sb, cu.user.id, WS.CV, content);
      return res.json({
        ok: true,
        path: p,
        words: content.trim() ? content.trim().split(/\s+/).length : 0,
        storage: 'cloud',
      });
    }
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content, 'utf8');
    res.json({ ok: true, path: p, words: content.trim() ? content.trim().split(/\s+/).length : 0, storage: 'disk' });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** Upload a resume PDF, parse to text, and store into cv.md (cloud if signed in). */
app.post('/api/cv/import-pdf', async (req, res) => {
  try {
    const cu = await getSessionUser(req);
    if (isCloudEnabled() && !cu) return res.status(401).json({ error: 'Sign in required', auth: true });

    const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: 8 * 1024 * 1024 } });
    let buf = null;
    let filename = '';
    let mimetype = '';

    bb.on('file', (_name, file, info) => {
      filename = info?.filename || '';
      mimetype = info?.mimeType || '';
      const chunks = [];
      file.on('data', (d) => chunks.push(d));
      file.on('limit', () => file.unpipe());
      file.on('end', () => {
        buf = Buffer.concat(chunks);
      });
    });

    bb.on('error', (e) => {
      throw e;
    });

    bb.on('finish', async () => {
      if (!buf || !buf.length) return res.status(400).json({ error: 'pdf file required' });
      if (mimetype && !/pdf/i.test(mimetype) && !/\.pdf$/i.test(filename)) {
        return res.status(400).json({ error: 'Please upload a PDF' });
      }

      const parsed = await pdfParse(buf);
      const text = String(parsed?.text || '').trim();
      if (!text) return res.status(400).json({ error: 'Could not extract text from PDF' });

      const cleaned = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
      const content = cleaned.length > 700_000 ? cleaned.slice(0, 700_000) : cleaned;

      const p = cvPath();
      if (isCloudEnabled() && cu) {
        await upsertWorkspaceBody(sbFor(cu), cu.user.id, WS.CV, content, { mimeType: 'text/markdown' });
        return res.json({ ok: true, words: content.split(/\s+/).filter(Boolean).length, storage: 'cloud' });
      }
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, content, 'utf8');
      res.json({ ok: true, words: content.split(/\s+/).filter(Boolean).length, storage: 'disk' });
    });

    req.pipe(bb);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/cv/manuscript', (_req, res) => {
  try {
    mkdirSync(join(ROOT, 'data'), { recursive: true });
    res.json({ manuscript: readManuscript(ROOT) });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put('/api/cv/manuscript', (req, res) => {
  try {
    mkdirSync(join(ROOT, 'data'), { recursive: true });
    const m = writeManuscript(ROOT, req.body || {});
    const md = buildCvMarkdown(m);
    const p = cvPath();
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, md, 'utf8');
    const words = md.trim() ? md.trim().split(/\s+/).length : 0;
    res.json({ ok: true, manuscript: m, words, path: p });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/profile', async (req, res) => {
  try {
    const cu = await getSessionUser(req);
    if (cu && isCloudEnabled()) {
      const sb = sbFor(cu);
      const raw = await getWorkspaceBody(sb, WS.PROFILE);
      let doc = null;
      if (raw != null && String(raw).trim()) {
        try {
          doc = yaml.load(raw);
        } catch {
          doc = null;
        }
      } else {
        doc = readProfile(ROOT);
      }
      return res.json({ profile: profileSummary(doc), exists: !!doc, storage: raw != null ? 'cloud' : 'disk' });
    }
    const doc = readProfile(ROOT);
    res.json({ profile: profileSummary(doc), exists: !!doc, storage: 'disk' });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put('/api/profile', async (req, res) => {
  try {
    const cu = await getSessionUser(req);
    if (cu && isCloudEnabled()) {
      const sb = sbFor(cu);
      const raw = await getWorkspaceBody(sb, WS.PROFILE);
      let cur = readProfile(ROOT) || {};
      if (raw != null && String(raw).trim()) {
        try {
          cur = yaml.load(raw) || {};
        } catch {
          /* keep disk seed */
        }
      }
      const next = mergeProfilePatch(cur, req.body || {});
      const out = yaml.dump(next, { lineWidth: -1, noRefs: true });
      await upsertWorkspaceBody(sb, cu.user.id, WS.PROFILE, out);
      return res.json({ ok: true, profile: profileSummary(next), storage: 'cloud' });
    }
    const cur = readProfile(ROOT) || {};
    const next = mergeProfilePatch(cur, req.body || {});
    mkdirSync(join(ROOT, 'config'), { recursive: true });
    writeProfile(ROOT, next);
    res.json({ ok: true, profile: profileSummary(next), storage: 'disk' });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/portals', async (req, res) => {
  try {
    const cu = await getSessionUser(req);
    if (cu && isCloudEnabled()) {
      const sb = sbFor(cu);
      const raw = await getWorkspaceBody(sb, WS.PORTALS);
      let doc = null;
      if (raw != null && String(raw).trim()) {
        try {
          doc = yaml.load(raw);
        } catch {
          doc = null;
        }
      } else {
        doc = readPortalsDoc(ROOT);
      }
      if (!doc) return res.status(404).json({ error: 'portals.yml not found' });
      return res.json({ config: summarizeForUi(doc), path: join(ROOT, 'portals.yml'), storage: raw != null ? 'cloud' : 'disk' });
    }
    const doc = readPortalsDoc(ROOT);
    if (!doc) return res.status(404).json({ error: 'portals.yml not found' });
    res.json({ config: summarizeForUi(doc), path: join(ROOT, 'portals.yml'), storage: 'disk' });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put('/api/portals', async (req, res) => {
  try {
    const cu = await getSessionUser(req);
    if (cu && isCloudEnabled()) {
      const sb = sbFor(cu);
      const raw = await getWorkspaceBody(sb, WS.PORTALS);
      let doc = readPortalsDoc(ROOT);
      if (raw != null && String(raw).trim()) {
        try {
          doc = yaml.load(raw);
        } catch {
          /* keep disk */
        }
      }
      if (!doc) return res.status(404).json({ error: 'portals.yml not found' });
      const next = applyPortalsPatch(doc, req.body || {});
      const out = yaml.dump(next, {
        lineWidth: -1,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false,
      });
      await upsertWorkspaceBody(sb, cu.user.id, WS.PORTALS, out);
      return res.json({ ok: true, config: summarizeForUi(next), storage: 'cloud' });
    }
    const doc = readPortalsDoc(ROOT);
    if (!doc) return res.status(404).json({ error: 'portals.yml not found' });
    const next = applyPortalsPatch(doc, req.body || {});
    writePortalsDoc(ROOT, next);
    res.json({ ok: true, config: summarizeForUi(next), storage: 'disk' });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/presets/focus', (_req, res) => {
  res.json(FOCUS_PRESETS);
});

/**
 * Preview jobs from current portals.yml (same filters as node scan.mjs).
 * Body: { respectDedup?, recency?, companyFilter?, allLocations?, maxJobs? }
 * recency: 'day' | 'week' | 'month' | null
 */
app.post('/api/jobs/preview', async (req, res) => {
  try {
    const doc = readPortalsDoc(ROOT);
    if (!doc) return res.status(404).json({ error: 'portals.yml not found' });

    const {
      respectDedup = false,
      recency = null,
      companyFilter = null,
      allLocations = false,
      maxJobs = 400,
    } = req.body || {};

    let recencyCutoffMs = null;
    if (recency === 'day') recencyCutoffMs = Date.now() - 24 * 60 * 60 * 1000;
    else if (recency === 'week') recencyCutoffMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    else if (recency === 'month') recencyCutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const { offers, errors, stats } = await collectMatchingJobs(ROOT, doc, {
      allLocations: !!allLocations,
      filterCompany: companyFilter || null,
      recencyCutoffMs,
      respectDedup: !!respectDedup,
      maxJobs: Math.min(Number(maxJobs) || 400, 8000),
    });

    const rows = offers.map((o) => ({
      company: o.company,
      title: o.title,
      location: o.location || '',
      url: o.url,
      posted: formatPostedYmd(o.postedAtMs),
      postedAtMs: o.postedAtMs,
      source: o.source,
    }));

    res.json({
      jobs: rows,
      stats,
      errors,
      respectDedup,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/states', (_req, res) => {
  res.json({ states: loadCanonicalStates() });
});

/** List interview notebooks (labels only in UI; names are internal ids). */
app.get('/api/interview-prep', async (req, res) => {
  try {
    if (isCloudEnabled()) {
      const u = await getSessionUser(req);
      if (!u) return res.status(401).json({ error: 'Sign in required', auth: true });
      const sb = supabaseForAccessToken(u.accessToken);
      const items = await listInterviewPrepItemsRemote(sb, u.user.id);
      return res.json({ items });
    }
    const items = listInterviewPrepItems(ROOT);
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/interview-prep/content', async (req, res) => {
  try {
    const name = String(req.query.name || 'story-bank.md');
    if (isCloudEnabled()) {
      const u = await getSessionUser(req);
      if (!u) return res.status(401).json({ error: 'Sign in required', auth: true });
      const sb = supabaseForAccessToken(u.accessToken);
      const doc = await readInterviewPrepDocRemote(sb, u.user.id, name);
      return res.json(doc);
    }
    const doc = readInterviewPrepDoc(ROOT, name);
    res.json(doc);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.put('/api/interview-prep/content', async (req, res) => {
  try {
    const name = String(req.query.name || '');
    if (!name) return res.status(400).json({ error: 'name query required' });
    const content = req.body?.content != null ? String(req.body.content) : '';
    if (isCloudEnabled()) {
      const u = await getSessionUser(req);
      if (!u) return res.status(401).json({ error: 'Sign in required', auth: true });
      const sb = supabaseForAccessToken(u.accessToken);
      await writeInterviewPrepDocRemote(sb, u.user.id, name, content);
      return res.json({ ok: true });
    }
    writeInterviewPrepDoc(ROOT, name, content);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.post('/api/interview-prep/create', async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const filename = String(req.body?.filename || '').trim();
    if (isCloudEnabled()) {
      const u = await getSessionUser(req);
      if (!u) return res.status(401).json({ error: 'Sign in required', auth: true });
      const sb = supabaseForAccessToken(u.accessToken);
      let out;
      if (title) out = await createInterviewPrepFromTitleRemote(sb, u.user.id, title);
      else if (filename) out = await createInterviewPrepDocRemote(sb, u.user.id, filename);
      else return res.status(400).json({ error: 'title required' });
      return res.status(201).json({ ok: true, name: out.name });
    }
    let out;
    if (title) out = createInterviewPrepFromTitle(ROOT, title);
    else if (filename) out = createInterviewPrepDoc(ROOT, filename);
    else return res.status(400).json({ error: 'title required' });
    res.status(201).json({ ok: true, name: out.name });
  } catch (e) {
    const msg = String(e.message || e);
    const code = msg.includes('already') || msg.includes('exists') ? 409 : 400;
    res.status(code).json({ error: msg });
  }
});

/** Find or create company prep notebook for a ledger row (by company + role). */
app.post('/api/interview-prep/ensure', async (req, res) => {
  try {
    const company = String(req.body?.company ?? '').trim();
    const role = String(req.body?.role ?? '').trim();
    if (isCloudEnabled()) {
      const u = await getSessionUser(req);
      if (!u) return res.status(401).json({ error: 'Sign in required', auth: true });
      const sb = supabaseForAccessToken(u.accessToken);
      const out = await ensurePrepNotebookRemote(sb, u.user.id, company, role);
      return res.json({ ok: true, ...out });
    }
    const out = ensurePrepNotebook(ROOT, company, role);
    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

/** Seed prep from evaluation report linked on the application row. */
app.post('/api/interview-prep/from-report', async (req, res) => {
  try {
    const num = parseInt(String(req.body?.num ?? ''), 10);
    if (Number.isNaN(num) || num < 1) return res.status(400).json({ error: 'num required' });
    const { apps } = readApplications();
    const row = apps.find((a) => a.num === num);
    if (!row) return res.status(404).json({ error: 'application not found' });
    const reportPath = resolveReportFileUnderRoot(ROOT, row.report);
    if (!reportPath) return res.status(400).json({ error: 'no report file linked for this row' });
    if (isCloudEnabled()) {
      const u = await getSessionUser(req);
      if (!u) return res.status(401).json({ error: 'Sign in required', auth: true });
      const sb = supabaseForAccessToken(u.accessToken);
      const out = await applyReportSeedToNotebookRemote(sb, u.user.id, row.company, row.role, num, reportPath);
      return res.json({ ok: true, ...out });
    }
    const out = applyReportSeedToNotebook(ROOT, row.company, row.role, num, reportPath);
    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

/** Story snippets + prep questions for rehearsal UI. */
app.get('/api/interview-prep/rehearsal', async (req, res) => {
  try {
    const num = parseInt(String(req.query.num ?? ''), 10);
    if (Number.isNaN(num) || num < 1) return res.status(400).json({ error: 'num query required' });
    const { apps } = readApplications();
    const row = apps.find((a) => a.num === num);
    if (!row) return res.status(404).json({ error: 'application not found' });
    if (isCloudEnabled()) {
      const u = await getSessionUser(req);
      if (!u) return res.status(401).json({ error: 'Sign in required', auth: true });
      const sb = supabaseForAccessToken(u.accessToken);
      const pack = await buildRehearsalPackRemote(sb, u.user.id, row.company, row.role);
      return res.json({ ok: true, applicationNum: num, ...pack });
    }
    const pack = await buildRehearsalPack(ROOT, row.company, row.role);
    res.json({ ok: true, applicationNum: num, ...pack });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

/** Whitelisted npm/node scripts (see README + package.json). */
app.get('/api/commands', (_req, res) => {
  try {
    res.json({ commands: listCommandsForApi() });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/commands/run', async (req, res) => {
  try {
    const raw = req.body || {};
    const id = String(raw.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id required' });
    const { id: _drop, ...opts } = raw;
    const result = await runCommand(ROOT, id, opts);
    const ok = result.exitCode === 0 && !result.timedOut;
    res.json({ ok, ...result });
  } catch (e) {
    const msg = String(e.message || e);
    const code = /unknown command|invalid|required|must stay/.test(msg) ? 400 : 500;
    res.status(code).json({ error: msg });
  }
});

app.get('/api/applications', async (req, res) => {
  try {
    const ctx = await loadApplicationsContext(req);
    const { apps, path, remote, cloudDocExists } = ctx;
    const storage = remote ? (cloudDocExists ? 'cloud' : 'seed') : 'disk';
    res.json({
      applications: withJobUrls(apps),
      metrics: computeMetrics(apps),
      weather: computePipelineWeather(ROOT, apps),
      path,
      storage,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** Compare 2–3 offers using fields parsed from linked reports. */
app.post('/api/reports/compare', async (req, res) => {
  try {
    let nums = req.body?.nums;
    if (!Array.isArray(nums)) nums = [];
    nums = [...new Set(nums.map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n)))];
    if (nums.length < 2 || nums.length > 3) {
      return res.status(400).json({ error: 'pick 2 or 3 application numbers' });
    }
    const { apps } = await loadApplicationsContext(req);
    const rows = [];
    for (const n of nums) {
      const row = apps.find((a) => a.num === n);
      if (!row) return res.status(404).json({ error: `no application #${n}` });
      const sig = readReportSignals(ROOT, row.report);
      rows.push({
        num: n,
        company: row.company,
        role: row.role,
        score: row.score,
        signals: sig.error ? { error: sig.error } : sig,
      });
    }
    res.json({ rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** Side-by-side score dimensions from two reports (calibration / “what moved”). */
app.post('/api/reports/score-compare', async (req, res) => {
  try {
    const a = parseInt(req.body?.a, 10);
    const b = parseInt(req.body?.b, 10);
    if (Number.isNaN(a) || Number.isNaN(b) || a === b) {
      return res.status(400).json({ error: 'pick two different application numbers' });
    }
    const { apps } = await loadApplicationsContext(req);
    const ra = apps.find((x) => x.num === a);
    const rb = apps.find((x) => x.num === b);
    if (!ra || !rb) return res.status(404).json({ error: 'application not found' });
    const sa = readReportSignals(ROOT, ra.report);
    const sb = readReportSignals(ROOT, rb.report);
    if (sa.error) return res.status(400).json({ error: `#${a}: ${sa.error}` });
    if (sb.error) return res.status(400).json({ error: `#${b}: ${sb.error}` });
    const dims = ['cvMatch', 'northStar', 'compScore', 'cultural', 'redFlags', 'global'];
    const labels = {
      cvMatch: 'CV match',
      northStar: 'North Star',
      compScore: 'Comp',
      cultural: 'Cultural',
      redFlags: 'Red flags',
      global: 'Global',
    };
    const dimensions = dims.map((k) => ({
      key: k,
      label: labels[k],
      left: sa.dimensions[k],
      right: sb.dimensions[k],
      delta:
        sa.dimensions[k] != null && sb.dimensions[k] != null
          ? Math.round((sb.dimensions[k] - sa.dimensions[k]) * 100) / 100
          : null,
    }));
    res.json({
      left: { num: a, company: ra.company, role: ra.role, headerScore: sa.headerScore },
      right: { num: b, company: rb.company, role: rb.role, headerScore: sb.headerScore },
      dimensions,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/applications/:num', async (req, res) => {
  try {
    const num = parseInt(req.params.num, 10);
    if (Number.isNaN(num)) return res.status(400).json({ error: 'bad num' });
    const { apps, rawHeader } = await loadApplicationsContext(req);
    const row = apps.find((a) => a.num === num);
    if (!row) return res.status(404).json({ error: 'not_found' });
    res.json({
      application: { ...row, jobUrl: jobUrlFromReport(ROOT, row.report) },
      rawHeader,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** Report excerpts + parsed signals for filling application forms (Apply desk). */
app.get('/api/applications/:num/apply-pack', async (req, res) => {
  try {
    const num = parseInt(req.params.num, 10);
    if (Number.isNaN(num)) return res.status(400).json({ error: 'bad num' });
    const { apps } = await loadApplicationsContext(req);
    const row = apps.find((a) => a.num === num);
    if (!row) return res.status(404).json({ error: 'not_found' });
    const jobUrl = jobUrlFromReport(ROOT, row.report);
    const pack = buildApplyPack(ROOT, row.report);
    res.json({
      application: { ...row, jobUrl },
      ...pack,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** Report excerpts + profile signals for LinkedIn outreach (contacto framework). */
app.get('/api/applications/:num/outreach-pack', async (req, res) => {
  try {
    const num = parseInt(req.params.num, 10);
    if (Number.isNaN(num)) return res.status(400).json({ error: 'bad num' });
    const { apps } = await loadApplicationsContext(req);
    const row = apps.find((a) => a.num === num);
    if (!row) return res.status(404).json({ error: 'not_found' });
    const jobUrl = jobUrlFromReport(ROOT, row.report);
    const pack = buildOutreachPack(ROOT, row.report);
    res.json({
      application: { ...row, jobUrl },
      ...pack,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.patch('/api/applications/:num', async (req, res) => {
  try {
    const num = parseInt(req.params.num, 10);
    if (Number.isNaN(num)) return res.status(400).json({ error: 'bad num' });
    const body = req.body || {};
    const {
      decisionNote,
      logPreApply,
      preApplyCustomized,
      preApplyVerified,
      ...patchFields
    } = body;

    const ctx = await loadApplicationsContext(req);
    const { apps, rawHeader, cu, sb, remote } = ctx;
    const prev = apps.find((a) => a.num === num);
    const result = updateApp(apps, num, patchFields);
    if (!result.ok) return res.status(404).json({ error: result.error });

    if (remote && cu && sb) {
      await upsertWorkspaceBody(
        sb,
        cu.user.id,
        WS.APPLICATIONS,
        serializeApplications(result.apps, rawHeader),
      );
    } else {
      writeApplications(result.apps, rawHeader);
    }
    const appRow = result.app;

    const prevSt = prev ? normalizeStatus(prev.status) : '';
    const nextSt = normalizeStatus(appRow.status);
    const iso = new Date().toISOString();

    if (!remote) {
      try {
        if (prev && prevSt !== nextSt && String(decisionNote || '').trim()) {
          appendDecisionEntrySync(ROOT, {
            iso,
            num,
            company: appRow.company,
            role: appRow.role,
            fromStatus: prevSt,
            toStatus: nextSt,
            note: String(decisionNote).trim(),
          });
        }
        if (
          logPreApply &&
          prev &&
          prevSt !== 'Applied' &&
          nextSt === 'Applied'
        ) {
          appendPreApplyChecklistSync(ROOT, {
            iso,
            num,
            company: appRow.company,
            role: appRow.role,
            customized: !!preApplyCustomized,
            verifiedLive: !!preApplyVerified,
          });
        }
      } catch (err) {
        console.error('desk journal:', err.message);
      }
    }

    res.json({
      application: { ...appRow, jobUrl: jobUrlFromReport(ROOT, appRow.report) },
      metrics: computeMetrics(result.apps),
      weather: computePipelineWeather(ROOT, result.apps),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/applications', async (req, res) => {
  try {
    const ctx = await loadApplicationsContext(req);
    const { apps, rawHeader, cu, sb, remote } = ctx;
    const { apps: next, app: row } = addApp(apps, req.body || {});
    if (remote && cu && sb) {
      await upsertWorkspaceBody(sb, cu.user.id, WS.APPLICATIONS, serializeApplications(next, rawHeader));
    } else {
      writeApplications(next, rawHeader);
    }
    res.status(201).json({
      application: { ...row, jobUrl: jobUrlFromReport(ROOT, row.report) },
      metrics: computeMetrics(next),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** Save pasted external JD to jds/, build HTML, run generate-pdf.mjs (Playwright). */
app.post('/api/desk/jd-reference-pdf', async (req, res) => {
  try {
    const body = req.body || {};
    const company = String(body.company || '').trim();
    const role = String(body.role || '').trim();
    const url = String(body.url || '').trim();
    const jd = String(body.body || '').trim();
    const format = body.format === 'letter' ? 'letter' : 'a4';
    if (!jd) return res.status(400).json({ error: 'Paste the job description text (required).' });
    if (jd.length > 500_000) return res.status(400).json({ error: 'Job description too long (max 500k characters).' });

    const slug = `${Date.now()}-${slugifyDesk(`${company} ${role}`)}`;
    const mdName = `desk-external-${slug}.md`;
    const mdPath = join(ROOT, 'jds', mdName);
    const htmlPathRel = 'output/jd-external-latest.html';
    const pdfPathRel = 'output/jd-external-latest.pdf';

    const md = [
      '# External job description (saved from Desk)',
      '',
      `- **Saved:** ${new Date().toISOString()}`,
      company ? `- **Company:** ${company}` : null,
      role ? `- **Role:** ${role}` : null,
      url ? `- **URL:** ${url}` : null,
      '',
      '## Posting text',
      '',
      jd,
      '',
    ]
      .filter(Boolean)
      .join('\n');

    mkdirSync(join(ROOT, 'jds'), { recursive: true });
    mkdirSync(join(ROOT, 'output'), { recursive: true });
    writeFileSync(mdPath, md, 'utf8');

    const html = buildJdReferenceHtml({
      company: company || '—',
      role: role || '—',
      url,
      body: jd,
    });
    writeFileSync(join(ROOT, htmlPathRel), html, 'utf8');

    const result = await runCommand(ROOT, 'generate-pdf', {
      inputHtml: htmlPathRel,
      outputPdf: pdfPathRel,
      format,
    });

    const ok = result.exitCode === 0 && !result.timedOut;
    res.json({
      ok,
      markdownPath: `jds/${mdName}`,
      htmlPath: htmlPathRel,
      pdfPath: pdfPathRel,
      ...result,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

const IS_PROD_STATIC_CACHE =
  process.env.NODE_ENV === 'production' || process.env.CAREER_OPS_STATIC_CACHE === '1';
const STATIC_PUBLIC_MAX_MS = IS_PROD_STATIC_CACHE ? 60 * 60 * 1000 : 0;

const DESK_SHELL = join(PUBLIC, 'desk.html');
const WELCOME_HTML = join(PUBLIC, 'welcome.html');

/** Landing is always the Welcome page (even if signed in). */
app.get('/', (req, res, next) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    return res.sendFile(WELCOME_HTML);
  } catch (e) {
    next(e);
  }
});

/** Desk shell lives under `/desk` so `/` can stay a landing page. */
app.get('/desk', async (req, res, next) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (isDeskAuthEnforced()) {
      const u = await getSessionUser(req);
      if (!u) return res.status(302).setHeader('Location', '/welcome?next=/desk').end();
    }
    return res.sendFile(DESK_SHELL);
  } catch (e) {
    next(e);
  }
});

app.use(
  express.static(PUBLIC, {
    maxAge: STATIC_PUBLIC_MAX_MS,
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      if (STATIC_PUBLIC_MAX_MS === 0) {
        res.setHeader('Cache-Control', 'no-store');
        return;
      }
      const lower = String(filePath).toLowerCase();
      if (lower.endsWith('.html') || lower.endsWith('.mjs') || lower.endsWith('.js')) {
        res.setHeader('Cache-Control', 'private, no-cache');
        return;
      }
      res.setHeader('Cache-Control', `public, max-age=${Math.floor(STATIC_PUBLIC_MAX_MS / 1000)}`);
    },
  }),
);

const reportsStaticHandler = express.static(join(ROOT, 'reports'));
const outputStaticHandler = express.static(join(ROOT, 'output'));

app.use('/reports', async (req, res, next) => {
  try {
    const u = await getSessionUser(req);
    if (requireApiAuth() && !u) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res
        .status(401)
        .send('<p>Sign in required.</p><p><a href="/welcome">Continue</a></p>');
    }
    if (req.method === 'GET' && isCloudEnabled() && u && /\.md$/i.test(req.path)) {
      const clean = req.path.replace(/^\//, '');
      if (clean && !clean.includes('..') && !clean.includes('/')) {
        const docPath = `reports/${clean}`;
        const body = await getWorkspaceBody(sbFor(u), docPath);
        if (body != null && String(body).trim()) {
          res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
          return res.send(body);
        }
      }
    }
    reportsStaticHandler(req, res, next);
  } catch (e) {
    next(e);
  }
});

app.use('/output', async (req, res, next) => {
  try {
    const u = await getSessionUser(req);
    if (requireApiAuth() && !u) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res
        .status(401)
        .send('<p>Sign in required.</p><p><a href="/welcome">Continue</a></p>');
    }
    outputStaticHandler(req, res, next);
  } catch (e) {
    next(e);
  }
});

app.get('/welcome', (_req, res) => {
  res.sendFile(join(PUBLIC, 'welcome.html'));
});

app.get('/signup', (_req, res) => {
  res.sendFile(join(PUBLIC, 'signup.html'));
});

app.get('*', (req, res) => {
  // Keep SPA deep-links working under `/desk/*`; everything else returns the landing.
  if (req.path === '/desk' || req.path.startsWith('/desk/')) return res.sendFile(DESK_SHELL);
  res.sendFile(WELCOME_HTML);
});

export default app;

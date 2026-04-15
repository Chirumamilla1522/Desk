/**
 * Supabase workspace_documents paths for signed-in cloud users (see supabase/migrations).
 */

export const WS = {
  CV: 'cv.md',
  MANUSCRIPT: 'data/cv-manuscript.json',
  PROFILE: 'config/profile.yml',
  PORTALS: 'portals.yml',
  APPLICATIONS: 'data/applications.md',
  PIPELINE: 'data/pipeline.md',
};

/** Paths allowed for PUT /api/workspace/document (single-segment report + prep filenames). */
export const WORKSPACE_WRITABLE_PATH_RE =
  /^(reports\/[^/]+\.md|cv\.md|data\/cv-manuscript\.json|config\/profile\.yml|portals\.yml|data\/applications\.md|data\/pipeline\.md|interview-prep\/[^/]+\.md)$/;

export function isWorkspacePathWritable(rel) {
  return WORKSPACE_WRITABLE_PATH_RE.test(String(rel || '').trim().replace(/^\/+/, ''));
}

const MIME_UPSERT_ALLOW = new Set(['text/markdown', 'text/plain', 'application/yaml', 'text/yaml']);

export async function getWorkspaceBody(sb, path) {
  const { data, error } = await sb.from('workspace_documents').select('body').eq('path', path).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.body ?? null;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} userId
 * @param {string} path
 * @param {string} body
 * @param {{ mimeType?: string }} [opts]
 */
export async function upsertWorkspaceBody(sb, userId, path, body, opts = {}) {
  const row = {
    user_id: userId,
    path,
    body: String(body ?? ''),
    updated_at: new Date().toISOString(),
  };
  const mt = String(opts.mimeType || '').trim();
  if (mt && MIME_UPSERT_ALLOW.has(mt)) row.mime_type = mt;
  const { error } = await sb.from('workspace_documents').upsert(row, { onConflict: 'user_id,path' });
  if (error) throw new Error(error.message);
}

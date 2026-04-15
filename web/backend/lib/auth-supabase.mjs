/**
 * Optional Supabase auth for hosted Desk (cookie + Bearer token).
 */
import { createClient } from '@supabase/supabase-js';

export const COOKIE_ACCESS = 'co_access';
export const COOKIE_REFRESH = 'co_refresh';

export function isCloudEnabled() {
  return (
    process.env.CAREER_OPS_CLOUD === '1' &&
    Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
  );
}

/**
 * When true: anonymous users cannot use most `/api/*` routes; `/reports` and `/output` are gated;
 * the Desk redirects to `/auth.html` before loading the ledger.
 * Cloud mode implies this unless `CAREER_OPS_ALLOW_ANON_DESK=1` (e.g. local dev with optional sign-in).
 */
export function isDeskAuthEnforced() {
  return isCloudEnabled() && process.env.CAREER_OPS_ALLOW_ANON_DESK !== '1';
}

export function createAnonClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
}

export function supabaseForAccessToken(accessToken) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * @returns {Promise<{ user: import('@supabase/supabase-js').User; accessToken: string } | null>}
 */
export async function getSessionUser(req) {
  let token = null;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) token = auth.slice(7).trim();
  if (!token && req.cookies?.[COOKIE_ACCESS]) token = String(req.cookies[COOKIE_ACCESS]);
  if (!token) return null;
  const sb = createAnonClient();
  const {
    data: { user },
    error,
  } = await sb.auth.getUser(token);
  if (error || !user) return null;
  return { user, accessToken: token };
}

export function attachSessionCookies(res, accessToken, refreshToken) {
  const base = {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
    secure: process.env.NODE_ENV === 'production',
  };
  res.cookie(COOKIE_ACCESS, accessToken, base);
  if (refreshToken) res.cookie(COOKIE_REFRESH, refreshToken, base);
}

export function clearSessionCookies(res) {
  const base = { path: '/', secure: process.env.NODE_ENV === 'production' };
  res.clearCookie(COOKIE_ACCESS, base);
  res.clearCookie(COOKIE_REFRESH, base);
}

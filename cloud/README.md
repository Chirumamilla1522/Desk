# Career-Ops cloud (optional)

Hosted sign-in and per-user storage for the Desk use **Supabase** (Postgres + Auth). The local-first workflow (`npm run web` on your laptop) is unchanged when cloud env vars are unset.

## What works in cloud mode today

- Email **sign up / sign in** via Supabase Auth (`/auth.html` on your web server).
- **Interview prep** notebooks stored per user in `workspace_documents` (paths `interview-prep/*.md`).
- Session cookie so the existing Desk UI can call APIs with `credentials: 'same-origin'`.

Ledger, CV, portals, scans, and reports still read the **server filesystem** (`CAREER_OPS_ROOT`). For a fully portable hosted workspace, migrate those next (same table pattern or normalized tables).

## 1. Create a Supabase project

1. [supabase.com](https://supabase.com) → New project → note **Project URL** and **anon public** key.
2. SQL → run the migrations in `supabase/migrations/` in filename order (at minimum `20260412120000_workspace_documents.sql`, then `20260415120000_workspace_documents_metadata.sql` for `created_at` / `mime_type`). Paste and execute in the SQL editor, or use `supabase db push`.

## 2. Enable Email auth

Authentication → Providers → **Email** enabled (default). Optionally disable public sign-ups later under Auth settings.

## 3. Environment variables

Set when running the Desk server. Easiest locally: create **`.env`** in the **repo root** (same folder as `package.json`) with:

```bash
CAREER_OPS_CLOUD=1
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

`npm run web` loads that file automatically (via `web/load-env.mjs`). You can still use `export …` in the shell or direnv if you prefer.

Do **not** put the **service role** key in the web server process for this MVP (we use the anon key + user JWT so RLS applies).

## 4. Run the server

```bash
npm run web
```

With cloud env vars set, opening the Desk root redirects to **`/auth.html`** until you sign in (or use **`/signup`**). For local testing with the ledger **without** signing in while cloud is enabled, set **`CAREER_OPS_ALLOW_ANON_DESK=1`** (see `docs/HOSTED_AUTH.md`).

The Desk loads `/api/me` (session) and `/api/bootstrap` (includes `requireAuth` and Supabase URL + anon key for the auth page). When the gate is on, protected routes return **401** with `{ auth: true }` until cookies are set.

## 5. Deploy

Use any Node host (Fly.io, Railway, Render, etc.): set the same env vars, bind `PORT`/`HOST` as needed, and use HTTPS in production so cookies stay secure.

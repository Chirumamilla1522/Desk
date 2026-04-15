# Hosted Desk (login + cloud storage)

When the Desk is run with **Supabase**, users can **sign up / sign in** and keep **CV, profile, portals, applications tracker, and pipeline** in the `workspace_documents` table (per-user rows in Supabase).

## Environment variables

Set on the server process. For **`npm run web`**, put variables in a **`.env` file at the repo root** (next to `package.json`); the script preloads it via `web/load-env.mjs` so you do **not** need direnv. Your host (Fly, Railway, etc.) can inject the same names without a file.

| Variable | Meaning |
|----------|---------|
| `CAREER_OPS_CLOUD=1` | Enable Supabase auth + remote workspace APIs. |
| `CAREER_OPS_ALLOW_ANON_DESK=1` | **Optional opt-out** from the hosted gate: when cloud is on, allow the ledger and APIs without signing in (local testing or mixed disk + cloud). If unset, cloud mode **requires** sign-in before the Desk loads. |
| `SUPABASE_URL` | Project URL. |
| `SUPABASE_ANON_KEY` | Public anon key (also exposed to the browser via `GET /api/bootstrap` for optional client-side Supabase auth). |

Without `CAREER_OPS_CLOUD`, the Desk stays **local-only** (data on disk, no login pages).

To run the Desk on **Vercel**, see **`docs/VERCEL.md`** (Express export, `public/` sync, and filesystem limits).

## Database

Run the migration in `supabase/migrations/20260412120000_workspace_documents.sql` (Supabase SQL editor or `supabase db push`). It creates `workspace_documents` with RLS so each user only reads/writes their own rows.

## Auth flows

1. **`/auth.html`**: email/password form calls **`POST /api/auth/login`**; the server talks to Supabase and sets HTTP-only session cookies (no Supabase JS or CDN on the page).
2. **Legacy / optional**: `POST /api/auth/session` if you already have tokens from another client.
3. **Server-only signup** (`/signup` → `signup.html`): `POST /api/auth/signup` only (no Supabase client on the page). After email confirmation (if required), use `/auth.html` to sign in.

`POST /api/auth/logout` clears cookies.

### Hosted gate (default with cloud)

With cloud enabled and **without** `CAREER_OPS_ALLOW_ANON_DESK=1`:

- The browser is sent to **`/auth.html`** (or you can open **`/signup`**) before the main Desk loads.
- Public `/api` routes (no session): `GET /api/health`, `GET /api/bootstrap`, `GET /api/states`, `GET /api/me`, and everything under `/api/auth/*`. All other `/api/*` calls return **401** with `{ "auth": true }` until cookies are set.
- **`/reports`** and **`/output`** also require a session for anonymous users.

`GET /api/bootstrap` includes **`requireAuth`** (`true` when the gate is active) so the Desk can redirect before calling protected APIs.

### Reports in the cloud

For signed-in cloud users, **`GET /reports/{file}.md`** first serves the body from `workspace_documents` at path `reports/{file}.md` when a non-empty row exists; otherwise it falls back to files on the server disk.

`PUT /api/workspace/document` (JSON `{ "path", "content", "mimeType"? }`) can upsert allowed paths, including `reports/*.md` (single path segment, no `..`). Optional `mimeType` must be one of `text/markdown`, `text/plain`, `application/yaml`, `text/yaml` (otherwise it is ignored and the table default applies). PDFs and other binaries are not stored in `workspace_documents`; generated PDFs remain under `/output` on disk (or add Supabase Storage later).

## What syncs to the cloud

When `CAREER_OPS_CLOUD=1` and the request has a valid session, these document paths are stored in Supabase (see `web/backend/lib/workspace-remote.mjs`):

- `cv.md`
- `config/profile.yml`
- `portals.yml`
- `data/applications.md`
- `data/pipeline.md`

**Interview prep** notebooks already used the same table (`interview-prep/*.md`).

Report **markdown** can live in Supabase when uploaded or synced to `workspace_documents` (see above). **PDFs**, CLI scripts, and `scan-history` still use the server’s career-ops **workspace directory on disk** unless you add object storage later.

## Local vs signed-in cloud

- **Cloud + gate (default)**: you must sign in; then the listed documents are read/written in Supabase; empty remote docs fall back to **server disk** as a one-time template until you save.
- **Cloud + `CAREER_OPS_ALLOW_ANON_DESK=1`**: not signed in — APIs read/write files under the repo root like local mode; sign in when you want Supabase-backed workspace sync.
- **No cloud**: local disk only, no auth UI.

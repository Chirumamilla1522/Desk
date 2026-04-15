# Deploying the Desk on Vercel

[Vercel](https://vercel.com) can host the Career-Ops **Desk** (Express + static UI) as a single serverless function plus CDN static files.

## How it works

- **Root `server.mjs`** exports the Express app (`web/backend/app.mjs`) for Vercel’s [Express integration](https://vercel.com/docs/frameworks/backend/express).
- **`npm run build`** copies `web/frontend` → **`public/`** so Vercel’s CDN can serve the UI. On Vercel, `express.static` for the frontend is not used for assets; the copy is required.
- **Local dev** is unchanged: `npm run web` runs `web/backend/server.mjs` with a real HTTP listener.

## One-time setup

1. Push the repo to GitHub (or connect any Git provider Vercel supports).
2. **New Project** → import the repo.
3. **Build command:** `npm run build` (default if Vercel detects it).
4. **Output directory:** leave empty (not a static export site).
5. **Environment variables** (Production / Preview), same names as local `.env`:
   - `CAREER_OPS_CLOUD=1`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - Optional: `CAREER_OPS_ALLOW_ANON_DESK=1` if you want the ledger without sign-in while cloud is on.

## Limitations (important)

- **Filesystem:** Serverless functions have a **read-only** filesystem except `/tmp`. Writing to `data/`, `reports/`, `output/`, etc. on the deployment disk **will not persist** across invocations. Use **Supabase** (`workspace_documents`) for cloud-backed docs, or attach external storage later.
- **Long-running / Playwright:** Anything that expects a full machine (e.g. Playwright PDF generation in-process) may not be suitable for Vercel’s limits; keep heavy jobs on your laptop or a VM.
- **Secrets:** Never put the Supabase **service role** key in Vercel env for this app; use the **anon** key plus user JWT (same as local hosted mode).

## Verify

After deploy, open your Vercel URL → you should get the Desk UI from `public/`, and `GET /api/health` should return JSON from the Express app.

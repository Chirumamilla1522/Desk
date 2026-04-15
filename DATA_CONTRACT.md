# Data Contract

This document defines which files belong to the **system** (auto-updatable) and which belong to the **user** (never touched by updates).

## User Layer (NEVER auto-updated)

These files contain your personal data, customizations, and work product. Updates will NEVER modify them.

| File | Purpose |
|------|---------|
| `cv.md` | Your CV in markdown |
| `config/profile.yml` | Your identity, target roles & companies, comp range |
| `modes/_profile.md` | Your archetypes, narrative, negotiation scripts |
| `article-digest.md` | Your proof points from portfolio |
| `interview-prep/story-bank.md` | Your accumulated STAR+R stories |
| `portals.yml` | Your customized company list |
| `data/applications.md` | Your application tracker |
| `data/pipeline.md` | Your URL inbox |
| `data/scan-history.tsv` | Your scan history |
| `data/follow-ups.md` | Your follow-up history |
| `reports/*` | Your evaluation reports |
| `output/*` | Your generated PDFs |
| `jds/*` | Your saved job descriptions |

## System Layer (safe to auto-update)

These files contain system logic, scripts, templates, and instructions that improve with each release.

| File | Purpose |
|------|---------|
| `modes/_shared.md` | Scoring system, global rules, tools |
| `modes/oferta.md` | Evaluation mode instructions |
| `modes/pdf.md` | PDF generation instructions |
| `modes/scan.md` | Portal scanner instructions |
| `modes/batch.md` | Batch processing instructions |
| `modes/apply.md` | Application assistant instructions |
| `modes/auto-pipeline.md` | Auto-pipeline instructions |
| `modes/contacto.md` | LinkedIn outreach instructions |
| `modes/deep.md` | Research prompt instructions |
| `modes/ofertas.md` | Comparison instructions |
| `modes/pipeline.md` | Pipeline processing instructions |
| `modes/project.md` | Project evaluation instructions |
| `modes/tracker.md` | Tracker instructions |
| `modes/training.md` | Training evaluation instructions |
| `modes/patterns.md` | Pattern analysis instructions |
| `modes/followup.md` | Follow-up cadence instructions |
| `modes/de/*` | German language modes |
| `CLAUDE.md` | Agent instructions |
| `AGENTS.md` | Codex instructions |
| `*.mjs` | Utility scripts |
| `scan-location-filter.mjs` | US location rules for `scan.mjs` |
| `batch/batch-prompt.md` | Batch worker prompt |
| `batch/batch-runner.sh` | Batch orchestrator |
| `dashboard/*` | Go TUI dashboard |
| `templates/*` | Base templates |
| `fonts/*` | Self-hosted fonts |
| `.claude/skills/*` | Skill definitions |
| `docs/*` | Documentation |
| `VERSION` | Current version number |
| `DATA_CONTRACT.md` | This file |

## Supabase (`workspace_documents`)

When the Desk runs in **cloud mode** (`CAREER_OPS_CLOUD=1` + Supabase), signed-in users store copies of many User Layer files in Postgres table **`public.workspace_documents`**.

| Column       | Meaning |
|-------------|---------|
| `user_id`   | `auth.users.id` — row owner (RLS). |
| `path`      | Virtual path under the repo root, same string as on disk (e.g. `cv.md`, `data/applications.md`, `interview-prep/acme.md`, `reports/001-acme-2026-04-01.md`). Unique per user with `path`. |
| `body`      | File contents (markdown or YAML text). |
| `mime_type` | Hint for clients (`text/markdown` default; YAML files may use `application/yaml`). Added in migration `20260415120000_workspace_documents_metadata.sql`. |
| `created_at`| First write time. |
| `updated_at`| Last upsert. |

Core paths used by the server are defined in `web/backend/lib/workspace-remote.mjs` (`WS` + `WORKSPACE_WRITABLE_PATH_RE` / `isWorkspacePathWritable`). Interview prep and reports use the same table with `interview-prep/*.md` and `reports/*.md` paths.

Run migrations under `supabase/migrations/` (see `docs/HOSTED_AUTH.md` and `cloud/README.md`).

## The Rule

**If a file is in the User Layer, no update process may read, modify, or delete it.**

**If a file is in the System Layer, it can be safely replaced with the latest version from the upstream repo.**

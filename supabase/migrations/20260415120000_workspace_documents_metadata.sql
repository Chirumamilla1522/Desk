-- Extra columns for workspace_documents (audit + content typing).
-- Safe to run after 20260412120000_workspace_documents.sql

alter table public.workspace_documents
  add column if not exists created_at timestamptz;

update public.workspace_documents
set created_at = coalesce(created_at, updated_at)
where created_at is null;

alter table public.workspace_documents
  alter column created_at set default now(),
  alter column created_at set not null;

alter table public.workspace_documents
  add column if not exists mime_type text not null default 'text/markdown';

comment on table public.workspace_documents is
  'Per-user blobs keyed by virtual repo path (cv.md, data/applications.md, interview-prep/*.md, reports/*.md, etc.).';

comment on column public.workspace_documents.path is
  'Path relative to career-ops workspace root; unique with user_id.';

comment on column public.workspace_documents.mime_type is
  'Content hint for clients; markdown/yaml bodies use text/markdown or application/yaml.';

comment on column public.workspace_documents.created_at is
  'First insert time; updated_at changes on each upsert.';

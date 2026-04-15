-- Career-Ops cloud: per-user document blobs (paths like interview-prep/story-bank.md)
-- Run via Supabase SQL editor or `supabase db push` when using Supabase CLI.

create table if not exists public.workspace_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  path text not null,
  body text not null default '',
  updated_at timestamptz not null default now(),
  unique (user_id, path)
);

create index if not exists workspace_documents_user_path_prefix on public.workspace_documents (user_id, path text_pattern_ops);

alter table public.workspace_documents enable row level security;

create policy "workspace_documents_select_own"
  on public.workspace_documents for select
  using (auth.uid() = user_id);

create policy "workspace_documents_insert_own"
  on public.workspace_documents for insert
  with check (auth.uid() = user_id);

create policy "workspace_documents_update_own"
  on public.workspace_documents for update
  using (auth.uid() = user_id);

create policy "workspace_documents_delete_own"
  on public.workspace_documents for delete
  using (auth.uid() = user_id);

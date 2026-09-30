-- The coach's own memory: notes about each user, and the chat history.
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- Rows are deleted automatically when a user's account is deleted.

create table if not exists public.coach_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  text        text not null check (char_length(text) <= 300),
  created_at  timestamptz not null default now()
);
create index if not exists coach_notes_user_idx on public.coach_notes (user_id, created_at);

create table if not exists public.coach_messages (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists coach_messages_user_idx on public.coach_messages (user_id, id);

-- The coach server uses the service role key, which bypasses these policies.
-- These let your app show users their own coach history/notes and let them delete them.
alter table public.coach_notes enable row level security;
alter table public.coach_messages enable row level security;

drop policy if exists "read own coach notes" on public.coach_notes;
create policy "read own coach notes" on public.coach_notes
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "delete own coach notes" on public.coach_notes;
create policy "delete own coach notes" on public.coach_notes
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "read own coach messages" on public.coach_messages;
create policy "read own coach messages" on public.coach_messages
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "delete own coach messages" on public.coach_messages;
create policy "delete own coach messages" on public.coach_messages
  for delete to authenticated using ((select auth.uid()) = user_id);

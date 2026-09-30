-- OPTIONAL: your own exercise video library, managed in Supabase.
-- Then set EXERCISE_VIDEOS_TABLE=exercise_videos on Vercel.
-- url can be a YouTube link or a direct .mp4/.webm (e.g. a public Supabase Storage file).

create table if not exists public.exercise_videos (
  id         bigint generated always as identity primary key,
  exercise   text not null,                -- e.g. 'Romanian deadlift'
  aliases    text[] not null default '{}', -- e.g. '{RDL, stiff-leg deadlift}'
  title      text,
  url        text not null check (url like 'https://%'),
  created_at timestamptz not null default now()
);

alter table public.exercise_videos enable row level security;
drop policy if exists "anyone signed in can read exercise videos" on public.exercise_videos;
create policy "anyone signed in can read exercise videos" on public.exercise_videos
  for select to authenticated using (true);

-- Example:
-- insert into public.exercise_videos (exercise, aliases, title, url)
-- values ('Romanian deadlift', '{RDL}', 'How to do a Romanian deadlift', 'https://www.youtube.com/watch?v=...');

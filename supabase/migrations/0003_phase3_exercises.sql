-- ============================================================
--  BUSTILLO PERFORMANCE — PHASE 3a: EXERCISES (movement library)
--  Global catalog: any signed-in user can read; only staff can write.
--  Safe to re-run.
-- ============================================================
create table if not exists public.exercises (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  category       text not null default '',
  sections       jsonb not null default '["Strength"]'::jsonb,  -- ['Strength','Skill', …]
  measure        text not null default 'reps',                  -- reps | time | distance
  unit           text,                                          -- yd|ft|in|m|ft-in|s|min
  is_test        boolean not null default false,
  video_url      text,
  equipment      text,
  regression_id  uuid references public.exercises(id) on delete set null,
  progression_id uuid references public.exercises(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists exercises_category_idx on public.exercises(category);

alter table public.exercises enable row level security;

drop policy if exists exercises_select on public.exercises;
create policy exercises_select on public.exercises
  for select using (auth.uid() is not null);

drop policy if exists exercises_write_staff on public.exercises;
create policy exercises_write_staff on public.exercises
  for all using (public.is_staff()) with check (public.is_staff());

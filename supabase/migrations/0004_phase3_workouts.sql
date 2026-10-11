-- ============================================================
--  BUSTILLO PERFORMANCE — PHASE 3b: WORKOUTS
--  items[] embedded as JSONB: {exerciseId, section, circuit, sets, target,
--  tempo:{type,seconds}, loadPct, trackable, note, _isText, text}.
--  Global catalog: read for any signed-in user; write staff-only. Re-runnable.
-- ============================================================
create table if not exists public.workouts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  focus      text not null default '',
  difficulty text not null default 'Beginner',
  items      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.workouts enable row level security;

drop policy if exists workouts_select on public.workouts;
create policy workouts_select on public.workouts
  for select using (auth.uid() is not null);

drop policy if exists workouts_write_staff on public.workouts;
create policy workouts_write_staff on public.workouts
  for all using (public.is_staff()) with check (public.is_staff());

-- ============================================================
--  BUSTILLO PERFORMANCE — PHASE 4b: PERSONAL PROGRAMS (1-on-1)
--  One per member (member_id UNIQUE). workouts[] are EMBEDDED (jsonb) so
--  editing them never touches the global catalog. schedule[] jsonb maps
--  real dates → embedded workout ids: [{date, workoutId}].
--  RLS: a client sees only their own; staff see all; write staff-only.
-- ============================================================
create table if not exists public.personal_programs (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null unique references public.members(id) on delete cascade,
  name       text not null default '',
  start_date date,
  workouts   jsonb not null default '[]'::jsonb,   -- [{id,name,focus,items:[...]}]
  schedule   jsonb not null default '[]'::jsonb,   -- [{date,workoutId}]
  created_at timestamptz not null default now()
);

alter table public.personal_programs enable row level security;

drop policy if exists personal_programs_select on public.personal_programs;
create policy personal_programs_select on public.personal_programs
  for select using (public.is_staff() or member_id = public.my_member_id());

drop policy if exists personal_programs_write_staff on public.personal_programs;
create policy personal_programs_write_staff on public.personal_programs
  for all using (public.is_staff()) with check (public.is_staff());

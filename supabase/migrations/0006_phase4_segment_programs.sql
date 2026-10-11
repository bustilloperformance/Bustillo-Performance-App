-- ============================================================
--  BUSTILLO PERFORMANCE — PHASE 4a: SEGMENT PROGRAMS
--  One rolling calendar per segment. schedule[] jsonb: [{date, workoutId}].
--  `segment` is UNIQUE so the app can upsert a segment's calendar on demand.
--  Read: any signed-in user (clients see their segment's calendar). Write: staff.
-- ============================================================
create table if not exists public.segment_programs (
  id         uuid primary key default gen_random_uuid(),
  segment    text not null unique,                 -- youth | athletes | moms | dads
  name       text not null default '',
  focus      text not null default '',
  schedule   jsonb not null default '[]'::jsonb,   -- [{date:'YYYY-MM-DD', workoutId}]
  created_at timestamptz not null default now()
);

alter table public.segment_programs enable row level security;

drop policy if exists segment_programs_select on public.segment_programs;
create policy segment_programs_select on public.segment_programs
  for select using (auth.uid() is not null);

drop policy if exists segment_programs_write_staff on public.segment_programs;
create policy segment_programs_write_staff on public.segment_programs
  for all using (public.is_staff()) with check (public.is_staff());

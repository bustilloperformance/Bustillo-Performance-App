-- ============================================================
--  BUSTILLO PERFORMANCE — PHASE 3c: PROGRAMS (templates)
--  schedule[] embedded as JSONB:
--    in-person: {week, day:'Mon'.., workoutId}
--    online:    {week, dayNumber:1.., workoutId}
--  Global catalog: read for any signed-in user; write staff-only. Re-runnable.
-- ============================================================
create table if not exists public.programs (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  mode           text not null default 'in-person',   -- in-person | online
  duration_weeks integer not null default 4,
  focus          text not null default '',
  description    text not null default '',
  schedule       jsonb not null default '[]'::jsonb,
  -- online-only storefront fields:
  price          numeric not null default 0,
  pricing_type   text not null default 'one-time',     -- one-time | monthly | annual
  listed         boolean not null default false,
  tagline        text not null default '',
  equipment      text not null default '',
  for_segment    text not null default 'all',
  created_at     timestamptz not null default now()
);

alter table public.programs enable row level security;

drop policy if exists programs_select on public.programs;
create policy programs_select on public.programs
  for select using (auth.uid() is not null);

drop policy if exists programs_write_staff on public.programs;
create policy programs_write_staff on public.programs
  for all using (public.is_staff()) with check (public.is_staff());

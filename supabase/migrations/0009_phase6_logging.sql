-- ============================================================
--  BUSTILLO PERFORMANCE — PHASE 6: LOGGING (workout_logs, body_comp)
--  workout_id is TEXT: it may reference a global workout (uuid) OR an embedded
--  personal-program workout id ('pw-...'), so no FK.
--  sets/exercise_notes jsonb. RLS: staff manage all; a client reads/writes own.
-- ============================================================
create table if not exists public.workout_logs (
  id                 uuid primary key default gen_random_uuid(),
  member_id          uuid not null references public.members(id) on delete cascade,
  workout_id         text,
  date               date not null,
  readiness          integer,
  exercise_notes     jsonb not null default '{}'::jsonb,  -- { exerciseId: 'note' }
  sets               jsonb not null default '[]'::jsonb,  -- [{exerciseId,setNum,value,reps}]
  program_week       integer,
  program_day_number integer,
  created_at         timestamptz not null default now()
);
create index if not exists workout_logs_member_idx on public.workout_logs(member_id);

create table if not exists public.body_comp (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members(id) on delete cascade,
  date        date not null,
  weight      numeric,
  body_fat    numeric,
  muscle_mass numeric,
  notes       text not null default '',
  photo_url   text,
  created_at  timestamptz not null default now()
);
create index if not exists body_comp_member_idx on public.body_comp(member_id);

alter table public.workout_logs enable row level security;
alter table public.body_comp    enable row level security;

drop policy if exists workout_logs_rw on public.workout_logs;
create policy workout_logs_rw on public.workout_logs
  for all using (public.is_staff() or member_id = public.my_member_id())
  with check (public.is_staff() or member_id = public.my_member_id());

drop policy if exists body_comp_rw on public.body_comp;
create policy body_comp_rw on public.body_comp
  for all using (public.is_staff() or member_id = public.my_member_id())
  with check (public.is_staff() or member_id = public.my_member_id());

-- ============================================================
--  BUSTILLO PERFORMANCE — WEEKLY CHECK-IN
--  A short form the 1-on-1 client fills in on Sunday about the week that's
--  ending: sessions completed, how the load felt, energy, sleep, stress,
--  nutrition, pain, a win, what was hard, what's coming.
--
--  Answers are jsonb keyed by question id rather than a column each, so
--  rewording a question or adding one is a code change, not a migration. The
--  questions live in src/lib/checkIn.js.
--
--  week_start is the MONDAY of the week being reported on, so the Sunday form
--  and the training week it covers share a key — and the unique constraint
--  makes one check-in per member per week, editable until the week rolls over.
--
--  Apply in the Supabase SQL Editor. Safe to re-run.
-- ============================================================

create table if not exists public.check_ins (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members(id) on delete cascade,
  week_start   date not null,
  answers      jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (member_id, week_start)
);

create index if not exists check_ins_member_idx on public.check_ins(member_id);
create index if not exists check_ins_week_idx   on public.check_ins(week_start desc);

alter table public.check_ins enable row level security;

-- Staff read every check-in — the point is the weekly sweep. A client reads
-- and writes only their own.
drop policy if exists check_ins_select on public.check_ins;
create policy check_ins_select on public.check_ins
  for select using (public.is_staff() or member_id = public.my_member_id());

drop policy if exists check_ins_write on public.check_ins;
create policy check_ins_write on public.check_ins
  for all using (public.is_staff() or member_id = public.my_member_id())
  with check (public.is_staff() or member_id = public.my_member_id());

-- A guardian answers for the dependent they're responsible for — a child
-- isn't going to fill in their own sleep and stress.
drop policy if exists check_ins_dependents on public.check_ins;
create policy check_ins_dependents on public.check_ins
  for all using (member_id in (select public.my_member_ids()))
  with check (member_id in (select public.my_member_ids()));

-- ============================================================
--  BUSTILLO PERFORMANCE — PHASE 5: SCHEDULE (classes, cancellations, reservations)
--  classes.recurrence jsonb: {type:'single',date} | {type:'weekly',days[],startDate,endDate}
--  Read: any signed-in user (clients browse the schedule).
--  Reservations: a client can read + create + cancel ONLY their own; staff manage all.
-- ============================================================
create table if not exists public.classes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  trainer    text not null default '',
  time       text not null default '09:00',
  duration   integer not null default 60,
  capacity   integer not null default 8,
  credits    integer not null default 1,
  color      text not null default 'forest',
  segment    text,
  recurrence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.class_cancellations (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  date       date not null,
  created_at timestamptz not null default now(),
  unique (class_id, date)
);

create table if not exists public.reservations (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.members(id) on delete cascade,
  class_id   uuid not null references public.classes(id) on delete cascade,
  date       date not null,
  status     text not null default 'confirmed',  -- confirmed | cancelled
  created_at timestamptz not null default now()
);
create index if not exists reservations_member_idx on public.reservations(member_id);
create index if not exists reservations_class_date_idx on public.reservations(class_id, date);

alter table public.classes             enable row level security;
alter table public.class_cancellations enable row level security;
alter table public.reservations        enable row level security;

-- CLASSES + CANCELLATIONS: read all signed-in; write staff.
drop policy if exists classes_select on public.classes;
create policy classes_select on public.classes for select using (auth.uid() is not null);
drop policy if exists classes_write_staff on public.classes;
create policy classes_write_staff on public.classes for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists cancellations_select on public.class_cancellations;
create policy cancellations_select on public.class_cancellations for select using (auth.uid() is not null);
drop policy if exists cancellations_write_staff on public.class_cancellations;
create policy cancellations_write_staff on public.class_cancellations for all using (public.is_staff()) with check (public.is_staff());

-- RESERVATIONS: staff manage all; a client reads/creates/updates ONLY their own.
drop policy if exists reservations_select on public.reservations;
create policy reservations_select on public.reservations
  for select using (public.is_staff() or member_id = public.my_member_id());

drop policy if exists reservations_insert on public.reservations;
create policy reservations_insert on public.reservations
  for insert with check (public.is_staff() or member_id = public.my_member_id());

drop policy if exists reservations_update on public.reservations;
create policy reservations_update on public.reservations
  for update using (public.is_staff() or member_id = public.my_member_id())
  with check (public.is_staff() or member_id = public.my_member_id());

drop policy if exists reservations_delete on public.reservations;
create policy reservations_delete on public.reservations
  for delete using (public.is_staff() or member_id = public.my_member_id());

-- ============================================================
--  BUSTILLO PERFORMANCE — PHASE 9: DEPENDENTS
--  A member who can't hold a login of their own (a child with no email) is
--  attached to the adult responsible for them. The guardian's login then
--  reaches that dependent's data, and the app lets them switch between the two.
--
--  Every policy below is ADDITIVE. Postgres ORs permissive policies together,
--  so this file can only ever GRANT a guardian access to their dependent's
--  rows — it never narrows what already works. That is deliberate:
--  nutrition_plans, progress_photos and the storage buckets were created
--  outside these migration files, so their current policies aren't in this
--  repo and must not be rewritten blind.
--
--  Apply in the Supabase SQL Editor. Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
--  COLUMN — who is responsible for this member
-- ------------------------------------------------------------
alter table public.members
  add column if not exists guardian_id uuid references public.members(id) on delete set null;

create index if not exists members_guardian_id_idx on public.members(guardian_id);

-- Nobody is their own guardian.
alter table public.members drop constraint if exists members_guardian_not_self;
alter table public.members add constraint members_guardian_not_self
  check (guardian_id is null or guardian_id <> id);

-- ------------------------------------------------------------
--  HELPER — every member this login is responsible for: themselves, plus
--  anyone they are the guardian of. One level deep on purpose — a dependent
--  does not carry dependents of their own.
-- ------------------------------------------------------------
create or replace function public.my_member_ids()
returns setof uuid language sql security definer stable
set search_path = public as $$
  select member_id from public.profiles
   where id = auth.uid() and member_id is not null
  union
  select m.id from public.members m
   where m.guardian_id = (select member_id from public.profiles where id = auth.uid());
$$;

-- ------------------------------------------------------------
--  GUARD — only staff may attach or detach a dependent. Without this a client
--  could PATCH public.members straight through the REST API (their own row is
--  writable) and re-point guardian_id. That column decides who may read their
--  data, so it is not theirs to set.
-- ------------------------------------------------------------
create or replace function public.enforce_guardian_is_staff()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.guardian_id is distinct from old.guardian_id and not public.is_staff() then
    raise exception 'Only staff can change a member''s guardian.';
  end if;
  return new;
end;
$$;

drop trigger if exists members_guardian_guard on public.members;
create trigger members_guardian_guard
  before update on public.members
  for each row execute function public.enforce_guardian_is_staff();

-- ============================================================
--  ADDITIVE POLICIES — "…or this row belongs to someone I'm responsible for"
-- ============================================================

-- MEMBERS — read and edit a dependent's profile.
drop policy if exists members_select_dependents on public.members;
create policy members_select_dependents on public.members
  for select using (id in (select public.my_member_ids()));

drop policy if exists members_update_dependents on public.members;
create policy members_update_dependents on public.members
  for update using (id in (select public.my_member_ids()))
  with check (id in (select public.my_member_ids()));

-- MEMBERSHIPS — see what the dependent is enrolled in.
drop policy if exists memberships_select_dependents on public.memberships;
create policy memberships_select_dependents on public.memberships
  for select using (member_id in (select public.my_member_ids()));

-- PERSONAL PROGRAMS — their 1-on-1 calendar.
drop policy if exists personal_programs_select_dependents on public.personal_programs;
create policy personal_programs_select_dependents on public.personal_programs
  for select using (member_id in (select public.my_member_ids()));

-- RESERVATIONS — book and cancel classes on their behalf.
drop policy if exists reservations_select_dependents on public.reservations;
create policy reservations_select_dependents on public.reservations
  for select using (member_id in (select public.my_member_ids()));

drop policy if exists reservations_insert_dependents on public.reservations;
create policy reservations_insert_dependents on public.reservations
  for insert with check (member_id in (select public.my_member_ids()));

drop policy if exists reservations_update_dependents on public.reservations;
create policy reservations_update_dependents on public.reservations
  for update using (member_id in (select public.my_member_ids()))
  with check (member_id in (select public.my_member_ids()));

drop policy if exists reservations_delete_dependents on public.reservations;
create policy reservations_delete_dependents on public.reservations
  for delete using (member_id in (select public.my_member_ids()));

-- TRAINING LOGS + BODY COMP — log their sessions and measurements.
drop policy if exists workout_logs_dependents on public.workout_logs;
create policy workout_logs_dependents on public.workout_logs
  for all using (member_id in (select public.my_member_ids()))
  with check (member_id in (select public.my_member_ids()));

drop policy if exists body_comp_dependents on public.body_comp;
create policy body_comp_dependents on public.body_comp
  for all using (member_id in (select public.my_member_ids()))
  with check (member_id in (select public.my_member_ids()));

-- ONLINE PROGRAMS they own.
drop policy if exists member_programs_select_dependents on public.member_programs;
create policy member_programs_select_dependents on public.member_programs
  for select using (member_id in (select public.my_member_ids()));

-- PAYMENTS — billing history. Writes stay staff/webhook only.
drop policy if exists payments_select_dependents on public.payments;
create policy payments_select_dependents on public.payments
  for select using (member_id in (select public.my_member_ids()));

-- NUTRITION PLAN row.
drop policy if exists nutrition_plans_select_dependents on public.nutrition_plans;
create policy nutrition_plans_select_dependents on public.nutrition_plans
  for select using (member_id in (select public.my_member_ids()));

-- PROGRESS PHOTOS rows — upload and delete on their behalf.
drop policy if exists progress_photos_dependents on public.progress_photos;
create policy progress_photos_dependents on public.progress_photos
  for all using (member_id in (select public.my_member_ids()))
  with check (member_id in (select public.my_member_ids()));

-- ------------------------------------------------------------
--  STORAGE — both buckets key their objects as "<member_id>/<file>".
--  The first path segment is compared as TEXT on purpose: casting an
--  arbitrary folder name to uuid would error out on any stray object.
-- ------------------------------------------------------------
drop policy if exists nutrition_read_dependents on storage.objects;
create policy nutrition_read_dependents on storage.objects
  for select using (
    bucket_id = 'nutrition'
    and exists (select 1 from public.my_member_ids() mid
                 where mid::text = (storage.foldername(name))[1])
  );

drop policy if exists progress_photos_read_dependents on storage.objects;
create policy progress_photos_read_dependents on storage.objects
  for select using (
    bucket_id = 'progress-photos'
    and exists (select 1 from public.my_member_ids() mid
                 where mid::text = (storage.foldername(name))[1])
  );

drop policy if exists progress_photos_write_dependents on storage.objects;
create policy progress_photos_write_dependents on storage.objects
  for insert with check (
    bucket_id = 'progress-photos'
    and exists (select 1 from public.my_member_ids() mid
                 where mid::text = (storage.foldername(name))[1])
  );

drop policy if exists progress_photos_delete_dependents on storage.objects;
create policy progress_photos_delete_dependents on storage.objects
  for delete using (
    bucket_id = 'progress-photos'
    and exists (select 1 from public.my_member_ids() mid
                 where mid::text = (storage.foldername(name))[1])
  );

-- ============================================================
--  BUSTILLO PERFORMANCE — PHASE 11: A LAPSED MEMBERSHIP LOSES THE TRAINING
--  Until now nothing anywhere tied training to the membership. Cancelling
--  cleared the member's segment, which hid the routine as a side effect, but
--  simply LAPSING ran no code at all: next_billing passed, the row kept
--  status 'active' and segment '1on1', and the client kept their routine.
--
--  The rule lives here, in one function, evaluated on every read. No cron and
--  nothing to keep in sync — change a billing date, refresh, and the answer
--  changes with it.
--
--  WHAT IS CUT: the active routine (personal + segment programs) and booking
--  a class.
--  WHAT IS KEPT: everything they earned — logged sessions, body composition,
--  progress photos, goals, and their nutrition plan as it stood.
--
--  Staff are never blocked: every policy keeps its is_staff() branch, so the
--  owner can still fix a member's program while their own membership lapses.
--
--  Apply in the Supabase SQL Editor. Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
--  Does this member still get to train?
--  Seven days of grace past the billing date: a manual transfer that lands
--  late shouldn't lock someone out mid-week. A day pass gets no grace — it is
--  a single day by definition.
-- ------------------------------------------------------------
create or replace function public.member_has_access(p_member uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1
      from public.memberships mb
      left join public.membership_plans p on p.id = mb.plan_id
     where mb.member_id = p_member
       and mb.status in ('active', 'paused')
       and case
             when p.recurrence = 'day-pass' then mb.start_date = current_date
             -- open-ended (no billing date): comped and one-time plans
             when mb.next_billing is null then true
             else mb.next_billing + 7 >= current_date
           end
  );
$$;

-- ============================================================
--  THE ROUTINE
--  Both the member's own policy AND the dependents policy have to carry the
--  check. Permissive policies are OR'd together, so leaving either one open
--  would hand back everything the other takes away.
-- ============================================================

drop policy if exists personal_programs_select on public.personal_programs;
create policy personal_programs_select on public.personal_programs
  for select using (
    public.is_staff()
    or (member_id = public.my_member_id() and public.member_has_access(member_id))
  );

drop policy if exists personal_programs_select_dependents on public.personal_programs;
create policy personal_programs_select_dependents on public.personal_programs
  for select using (
    member_id in (select public.my_member_ids()) and public.member_has_access(member_id)
  );

-- Segment programs were readable by ANY signed-in user — every segment's
-- calendar, not just your own. Now it's your segment, and only while you're
-- paid up.
drop policy if exists segment_programs_select on public.segment_programs;
create policy segment_programs_select on public.segment_programs
  for select using (
    public.is_staff()
    or exists (
      select 1 from public.members m
       where m.id in (select public.my_member_ids())
         and m.segment = segment_programs.segment
         and public.member_has_access(m.id)
    )
  );

-- ============================================================
--  BOOKING
--  Reading and cancelling existing reservations stays open — someone whose
--  membership lapsed should still be able to see and undo what they booked.
--  Creating a new one is what stops.
-- ============================================================

drop policy if exists reservations_insert on public.reservations;
create policy reservations_insert on public.reservations
  for insert with check (
    public.is_staff()
    or (member_id = public.my_member_id() and public.member_has_access(member_id))
  );

drop policy if exists reservations_insert_dependents on public.reservations;
create policy reservations_insert_dependents on public.reservations
  for insert with check (
    member_id in (select public.my_member_ids()) and public.member_has_access(member_id)
  );

-- ------------------------------------------------------------
--  Deliberately untouched, so a lapsed member keeps their own record:
--    workout_logs · body_comp · progress_photos · nutrition_plans
--    members · memberships · payments · reservations (select/update/delete)
-- ------------------------------------------------------------

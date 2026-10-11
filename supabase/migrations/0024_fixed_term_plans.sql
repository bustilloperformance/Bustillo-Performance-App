-- ============================================================
--  BUSTILLO PERFORMANCE — PLANS THAT RUN A FIXED NUMBER OF CYCLES
--  Every plan billed forever until someone cancelled it. A twelve-week block
--  or a three-month challenge had to be remembered and cancelled by hand on
--  the right date, for every member on it.
--
--  A plan can now say how many times it charges. The end date is derived from
--  the start, the cadence and that count — and can be overridden per member,
--  because a real client starts late, pauses, or gets an extra week.
--
--  The sales window is already covered by membership_plans.listed, which the
--  owner flips himself. Nothing needed for that.
--
--  Apply in the Supabase SQL Editor. Safe to re-run.
-- ============================================================

-- How many times this plan charges before it's done. Null = runs until
-- cancelled, which is every plan that exists today.
alter table public.membership_plans
  add column if not exists billing_cycles integer;

alter table public.membership_plans drop constraint if exists membership_plans_billing_cycles_ck;
alter table public.membership_plans add constraint membership_plans_billing_cycles_ck
  check (billing_cycles is null or billing_cycles >= 1);

-- When this particular membership stops. Filled in from the plan's cycle count
-- when the plan is assigned, and editable afterwards — the computed date is a
-- starting point, not a rule.
alter table public.memberships
  add column if not exists end_date date;

comment on column public.memberships.end_date is
  'Last day this membership grants access. Derived from the plan''s billing_cycles '
  'at assignment, then editable. Null = runs until cancelled.';

-- ------------------------------------------------------------
--  Access stops at the end date, the same way it stops at a scheduled
--  cancellation: on the day, with no grace. A fixed term ending is not a
--  payment running late.
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
       and (mb.cancel_at is null or mb.cancel_at > current_date)
       and (mb.end_date  is null or mb.end_date  >= current_date)
       and case
             when coalesce(mb.custom_price, p.price, 0) = 0 then true
             when p.recurrence = 'day-pass' then mb.start_date = current_date
             when mb.next_billing is null then true
             else mb.next_billing + 7 >= current_date
           end
  );
$$;

-- ============================================================
--  BUSTILLO PERFORMANCE — PHASE 10: CUSTOM BILLING INTERVALS
--  A plan can now bill every N days / weeks / months instead of only the
--  four fixed cadences. recurrence = 'custom' switches the plan over to
--  interval_unit + interval_count; every other recurrence ignores them.
--
--  Stripe's own ceiling applies and is enforced in the app: an interval may
--  not exceed one year (365 days, 52 weeks, 12 months).
--
--  Apply in the Supabase SQL Editor. Safe to re-run.
-- ============================================================

alter table public.membership_plans
  add column if not exists interval_unit  text,      -- day | week | month (custom only)
  add column if not exists interval_count integer;   -- how many of them

-- Only the three units Stripe takes for a sub-year cadence, and a positive
-- count. Both stay null on the fixed recurrences.
alter table public.membership_plans drop constraint if exists membership_plans_interval_unit_ck;
alter table public.membership_plans add constraint membership_plans_interval_unit_ck
  check (interval_unit is null or interval_unit in ('day', 'week', 'month'));

alter table public.membership_plans drop constraint if exists membership_plans_interval_count_ck;
alter table public.membership_plans add constraint membership_plans_interval_count_ck
  check (interval_count is null or (interval_count >= 1 and interval_count <= 365));

-- A custom plan is meaningless without both halves.
alter table public.membership_plans drop constraint if exists membership_plans_custom_complete_ck;
alter table public.membership_plans add constraint membership_plans_custom_complete_ck
  check (recurrence <> 'custom' or (interval_unit is not null and interval_count is not null));

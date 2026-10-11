-- ============================================================
--  BUSTILLO PERFORMANCE — A FREE MEMBERSHIP IS A COURTESY, AND NEVER LAPSES
--  0021 cut access seven days past the billing date. That caught the comped
--  family memberships too: they carry a price of 0 and a billing date nobody
--  ever intends to collect on, so they'd go dark like anyone else.
--
--  Rather than clearing three billing dates by hand and having to remember it
--  for the next one, price 0 is the rule: free means comped, comped never
--  lapses while the membership is active or paused.
--
--  Apply in the Supabase SQL Editor. Safe to re-run.
-- ============================================================

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
             -- Comped: a custom price of 0 (or a free plan) is a courtesy, and
             -- a courtesy has no billing date worth enforcing.
             when coalesce(mb.custom_price, p.price, 0) = 0 then true
             -- A day pass is one day by definition, so it gets no grace.
             when p.recurrence = 'day-pass' then mb.start_date = current_date
             -- Open-ended: nothing to fall behind on.
             when mb.next_billing is null then true
             -- Seven days of grace: a transfer landing late shouldn't lock
             -- someone out mid-week.
             else mb.next_billing + 7 >= current_date
           end
  );
$$;

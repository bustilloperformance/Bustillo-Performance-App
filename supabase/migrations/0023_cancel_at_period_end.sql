-- ============================================================
--  BUSTILLO PERFORMANCE — CANCELLING ENDS AT THE PERIOD, NOT ON THE SPOT
--  Cancelling stopped everything the instant it was clicked: status went to
--  'cancelled', next_billing was cleared, and the member lost access having
--  already paid through the end of the cycle. Stripe was cancelled outright
--  too, so the paid remainder was simply forfeited.
--
--  A cancellation is now a date: they keep what they paid for, and it lapses
--  on its own when the period runs out — the way a subscription is supposed
--  to behave.
--
--  Apply in the Supabase SQL Editor. Safe to re-run.
-- ============================================================

alter table public.memberships
  add column if not exists cancel_at date;   -- set = cancelling on this date

comment on column public.memberships.cancel_at is
  'When a scheduled cancellation takes effect. The membership stays active and '
  'keeps its segment until this date, then stops. Null = not cancelling.';

-- ------------------------------------------------------------
--  Access honours it. No grace on a scheduled cancellation: they chose the
--  date, and the seven days exist for a late payment, not for a membership
--  that was deliberately ended.
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
       and case
             -- Comped: a price of 0 is a courtesy, and never lapses.
             when coalesce(mb.custom_price, p.price, 0) = 0 then true
             when p.recurrence = 'day-pass' then mb.start_date = current_date
             when mb.next_billing is null then true
             else mb.next_billing + 7 >= current_date
           end
  );
$$;

-- ============================================================
--  BUSTILLO PERFORMANCE — PHASE 2: PLANS + MEMBERSHIPS
--  Tables: membership_plans, memberships · RLS
--  Apply in SQL Editor or via Management API. Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
--  membership_plans — the plan catalog (Youth, Athletes, 1on1, …)
-- ------------------------------------------------------------
create table if not exists public.membership_plans (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  segment               text,                               -- youth|athletes|moms|dads|1on1|null
  mode                  text not null default 'in-person',  -- in-person|online (only meaningful for 1on1)
  sessions_per_week     integer not null default 0,         -- 999 = unlimited
  price                 numeric not null default 0,
  recurrence            text not null default 'monthly',    -- monthly|quarterly|annual|one-time
  free_trial_days       integer not null default 0,
  min_commitment_months integer not null default 0,
  payment_methods       jsonb not null default '[]'::jsonb, -- ['card','cash','zelle','transfer']
  description           text not null default '',
  listed                boolean not null default true,      -- shown on client storefront
  created_at            timestamptz not null default now()
);

-- ------------------------------------------------------------
--  memberships — a member's subscription to a plan
-- ------------------------------------------------------------
create table if not exists public.memberships (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references public.members(id) on delete cascade,
  plan_id           uuid references public.membership_plans(id) on delete set null,
  start_date        date not null default current_date,
  next_billing      date,
  status            text not null default 'active',  -- active|paused|cancelled|ended
  upfront_paid      boolean not null default false,
  trial_end         date,
  custom_price      numeric,                         -- overrides plan price when set
  custom_min_months integer,                         -- overrides plan commitment when set
  discount          jsonb,                           -- {type,value,appliesTo} | null
  notes             text not null default '',
  pause             jsonb,                           -- {from,to,reason} | null
  created_at        timestamptz not null default now()
);

create index if not exists memberships_member_id_idx on public.memberships(member_id);
create index if not exists memberships_plan_id_idx   on public.memberships(plan_id);

-- ------------------------------------------------------------
--  RLS
-- ------------------------------------------------------------
alter table public.membership_plans enable row level security;
alter table public.memberships      enable row level security;

-- PLAN CATALOG: any signed-in user can read (clients browse the storefront);
-- only staff can write.
drop policy if exists plans_select on public.membership_plans;
create policy plans_select on public.membership_plans
  for select using (auth.uid() is not null);

drop policy if exists plans_write_staff on public.membership_plans;
create policy plans_write_staff on public.membership_plans
  for all using (public.is_staff()) with check (public.is_staff());

-- MEMBERSHIPS: staff see all; a client sees only their own.
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships
  for select using (public.is_staff() or member_id = public.my_member_id());

drop policy if exists memberships_write_staff on public.memberships;
create policy memberships_write_staff on public.memberships
  for all using (public.is_staff()) with check (public.is_staff());

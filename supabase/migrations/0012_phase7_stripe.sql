-- ============================================================
--  BUSTILLO PERFORMANCE — PHASE 7: STRIPE GROUNDWORK
--  Stripe id columns + member_programs (online program repertoire / purchases).
--  Actual Stripe API wiring lives in edge functions (needs the secret key).
-- ============================================================
alter table public.members          add column if not exists stripe_customer_id text;
alter table public.membership_plans add column if not exists stripe_product_id text;
alter table public.membership_plans add column if not exists stripe_price_id text;
alter table public.memberships      add column if not exists stripe_subscription_id text;
alter table public.memberships      add column if not exists stripe_status text;           -- synced from Stripe
alter table public.programs         add column if not exists stripe_product_id text;
alter table public.programs         add column if not exists stripe_price_id text;

-- A member's online-program repertoire (purchases). Created server-side by the
-- Stripe webhook after a successful payment. Clients read their own.
create table if not exists public.member_programs (
  id                     uuid primary key default gen_random_uuid(),
  member_id              uuid not null references public.members(id) on delete cascade,
  program_id             uuid not null references public.programs(id) on delete cascade,
  status                 text not null default 'active',  -- active|inactive|ended
  stripe_subscription_id text,                            -- null for one-time purchases
  started_at             date not null default current_date,
  cycles_used            integer not null default 0,
  pause                  jsonb,
  created_at             timestamptz not null default now()
);
create index if not exists member_programs_member_idx on public.member_programs(member_id);

alter table public.member_programs enable row level security;
drop policy if exists member_programs_select on public.member_programs;
create policy member_programs_select on public.member_programs
  for select using (public.is_staff() or member_id = public.my_member_id());
drop policy if exists member_programs_write_staff on public.member_programs;
create policy member_programs_write_staff on public.member_programs
  for all using (public.is_staff()) with check (public.is_staff());

-- ============================================================
--  0017 · CONFIGURABLE TAXES
--  Owner-defined tax rules. Each rule has a rate and a list of income sources
--  it applies to. Tax is treated as INCLUDED in the recorded price (the portion
--  carved out of revenue and owed to the state), so it works uniformly across
--  POS, Stripe and manual income without changing what is charged. A rule only
--  applies to payments dated on/after `effective_from`.
--
--  `tax_remittances` records payments sent to the tax authority, which draw down
--  the "tax payable" liability and reduce cash/bank.
-- ============================================================
create table if not exists public.taxes (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  rate           numeric not null,                 -- percent, e.g. 8.25
  applies_to     jsonb not null default '[]',      -- ['pos','program', ...] (payment.type keys)
  effective_from date not null default current_date,
  enabled        boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists public.tax_remittances (
  id         uuid primary key default gen_random_uuid(),
  amount     numeric not null,
  date       date not null default current_date,
  note       text default '',
  paid_from  text not null default 'bank',         -- 'bank' | 'cash'
  created_at timestamptz not null default now()
);

alter table public.taxes            enable row level security;
alter table public.tax_remittances  enable row level security;

create policy "taxes staff read"    on public.taxes for select using (public.is_staff());
create policy "taxes staff write"   on public.taxes for all    using (public.is_staff()) with check (public.is_staff());
create policy "remit staff read"    on public.tax_remittances for select using (public.is_staff());
create policy "remit staff write"   on public.tax_remittances for all    using (public.is_staff()) with check (public.is_staff());

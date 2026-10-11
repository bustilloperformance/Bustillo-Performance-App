-- ============================================================
--  BUSTILLO PERFORMANCE — manual balance-sheet items (assets & liabilities)
--  Lets the owner complete the Balance Sheet beyond auto-computed
--  cash/bank/inventory: equipment, loans, accounts payable, etc.
--  Staff-only.
-- ============================================================
create table if not exists public.balance_items (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,            -- asset | liability
  name       text not null,
  amount     numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.balance_items enable row level security;
drop policy if exists balance_items_staff on public.balance_items;
create policy balance_items_staff on public.balance_items for all using (public.is_staff()) with check (public.is_staff());

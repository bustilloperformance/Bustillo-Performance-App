-- ============================================================
--  BUSTILLO PERFORMANCE — PHASE 8: STUDIO (POS, finance, comms)
--  products, payments (income ledger), expenses, communications.
--  Back-office: staff-only (is_staff) for all operations.
--  Cash on hand is DERIVED in the app (sum(payments) - sum(expenses)).
-- ============================================================
create table if not exists public.products (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  price      numeric not null default 0,
  stock      integer not null default 0,
  category   text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid references public.members(id) on delete set null,
  amount     numeric not null default 0,
  date       date not null default current_date,
  method     text not null default 'cash',     -- cash|card|zelle|transfer
  type       text not null default 'pos',       -- pos|membership|dropin|other
  note       text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists payments_date_idx on public.payments(date);

create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  date       date not null default current_date,
  amount     numeric not null default 0,
  category   text not null default 'Other',
  note       text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists expenses_date_idx on public.expenses(date);

create table if not exists public.communications (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  trigger    text not null default '',
  channel    text not null default 'email',     -- email|sms
  status     text not null default 'active',     -- active|paused
  sent       integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.products       enable row level security;
alter table public.payments       enable row level security;
alter table public.expenses       enable row level security;
alter table public.communications enable row level security;

drop policy if exists products_staff on public.products;
create policy products_staff on public.products for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists payments_staff on public.payments;
create policy payments_staff on public.payments for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists expenses_staff on public.expenses;
create policy expenses_staff on public.expenses for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists communications_staff on public.communications;
create policy communications_staff on public.communications for all using (public.is_staff()) with check (public.is_staff());

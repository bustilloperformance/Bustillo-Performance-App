-- ============================================================
--  0016 · CUSTOM CATEGORIES
--  Owner-defined income sources and expense categories. Built-in defaults
--  still live in the app; this table only holds the custom ones the owner adds.
--  For income, `name` is stored as payments.type; for expense, as expenses.category.
-- ============================================================
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('income', 'expense')),
  name       text not null,
  created_at timestamptz not null default now(),
  unique (kind, name)
);

alter table public.categories enable row level security;

-- Staff (owner/coach) manage categories; clients never see them.
create policy "categories staff read"   on public.categories for select using (public.is_staff());
create policy "categories staff insert" on public.categories for insert with check (public.is_staff());
create policy "categories staff delete" on public.categories for delete using (public.is_staff());

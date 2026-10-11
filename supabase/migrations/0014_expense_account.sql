-- ============================================================
--  BUSTILLO PERFORMANCE — expense account (cash vs bank) for accurate balances
--  + financial reports. Income account is derived from payment.method
--  (cash → cash; card/zelle/transfer → bank).
-- ============================================================
alter table public.expenses add column if not exists paid_from text not null default 'bank'; -- cash | bank

-- ============================================================
--  BUSTILLO PERFORMANCE — PHASE 7c/7d: let a client read THEIR OWN payments
--  (for the Account / billing history screen). Writes stay staff-only;
--  real payment rows are created by the Stripe webhook (service_role).
-- ============================================================
drop policy if exists payments_staff on public.payments;

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select using (public.is_staff() or member_id = public.my_member_id());

drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments
  for insert with check (public.is_staff());

drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments
  for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists payments_delete on public.payments;
create policy payments_delete on public.payments
  for delete using (public.is_staff());

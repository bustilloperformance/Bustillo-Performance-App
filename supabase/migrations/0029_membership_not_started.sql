-- ============================================================
--  0029 — UNA MEMBRESÍA NO VALE ANTES DE EMPEZAR
--  member_has_access() revisaba el final de una membresía —cancelación, fecha
--  de término, cobro vencido— pero nunca el principio. Una membresía con fecha
--  de inicio futura ya daba acceso: alguien que contrata el día 25 para empezar
--  el 28 podía entrenar desde el 25.
--
--  El único lugar donde start_date se miraba era el pase de día, y ahí como
--  igualdad exacta, no como piso.
-- ============================================================
create or replace function public.member_has_access(p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.memberships mb
      left join public.membership_plans p on p.id = mb.plan_id
     where mb.member_id = p_member
       and mb.status in ('active', 'paused')
       and (mb.start_date is null or mb.start_date <= current_date)
       and (mb.cancel_at is null or mb.cancel_at > current_date)
       and (mb.end_date  is null or mb.end_date  >= current_date)
       and case
             when mb.courtesy then true
             when p.recurrence = 'day-pass' then mb.start_date = current_date
             when mb.next_billing is null then true
             else mb.next_billing + 7 >= current_date
           end
  );
$$;

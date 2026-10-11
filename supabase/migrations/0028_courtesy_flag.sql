-- ============================================================
--  0028 — LA CORTESÍA SE DECLARA, NO SE DEDUCE DEL PRECIO
--  Desde 0022 una membresía en $0 contaba como cortesía y nunca vencía. La
--  regla funcionaba pero era frágil: el precio es un dato de cobro y se estaba
--  usando para decidir acceso. Poner 0 mientras se define un plan, o capturar
--  mal un descuento, convertía a alguien en cortesía sin que nadie lo
--  decidiera — y al revés, una cortesía a la que se le pusiera precio dejaba
--  de serlo en silencio.
--
--  Ahora es una bandera explícita. El precio vuelve a ser solo precio.
-- ============================================================

alter table memberships
  add column if not exists courtesy boolean not null default false;

comment on column memberships.courtesy is
  'Cortesia declarada: sin cobro y sin vencimiento. Se marca a mano al asignar el plan, no se deduce del precio.';

-- Las cortesias que ya existen quedan marcadas ANTES de quitar la regla vieja.
-- Sin este paso, quitarla les cortaria el acceso en el mismo instante.
update memberships mb
   set courtesy = true
  from membership_plans p
 where p.id = mb.plan_id
   and coalesce(mb.custom_price, p.price, 0) = 0
   and mb.status in ('active', 'paused');

-- Y las que no tienen plan asociado pero traen precio 0 propio.
update memberships
   set courtesy = true
 where plan_id is null
   and coalesce(custom_price, 0) = 0
   and status in ('active', 'paused');

-- Una cortesia no tiene fecha de cobro: dejarla puesta hace que el perfil
-- muestre una renovacion que nunca va a ocurrir.
update memberships set next_billing = null where courtesy and next_billing is not null;

-- ---- La funcion de acceso deja de mirar el precio ----
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

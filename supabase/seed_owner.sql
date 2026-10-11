-- ============================================================
--  BUSTILLO PERFORMANCE — OWNER BOOTSTRAP (una sola vez)
--
--  handle_new_user() le pone rol 'client' a todo el que se registra, asi que
--  las cuentas de dueno se promueven a mano. Es a proposito: si el trigger
--  pudiera crear dueños, cualquiera que se registrara seria uno.
--
--  REQUISITO PREVIO: crear los usuarios en el dashboard de Supabase:
--    Authentication → Users → Add user →
--      email: jbustillo74@gmail.com      · Auto Confirm User: ON
--      email: fvillaboone@gmail.com    · Auto Confirm User: ON
--
--  DESPUES correr esto en el SQL Editor. Es idempotente: se puede repetir.
--
--  Son dos dueños distintos y a proposito:
--    · Josean   — el negocio es suyo. Entrena aqui, asi que lleva member.
--    · Fernando — administrador tecnico. NO lleva member: no es atleta de
--      este gimnasio y no debe aparecer en listas de clientes, reportes ni
--      cobros. Su acceso esta declarado en el Aviso de Privacidad (§05) y
--      Josean lo puede quitar desde Roles cuando quiera.
-- ============================================================
do $$
declare
  v_uid    uuid;
  v_member uuid;
begin
  -- ---------- 1 · Josean, dueño del negocio ----------
  select id into v_uid from auth.users where email = 'jbustillo74@gmail.com';
  if v_uid is null then
    raise exception 'Falta el usuario jbustillo74@gmail.com. Crealo primero en el dashboard.';
  end if;

  select member_id into v_member from public.profiles where id = v_uid;
  if v_member is null then
    insert into public.members (name, email, photo, status, notes)
    values ('José Antonio Bustillo', 'jbustillo74@gmail.com', 'JB', 'active',
            'Cuenta de dueño — también entrena aquí.')
    returning id into v_member;
  end if;

  update public.profiles
     set role = 'owner', name = 'Josean Bustillo', member_id = v_member
   where id = v_uid;
  raise notice 'Dueño listo: Josean (profile % → member %)', v_uid, v_member;

  -- ---------- 2 · Fernando, administrador técnico ----------
  select id into v_uid from auth.users where email = 'fvillaboone@gmail.com';
  if v_uid is null then
    raise notice 'Sin usuario fvillaboone@gmail.com — se omite el administrador técnico.';
  else
    update public.profiles
       set role = 'owner', name = 'Fernando Villanueva (admin técnico)'
     where id = v_uid;
    raise notice 'Administrador técnico listo: %', v_uid;
  end if;
end $$;

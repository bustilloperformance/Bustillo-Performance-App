-- ============================================================
--  0033 — CHAT DE LA COMUNIDAD
--  Grupos dentro de la app donde los clientes preguntan y comparten su
--  progreso. No es WhatsApp: el dueno decide exactamente quien esta en cada
--  grupo, y un grupo no tiene por que incluirlo a el.
--
--  Tres tablas: el grupo, quien esta en el, y los mensajes. Un mensaje lleva
--  texto y opcionalmente una foto; la foto vive en el bucket privado `chat`
--  bajo <group_id>/<archivo>, y se sirve con URL firmada igual que las fotos de
--  progreso. Nada publico.
--
--  Permisos: staff ve y modera todo aunque no sea miembro del grupo. Un
--  cliente solo ve los grupos donde esta, escribe como el mismo y borra solo
--  lo suyo. Solo staff crea grupos y mueve gente.
--
--  Un cliente no puede leer la tabla members mas alla de su propia fila (RLS
--  de 0019), y en el chat necesita el nombre y la foto de sus companeros. En
--  vez de abrirle members entera — con emails y telefonos — chat_peers()
--  devuelve solo id, nombre y foto de quien comparte grupo con el.
--
--  Aplicar en el SQL Editor de Supabase. Se puede volver a correr.
-- ============================================================

create table if not exists public.chat_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text not null default '',
  created_by  uuid references public.members(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.chat_group_members (
  group_id  uuid not null references public.chat_groups(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  added_at  timestamptz not null default now(),
  primary key (group_id, member_id)
);
create index if not exists chat_group_members_member_idx on public.chat_group_members(member_id);

create table if not exists public.chat_messages (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid not null references public.chat_groups(id) on delete cascade,
  author_member_id uuid not null references public.members(id) on delete cascade,
  body             text not null default '',
  image_path       text,
  created_at       timestamptz not null default now(),
  -- Un mensaje vacio sin foto no dice nada; no se guarda.
  constraint chat_messages_not_empty check (length(trim(body)) > 0 or image_path is not null)
);
create index if not exists chat_messages_group_time_idx on public.chat_messages(group_id, created_at);

-- ---- ¿Soy miembro de este grupo? ----
-- SECURITY DEFINER para que la propia RLS de chat_group_members no la deje
-- fuera; solo responde si/no sobre el usuario autenticado.
create or replace function public.is_chat_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_group_members gm
     where gm.group_id = gid
       and (gm.member_id = public.my_member_id()
            or gm.member_id in (select public.my_member_ids()))
  );
$$;

-- ---- Nombre y foto de quien comparte grupo conmigo ----
create or replace function public.chat_peers()
returns table (id uuid, name text, photo_url text)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.name, m.photo_url
    from public.members m
   where m.id in (
     select gm.member_id
       from public.chat_group_members gm
      where gm.group_id in (
        select g.group_id
          from public.chat_group_members g
         where g.member_id = public.my_member_id()
            or g.member_id in (select public.my_member_ids())
      )
   );
$$;

alter table public.chat_groups        enable row level security;
alter table public.chat_group_members enable row level security;
alter table public.chat_messages      enable row level security;

-- grupos: staff todo; miembro lee el suyo
drop policy if exists chat_groups_select on public.chat_groups;
create policy chat_groups_select on public.chat_groups
  for select using (public.is_staff() or public.is_chat_member(id));
drop policy if exists chat_groups_staff_write on public.chat_groups;
create policy chat_groups_staff_write on public.chat_groups
  for all using (public.is_staff()) with check (public.is_staff());

-- pertenencia: staff todo; miembro ve la lista de su grupo
drop policy if exists chat_group_members_select on public.chat_group_members;
create policy chat_group_members_select on public.chat_group_members
  for select using (public.is_staff() or public.is_chat_member(group_id));
drop policy if exists chat_group_members_staff_write on public.chat_group_members;
create policy chat_group_members_staff_write on public.chat_group_members
  for all using (public.is_staff()) with check (public.is_staff());

-- mensajes: leer si estas en el grupo o eres staff; escribir solo como tu
-- mismo y solo en un grupo donde estes (staff puede escribir en cualquiera);
-- borrar lo tuyo, o cualquiera si eres staff.
drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
  for select using (public.is_staff() or public.is_chat_member(group_id));
drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages
  for insert with check (
    author_member_id = public.my_member_id()
    and (public.is_staff() or public.is_chat_member(group_id))
  );
drop policy if exists chat_messages_delete on public.chat_messages;
create policy chat_messages_delete on public.chat_messages
  for delete using (public.is_staff() or author_member_id = public.my_member_id());

-- ---- Fotos: bucket privado `chat`, objetos bajo <group_id>/ ----
insert into storage.buckets (id, name, public)
values ('chat', 'chat', false)
on conflict (id) do nothing;

drop policy if exists chat_objects_read on storage.objects;
create policy chat_objects_read on storage.objects
  for select using (
    bucket_id = 'chat'
    and (public.is_staff() or public.is_chat_member(((storage.foldername(name))[1])::uuid))
  );
drop policy if exists chat_objects_insert on storage.objects;
create policy chat_objects_insert on storage.objects
  for insert with check (
    bucket_id = 'chat'
    and (public.is_staff() or public.is_chat_member(((storage.foldername(name))[1])::uuid))
  );
drop policy if exists chat_objects_delete on storage.objects;
create policy chat_objects_delete on storage.objects
  for delete using (
    bucket_id = 'chat'
    and (public.is_staff() or owner = auth.uid())
  );

-- ---- Tiempo real: los mensajes nuevos llegan sin recargar ----
-- Realtime respeta la RLS, asi que cada quien recibe solo lo de sus grupos.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

comment on table public.chat_groups is 'Grupos del chat de la comunidad. Solo staff los crea y decide quien esta.';
comment on table public.chat_messages is 'Mensajes del chat; image_path apunta al bucket privado chat bajo <group_id>/.';

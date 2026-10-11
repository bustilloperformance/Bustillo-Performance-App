-- ============================================================
--  BUSTILLO PERFORMANCE — 0018b: NUTRITION_PLANS, PROGRESS_PHOTOS Y SUS BUCKETS
--
--  POR QUE EXISTE ESTE ARCHIVO
--  En la instancia original estas dos tablas y los buckets de Storage se
--  crearon a mano en el dashboard, nunca en una migracion. La 0019 lo dice en
--  su propio encabezado: "nutrition_plans, progress_photos and the storage
--  buckets were created outside these migration files".
--
--  El resultado es que las migraciones NO alcanzan para levantar una instancia
--  nueva: la 0019 referencia public.nutrition_plans y revienta con
--  42P01 relation does not exist. Este archivo cierra ese hueco.
--
--  El DDL se recupero leyendo el esquema de la base de produccion original
--  (information_schema y pg_policies), no de memoria.
--
--  Va con sufijo "b" para ordenarse entre 0018 y 0019, que es donde hace falta.
--  Idempotente, como el resto.
-- ============================================================

-- ------------------------------------------------------------
--  NUTRITION_PLANS — una fila por miembro (de ahi el unique).
--  `pages` es jsonb: las paginas del plan son contenido que se reescribe
--  seguido, igual que las preguntas del check-in.
-- ------------------------------------------------------------
create table if not exists public.nutrition_plans (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null unique references public.members(id) on delete cascade,
  pages      jsonb not null default '[]'::jsonb,
  file_name  text,
  updated_at timestamptz not null default now()
);

alter table public.nutrition_plans enable row level security;

drop policy if exists nutrition_staff_all on public.nutrition_plans;
create policy nutrition_staff_all on public.nutrition_plans
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists nutrition_client_read on public.nutrition_plans;
create policy nutrition_client_read on public.nutrition_plans
  for select using (member_id = public.my_member_id());

-- ------------------------------------------------------------
--  PROGRESS_PHOTOS — una fila por foto. El archivo vive en Storage; aqui
--  solo el apuntador, la fecha y la pose.
-- ------------------------------------------------------------
create table if not exists public.progress_photos (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.members(id) on delete cascade,
  path       text not null,
  taken_on   date not null default current_date,
  note       text,
  created_at timestamptz not null default now(),
  pose       text
);

create index if not exists idx_progress_photos_member
  on public.progress_photos using btree (member_id);

alter table public.progress_photos enable row level security;

drop policy if exists "pp staff all" on public.progress_photos;
create policy "pp staff all" on public.progress_photos
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "pp client own" on public.progress_photos;
create policy "pp client own" on public.progress_photos
  for all using (member_id = public.my_member_id())
          with check (member_id = public.my_member_id());

-- ------------------------------------------------------------
--  BUCKETS DE STORAGE — los dos PRIVADOS. El tercero (`chat`) lo crea 0033.
--
--  Privados no es un detalle: son fotos de cuerpo y planes de nutricion. Un
--  bucket publico les da una URL que abre cualquiera que la tenga, sin sesion.
--  La app los sirve con URLs firmadas a una hora.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('nutrition', 'nutrition', false),
       ('progress-photos', 'progress-photos', false)
on conflict (id) do update set public = false;

-- Las rutas son '<member_id>/<archivo>', asi que la primera carpeta del nombre
-- es la dueña del objeto. De ahi storage.foldername(name))[1].
drop policy if exists "nutrition staff all" on storage.objects;
create policy "nutrition staff all" on storage.objects
  for all using (bucket_id = 'nutrition' and public.is_staff())
          with check (bucket_id = 'nutrition' and public.is_staff());

drop policy if exists "nutrition client read" on storage.objects;
create policy "nutrition client read" on storage.objects
  for select using (
    bucket_id = 'nutrition'
    and (storage.foldername(name))[1] = (public.my_member_id())::text
  );

drop policy if exists "pp storage staff" on storage.objects;
create policy "pp storage staff" on storage.objects
  for all using (bucket_id = 'progress-photos' and public.is_staff())
          with check (bucket_id = 'progress-photos' and public.is_staff());

drop policy if exists "pp storage client" on storage.objects;
create policy "pp storage client" on storage.objects
  for all using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (public.my_member_id())::text
  ) with check (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (public.my_member_id())::text
  );

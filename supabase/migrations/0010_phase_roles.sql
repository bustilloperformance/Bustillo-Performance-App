-- ============================================================
--  BUSTILLO PERFORMANCE — CUSTOM ROLES + PERMISSIONS
--  A `roles` table defines named roles with a permission set (jsonb array of
--  feature keys, or ["*"] for all). profiles.role references a role by name.
--  App-level feature gating uses these permissions. DB-level RLS stays coarse:
--  client / staff (any non-client role) / owner.
-- ============================================================

-- Allow arbitrary role names (was checked to owner|coach|client).
alter table public.profiles drop constraint if exists profiles_role_check;

create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,          -- machine name stored on profiles.role
  label       text not null default '',
  permissions jsonb not null default '[]'::jsonb,
  is_system   boolean not null default false, -- owner/coach/client can't be deleted
  created_at  timestamptz not null default now()
);

alter table public.roles enable row level security;
drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles for select using (auth.uid() is not null);
drop policy if exists roles_write_owner on public.roles;
create policy roles_write_owner on public.roles for all using (public.is_owner()) with check (public.is_owner());

-- Seed the system roles.
insert into public.roles (name, label, permissions, is_system) values
  ('owner',  'Owner',  '["*"]'::jsonb, true),
  ('coach',  'Coach',  '["members","memberships","exercises","workouts","segment-programs","programs","schedule","results","comms"]'::jsonb, true),
  ('client', 'Client', '["client"]'::jsonb, true)
on conflict (name) do nothing;

-- is_staff now means "any non-client role" (so custom staff roles get DB access).
create or replace function public.is_staff()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role is not null and role <> 'client');
$$;

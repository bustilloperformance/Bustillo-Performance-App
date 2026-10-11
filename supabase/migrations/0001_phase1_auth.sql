-- ============================================================
--  BUSTILLO PERFORMANCE — PHASE 1: AUTH FOUNDATION
--  Tables: members, profiles · RLS · role helpers · signup trigger
--  Apply in the Supabase SQL Editor (Dashboard → SQL Editor → paste → Run).
--  Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY guards.
-- ============================================================

-- ------------------------------------------------------------
--  TABLES
-- ------------------------------------------------------------

-- members: client/person profiles (a trainee). May exist without a login.
-- Sub-collections (goals, payment_methods, emergency_contact) are JSONB —
-- mirrors the prototype's embedded shape; can be normalized later if needed.
create table if not exists public.members (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  email             text,
  phone             text not null default '',
  join_date         date not null default current_date,
  status            text not null default 'active',   -- active | inactive | paused
  credits           integer not null default 0,
  points            integer not null default 0,
  photo             text,                              -- initials fallback (e.g. 'FV')
  photo_url         text,
  segment           text,                              -- youth|athletes|moms|dads|1on1|null
  birth_date        date,
  address           text not null default '',
  emergency_contact jsonb not null default '{"name":"","relation":"","phone":""}'::jsonb,
  notes             text not null default '',
  goals             jsonb not null default '[]'::jsonb,
  payment_methods   jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now()
);

-- profiles: extends auth.users (PK = auth user id). The login account + role.
-- Replaces the prototype's `users`. Coaches have a profile but no member_id;
-- clients and the owner link to a member.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  name       text not null default '',
  role       text not null default 'client' check (role in ('owner','coach','client')),
  member_id  uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists profiles_member_id_idx on public.profiles(member_id);

-- ------------------------------------------------------------
--  ROLE HELPERS (SECURITY DEFINER — avoid RLS recursion on profiles)
--  Named to avoid the reserved CURRENT_ROLE keyword.
-- ------------------------------------------------------------
create or replace function public.my_role()
returns text language sql security definer stable
set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.my_member_id()
returns uuid language sql security definer stable
set search_path = public as $$
  select member_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner','coach')
  );
$$;

create or replace function public.is_owner()
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner'
  );
$$;

-- ------------------------------------------------------------
--  SIGNUP TRIGGER — auto-create a profile when an auth user is created.
--  Role/name come from metadata (used by the Phase 2 invite flow);
--  defaults to a plain client. Runs as definer so it bypasses RLS.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'client')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
--  ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.members  enable row level security;
alter table public.profiles enable row level security;

-- PROFILES ---------------------------------------------------
-- Read: your own profile, or any if you're staff.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_staff());

-- Write: owner only. (Clients can't UPDATE profiles → no self role-escalation.
--  Inserts happen via the definer trigger, which bypasses RLS.)
drop policy if exists profiles_update_owner on public.profiles;
create policy profiles_update_owner on public.profiles
  for update using (public.is_owner()) with check (public.is_owner());

drop policy if exists profiles_delete_owner on public.profiles;
create policy profiles_delete_owner on public.profiles
  for delete using (public.is_owner());

-- MEMBERS ----------------------------------------------------
-- Read: staff see all; a client sees only their own linked member.
drop policy if exists members_select on public.members;
create policy members_select on public.members
  for select using (public.is_staff() or id = public.my_member_id());

-- Insert: staff only.
drop policy if exists members_insert on public.members;
create policy members_insert on public.members
  for insert with check (public.is_staff());

-- Update: staff, or a client editing their own member profile.
drop policy if exists members_update on public.members;
create policy members_update on public.members
  for update using (public.is_staff() or id = public.my_member_id())
  with check (public.is_staff() or id = public.my_member_id());

-- Delete: owner only.
drop policy if exists members_delete_owner on public.members;
create policy members_delete_owner on public.members
  for delete using (public.is_owner());

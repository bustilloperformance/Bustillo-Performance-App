-- ============================================================
--  0018 · CONFIGURABLE SEGMENTS
--  The audience segments (Youth, Athletes, Moms, Dads, …) become data so the
--  owner can add/remove them. `slug` is the stable key used in
--  plans.segment / classes.segment / members.segment / segment_programs.segment.
--  '1on1' is NOT a row here — it stays a special built-in (personalized, no
--  shared segment calendar).
-- ============================================================
create table if not exists public.segments (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  label      text not null,
  code       text default '',
  color      text not null default 'sand',   -- a key of the brand palette C
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);

alter table public.segments enable row level security;

-- Everyone signed in can read segments (clients need their own label/colour);
-- only staff manage them.
create policy "segments read"         on public.segments for select using (auth.role() = 'authenticated');
create policy "segments staff write"  on public.segments for all
  using (public.is_staff()) with check (public.is_staff());

-- Seed the four existing segments so nothing changes on launch.
insert into public.segments (slug, label, code, color, sort_order) values
  ('youth',    'Youth',    'FW—01', 'sand',   1),
  ('athletes', 'Athletes', 'FW—02', 'gold',   2),
  ('moms',     'Moms',     'FW—03', 'forest', 3),
  ('dads',     'Dads',     'FW—04', 'navy',   4)
on conflict (slug) do nothing;

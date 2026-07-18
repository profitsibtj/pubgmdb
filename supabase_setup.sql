-- Jalankan seluruh isi file ini sekali di Supabase Dashboard > SQL Editor.
-- Aman dijalankan berkali-kali (pakai IF NOT EXISTS / DROP IF EXISTS).

create table if not exists public.matches (
  id bigint generated always as identity primary key,
  date text,
  match_code text,
  league text,
  total_game text,
  game_no text,
  map text,
  live_link text,
  teams jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz
);

create table if not exists public.roster (
  id bigint generated always as identity primary key,
  name text,
  role text,
  team text,
  league text,
  created_at timestamptz default now(),
  updated_at timestamptz
);

alter table public.matches enable row level security;
alter table public.roster enable row level security;

-- Kebijakan akses: siapa pun yang punya anon key (memang ditujukan publik)
-- boleh baca/tulis. Sama seperti password PIN di aplikasi, ini bukan
-- proteksi tingkat tinggi - hanya menghalangi akses tidak sengaja/casual.
drop policy if exists "public read matches" on public.matches;
drop policy if exists "public write matches" on public.matches;
drop policy if exists "public update matches" on public.matches;
drop policy if exists "public delete matches" on public.matches;
create policy "public read matches" on public.matches for select using (true);
create policy "public write matches" on public.matches for insert with check (true);
create policy "public update matches" on public.matches for update using (true) with check (true);
create policy "public delete matches" on public.matches for delete using (true);

drop policy if exists "public read roster" on public.roster;
drop policy if exists "public write roster" on public.roster;
drop policy if exists "public update roster" on public.roster;
drop policy if exists "public delete roster" on public.roster;
create policy "public read roster" on public.roster for select using (true);
create policy "public write roster" on public.roster for insert with check (true);
create policy "public update roster" on public.roster for update using (true) with check (true);
create policy "public delete roster" on public.roster for delete using (true);

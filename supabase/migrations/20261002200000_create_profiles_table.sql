-- Migration: 20261002200000_create_profiles_table.sql
-- Description: Create profiles table linked to auth.users (id, username unique, name, created_at) and triggers.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

-- Case-insensitive unique index on username
create unique index if not exists idx_profiles_username_lower on public.profiles (lower(username));

-- Enable RLS
alter table public.profiles enable row level security;

-- Policies for profiles
create policy "Users can view all profiles or their own"
  on public.profiles
  for select
  using (true);

create policy "Users can update their own profile"
  on public.profiles
  for update
  using (auth.uid() = id);

create policy "Users or service role can insert profiles"
  on public.profiles
  for insert
  with check (auth.uid() = id or auth.role() = 'service_role');

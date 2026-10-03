-- Migration: 20261002210000_add_shortcuts_token_to_profiles.sql
-- Description: Add shortcuts_token and shortcuts_token_created_at to public.profiles table

alter table public.profiles 
add column if not exists shortcuts_token text unique,
add column if not exists shortcuts_token_created_at timestamptz;

create index if not exists idx_profiles_shortcuts_token on public.profiles (shortcuts_token) where shortcuts_token is not null;

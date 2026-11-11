-- Migration: preferências por usuário (orçamentos por categoria, destinos de extrato que não são gasto…)
-- Uma linha por (usuário, chave), valor em JSON. Aplicar no Supabase: SQL Editor → colar → Run.
create table if not exists public.user_settings (
  user_id uuid not null,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_settings enable row level security;

create policy "user_settings_own_rows"
  on public.user_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

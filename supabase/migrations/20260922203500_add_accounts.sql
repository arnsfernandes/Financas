-- Migration: 20260922203500_add_accounts.sql
-- Description: Create accounts table and add account_id reference to transactions.

-- 1. Create accounts table
create table if not exists accounts (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  type         text not null check (type in ('bank_account', 'cash', 'credit_card', 'debit_card', 'digital_wallet', 'other')),
  institution  text,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Indexes for accounts
create index if not exists idx_accounts_active on accounts (active);
create index if not exists idx_accounts_type on accounts (type);

-- 2. Add account_id to transactions table
alter table if exists transactions
  add column if not exists account_id uuid references accounts (id) on delete set null;

-- Index for transactions account_id
create index if not exists idx_transactions_account_id on transactions (account_id);

-- 3. Insert initial default accounts if none exist
insert into accounts (name, type, institution, active)
select 'Carteira (Dinheiro)', 'cash', null, true
where not exists (select 1 from accounts where type = 'cash');

insert into accounts (name, type, institution, active)
select 'Conta Corrente Principal', 'bank_account', null, true
where not exists (select 1 from accounts where type = 'bank_account');

insert into accounts (name, type, institution, active)
select 'Cartão de Crédito', 'credit_card', null, true
where not exists (select 1 from accounts where type = 'credit_card');

-- Migration: 20260922214500_add_recurrence_and_installments.sql
-- Description: Add recurrence and installment fields to transactions table.

-- 1. Add recurrence fields
alter table if exists transactions
  add column if not exists is_recurring boolean not null default false,
  add column if not exists recurrence_frequency text check (recurrence_frequency in ('monthly', 'weekly', 'yearly') or recurrence_frequency is null),
  add column if not exists recurrence_next_date date,
  add column if not exists recurrence_status text not null default 'active' check (recurrence_status in ('active', 'ended'));

-- 2. Add installment fields
alter table if exists transactions
  add column if not exists installment_group_id uuid,
  add column if not exists installment_current integer,
  add column if not exists installment_total integer,
  add column if not exists installment_amount numeric(12, 2);

-- 3. Create indexes for recurrence and installment queries
create index if not exists idx_transactions_is_recurring on transactions (is_recurring);
create index if not exists idx_transactions_recurrence_status on transactions (recurrence_status);
create index if not exists idx_transactions_recurrence_next_date on transactions (recurrence_next_date);
create index if not exists idx_transactions_installment_group_id on transactions (installment_group_id);

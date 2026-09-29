-- Migration: 20260922195500_add_transaction_type.sql
-- Description: Add transaction type (expense | income) to transactions table, defaulting to expense.

-- 1. Add type column if it does not exist
alter table if exists transactions
  add column if not exists type text not null default 'expense';

-- 2. Ensure all existing records are marked as expense if null
update transactions
  set type = 'expense'
  where type is null or type = '';

-- 3. Add check constraint to ensure only 'expense' or 'income' are allowed
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transactions_type_check'
  ) then
    alter table transactions
      add constraint transactions_type_check check (type in ('expense', 'income'));
  end if;
end $$;

-- 4. Create index for fast filtering by transaction type
create index if not exists idx_transactions_type on transactions (type);

-- Migration: 20260923085500_add_recurrence_cycle_tracking.sql
-- Description: Add recurrence_parent_id and recurrence_cycle_date to transactions
--              along with unique constraint to guarantee production-grade idempotency and concurrency safety.

alter table transactions
  add column if not exists recurrence_parent_id uuid references transactions(id) on delete set null;

alter table transactions
  add column if not exists recurrence_cycle_date date;

-- Create unique index on (recurrence_parent_id, recurrence_cycle_date)
-- Note: NULLs are distinct in Postgres unless specified, so only non-null pairs are enforced uniquely.
create unique index if not exists idx_transactions_recurrence_cycle_unique
  on transactions (recurrence_parent_id, recurrence_cycle_date)
  where recurrence_parent_id is not null and recurrence_cycle_date is not null;

create index if not exists idx_transactions_recurrence_parent_id
  on transactions (recurrence_parent_id);

create index if not exists idx_transactions_recurrence_cycle_date
  on transactions (recurrence_cycle_date);

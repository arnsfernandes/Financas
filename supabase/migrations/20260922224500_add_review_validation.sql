-- Migration: 20260922224500_add_review_validation.sql
-- Description: Add review_status and review_reasons to transactions

alter table transactions
  add column if not exists review_status text not null default 'confirmed';

alter table transactions
  add column if not exists review_reasons text[] default '{}';

-- Add check constraint for review_status
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_transactions_review_status'
  ) then
    alter table transactions
      add constraint chk_transactions_review_status
      check (review_status in ('confirmed', 'needs_review'));
  end if;
end $$;

-- Index for review status
create index if not exists idx_transactions_review_status on transactions (review_status);

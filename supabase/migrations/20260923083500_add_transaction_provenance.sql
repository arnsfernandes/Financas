-- Migration: 20260923083500_add_transaction_provenance.sql
-- Description: Add traceability and provenance columns to transactions:
--   origin_type: 'text' | 'image' | 'manual'
--   raw_text: original text prompt/payload when provided
--   original_filename: original file or image name when provided
--   captured_at: timestamp when the transaction was captured/created
--   original_extracted_data: JSON snapshot of the original extracted fields prior to manual edits

alter table transactions
  add column if not exists origin_type text default 'image';

alter table transactions
  add column if not exists raw_text text;

alter table transactions
  add column if not exists original_filename text;

alter table transactions
  add column if not exists captured_at timestamptz default now();

alter table transactions
  add column if not exists original_extracted_data jsonb;

-- Check constraint on origin_type
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_transactions_origin_type'
  ) then
    alter table transactions
      add constraint chk_transactions_origin_type
      check (origin_type in ('text', 'image', 'manual') or origin_type is null);
  end if;
end $$;

-- Populate origin_type for existing records based on existing source_type if null
update transactions
set origin_type = case
  when source_type = 'text' then 'text'
  when source_type = 'manual' then 'manual'
  else 'image'
end
where origin_type is null;

-- Populate captured_at with created_at if captured_at is null
update transactions
set captured_at = created_at
where captured_at is null;

-- Create indexes for provenance queries
create index if not exists idx_transactions_origin_type on transactions (origin_type);
create index if not exists idx_transactions_captured_at on transactions (captured_at);

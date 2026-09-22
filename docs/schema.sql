-- Migration: 001_create_transactions_and_items.sql
-- Description: Create transactions and transaction_items tables with optimized indexes for querying expenses.

-- 1. Transactions table
create table if not exists transactions (
  id              uuid primary key default gen_random_uuid(),
  vendor          text,
  vendor_address  text,
  date            date,
  time            time,
  currency        text default 'BRL',
  category        text,
  subtotal        numeric(12, 2),
  tax             numeric(12, 2),
  tip             numeric(12, 2),
  total           numeric(12, 2) not null,
  payment_method  text,
  notes           text,
  source_type     text not null default 'image', -- 'image' or 'text'
  image_key       text,                          -- optional R2 storage key
  image_sha256    text,                          -- content hash
  created_at      timestamptz not null default now()
);

-- Indexes for transactions
create index if not exists idx_transactions_date on transactions (date);
create index if not exists idx_transactions_vendor on transactions (vendor);
create index if not exists idx_transactions_category on transactions (category);
create index if not exists idx_transactions_source_type on transactions (source_type);
create unique index if not exists idx_transactions_image_sha256
  on transactions (image_sha256) where image_sha256 is not null;

-- 2. Transaction Items table
create table if not exists transaction_items (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid not null references transactions (id) on delete cascade,
  description     text not null,
  normalized_name text,
  quantity        numeric(12, 3),
  unit_price      numeric(12, 2),
  total           numeric(12, 2),
  category        text,
  created_at      timestamptz not null default now()
);

-- Indexes for transaction items
create index if not exists idx_transaction_items_transaction_id on transaction_items (transaction_id);
create index if not exists idx_transaction_items_category on transaction_items (category);
create index if not exists idx_transaction_items_normalized_name on transaction_items (normalized_name);

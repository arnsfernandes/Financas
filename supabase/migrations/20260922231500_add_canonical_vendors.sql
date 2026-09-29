-- Migration: 20260922231500_add_canonical_vendors.sql
-- Description: Add canonical_vendors table and vendor_id relation in transactions.

-- 1. Create canonical_vendors table
create table if not exists canonical_vendors (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  normalized_key text not null unique,
  category text,
  aliases text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Add vendor_id column to transactions
alter table if exists transactions
  add column if not exists vendor_id uuid references canonical_vendors(id) on delete set null;

-- 3. Create indexes
create index if not exists idx_canonical_vendors_normalized_key on canonical_vendors (normalized_key);
create index if not exists idx_canonical_vendors_canonical_name on canonical_vendors (canonical_name);
create index if not exists idx_transactions_vendor_id on transactions (vendor_id);

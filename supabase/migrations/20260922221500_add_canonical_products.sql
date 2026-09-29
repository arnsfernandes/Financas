-- Migration: 20260922221500_add_canonical_products.sql
-- Description: Add canonical products and link transaction_items to canonical products.

-- 1. Create canonical_products table
create table if not exists canonical_products (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  normalized_key text not null unique,
  brand text,
  product_type text,
  unit_size text,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Add product_id to transaction_items
alter table if exists transaction_items
  add column if not exists product_id uuid references canonical_products(id) on delete set null;

-- 3. Create indexes
create index if not exists idx_canonical_products_normalized_key on canonical_products (normalized_key);
create index if not exists idx_canonical_products_canonical_name on canonical_products (canonical_name);
create index if not exists idx_canonical_products_brand on canonical_products (brand);
create index if not exists idx_transaction_items_product_id on transaction_items (product_id);

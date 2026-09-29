-- Migration: 20260923092500_add_shopping_lists.sql
-- Description: Create shopping_lists and shopping_list_items tables with RLS enabled and safe indexes.

-- 1. Create shopping_lists table
create table if not exists shopping_lists (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  status      text not null default 'active' check (status in ('active', 'archived', 'completed')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2. Create shopping_list_items table
create table if not exists shopping_list_items (
  id                uuid primary key default gen_random_uuid(),
  list_id           uuid not null references shopping_lists(id) on delete cascade,
  product_id        uuid references canonical_products(id) on delete set null,
  name              text not null,
  quantity          numeric(12, 3) not null default 1,
  unit              text,
  category          text,
  purchased         boolean not null default false,
  purchased_at      timestamptz,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 3. Indexes
create index if not exists idx_shopping_lists_status on shopping_lists(status);
create index if not exists idx_shopping_lists_created_at on shopping_lists(created_at);
create index if not exists idx_shopping_list_items_list_id on shopping_list_items(list_id);
create index if not exists idx_shopping_list_items_product_id on shopping_list_items(product_id);
create index if not exists idx_shopping_list_items_purchased on shopping_list_items(purchased);

-- 4. Enable RLS and revoke anon permissions (backend uses service role)
alter table shopping_lists enable row level security;
alter table shopping_list_items enable row level security;

revoke all on table shopping_lists from anon, authenticated;
revoke all on table shopping_list_items from anon, authenticated;


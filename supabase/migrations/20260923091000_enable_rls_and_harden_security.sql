-- Migration: 20260923091000_enable_rls_and_harden_security.sql
-- Description: Enable Row Level Security (RLS) on all sensitive tables and revoke direct public/anon access.
--              Backend uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS) so all Next.js API routes continue functioning seamlessly.

-- 1. Enable RLS on core financial and metadata tables
alter table if exists transactions enable row level security;
alter table if exists transaction_items enable row level security;
alter table if exists accounts enable row level security;
alter table if exists canonical_products enable row level security;
alter table if exists canonical_vendors enable row level security;

-- 2. Revoke direct public/anon/authenticated permissions from sensitive tables
--    This prevents unauthorized direct read/write attempts using anon keys against PostgREST
revoke all on table transactions from anon, authenticated;
revoke all on table transaction_items from anon, authenticated;
revoke all on table accounts from anon, authenticated;
revoke all on table canonical_products from anon, authenticated;
revoke all on table canonical_vendors from anon, authenticated;


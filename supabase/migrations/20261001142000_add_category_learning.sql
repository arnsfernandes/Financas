-- Migration: 20261001142000_add_category_learning.sql
-- Description: Create category_learning table to store user-learned categorization preferences.

CREATE TABLE IF NOT EXISTS public.category_learning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_key TEXT NOT NULL,
  vendor_display TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  category_name TEXT NOT NULL,
  transaction_type TEXT NOT NULL DEFAULT 'expense' CHECK (transaction_type IN ('expense', 'income')),
  source TEXT NOT NULL DEFAULT 'user_correction' CHECK (source IN ('user_correction', 'user_creation')),
  item_keyword TEXT,
  correction_count INT NOT NULL DEFAULT 1,
  confidence NUMERIC(3, 2) NOT NULL DEFAULT 1.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique index to ensure one learned rule per vendor_key + transaction_type + item_keyword combination
CREATE UNIQUE INDEX IF NOT EXISTS uq_category_learning_vendor_type_keyword 
  ON public.category_learning(vendor_key, transaction_type, COALESCE(item_keyword, ''));

CREATE INDEX IF NOT EXISTS idx_category_learning_vendor_key ON public.category_learning(vendor_key);
CREATE INDEX IF NOT EXISTS idx_category_learning_category_id ON public.category_learning(category_id);

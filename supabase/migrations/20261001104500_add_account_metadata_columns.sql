-- Migration: Add account metadata columns (closing_day, due_day, custom_logo, color, skin)
-- This migration extends the accounts table to support credit card cycle days and visual styling directly in Supabase.

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS closing_day INTEGER CHECK (closing_day BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS due_day INTEGER CHECK (due_day BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS custom_logo TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS skin TEXT;

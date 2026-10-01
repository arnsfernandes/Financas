-- Migration: Add Reserves and Reserve Movements tables
-- This migration creates public.reserves and public.reserve_movements with proper constraints and indexes.

CREATE TABLE IF NOT EXISTS public.reserves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  target_amount NUMERIC(12, 2) DEFAULT NULL,
  current_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  color TEXT,
  icon TEXT,
  deadline DATE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reserves_account_id ON public.reserves(account_id);

CREATE TABLE IF NOT EXISTS public.reserve_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reserve_id UUID NOT NULL REFERENCES public.reserves(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'withdraw')),
  description TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reserve_movements_reserve_id ON public.reserve_movements(reserve_id);
CREATE INDEX IF NOT EXISTS idx_reserve_movements_date ON public.reserve_movements(date DESC);

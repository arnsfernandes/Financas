-- Migration: 20261002220000_isolate_data_by_user.sql
-- Description: Add user_id column to user-owned financial tables, assign existing records to single owner user,
--              create indices, and configure Row Level Security (RLS) with user_id = auth.uid().

DO $$
DECLARE
  v_owner_user_id UUID := 'bc5a76de-8865-4ec3-b7d5-5dfbfb8123a6';
BEGIN

  -- 1. ACCOUNTS TABLE
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accounts') THEN
    ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    UPDATE public.accounts SET user_id = v_owner_user_id WHERE user_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON public.accounts(user_id);
    
    ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can view own accounts" ON public.accounts;
    DROP POLICY IF EXISTS "Users can insert own accounts" ON public.accounts;
    DROP POLICY IF EXISTS "Users can update own accounts" ON public.accounts;
    DROP POLICY IF EXISTS "Users can delete own accounts" ON public.accounts;

    CREATE POLICY "Users can view own accounts" ON public.accounts
      FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY "Users can insert own accounts" ON public.accounts
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    CREATE POLICY "Users can update own accounts" ON public.accounts
      FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    CREATE POLICY "Users can delete own accounts" ON public.accounts
      FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;

  -- 2. TRANSACTIONS TABLE
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transactions') THEN
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    UPDATE public.transactions SET user_id = v_owner_user_id WHERE user_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
    
    ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
    DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;
    DROP POLICY IF EXISTS "Users can update own transactions" ON public.transactions;
    DROP POLICY IF EXISTS "Users can delete own transactions" ON public.transactions;

    CREATE POLICY "Users can view own transactions" ON public.transactions
      FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY "Users can insert own transactions" ON public.transactions
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    CREATE POLICY "Users can update own transactions" ON public.transactions
      FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    CREATE POLICY "Users can delete own transactions" ON public.transactions
      FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;

  -- 3. TRANSACTION ITEMS TABLE
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transaction_items') THEN
    ALTER TABLE public.transaction_items ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    UPDATE public.transaction_items ti
      SET user_id = COALESCE(t.user_id, v_owner_user_id)
      FROM public.transactions t
      WHERE ti.transaction_id = t.id AND ti.user_id IS NULL;
    UPDATE public.transaction_items SET user_id = v_owner_user_id WHERE user_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_transaction_items_user_id ON public.transaction_items(user_id);

    ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can view own transaction items" ON public.transaction_items;
    DROP POLICY IF EXISTS "Users can insert own transaction items" ON public.transaction_items;
    DROP POLICY IF EXISTS "Users can update own transaction items" ON public.transaction_items;
    DROP POLICY IF EXISTS "Users can delete own transaction items" ON public.transaction_items;

    CREATE POLICY "Users can view own transaction items" ON public.transaction_items
      FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY "Users can insert own transaction items" ON public.transaction_items
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    CREATE POLICY "Users can update own transaction items" ON public.transaction_items
      FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    CREATE POLICY "Users can delete own transaction items" ON public.transaction_items
      FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;

  -- 4. RESERVES TABLE
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reserves') THEN
    ALTER TABLE public.reserves ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    UPDATE public.reserves SET user_id = v_owner_user_id WHERE user_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_reserves_user_id ON public.reserves(user_id);

    ALTER TABLE public.reserves ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can view own reserves" ON public.reserves;
    DROP POLICY IF EXISTS "Users can insert own reserves" ON public.reserves;
    DROP POLICY IF EXISTS "Users can update own reserves" ON public.reserves;
    DROP POLICY IF EXISTS "Users can delete own reserves" ON public.reserves;

    CREATE POLICY "Users can view own reserves" ON public.reserves
      FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY "Users can insert own reserves" ON public.reserves
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    CREATE POLICY "Users can update own reserves" ON public.reserves
      FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    CREATE POLICY "Users can delete own reserves" ON public.reserves
      FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;

  -- 5. RESERVE MOVEMENTS TABLE
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reserve_movements') THEN
    ALTER TABLE public.reserve_movements ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    UPDATE public.reserve_movements rm
      SET user_id = COALESCE(r.user_id, v_owner_user_id)
      FROM public.reserves r
      WHERE rm.reserve_id = r.id AND rm.user_id IS NULL;
    UPDATE public.reserve_movements SET user_id = v_owner_user_id WHERE user_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_reserve_movements_user_id ON public.reserve_movements(user_id);

    ALTER TABLE public.reserve_movements ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can view own reserve movements" ON public.reserve_movements;
    DROP POLICY IF EXISTS "Users can insert own reserve movements" ON public.reserve_movements;
    DROP POLICY IF EXISTS "Users can update own reserve movements" ON public.reserve_movements;
    DROP POLICY IF EXISTS "Users can delete own reserve movements" ON public.reserve_movements;

    CREATE POLICY "Users can view own reserve movements" ON public.reserve_movements
      FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY "Users can insert own reserve movements" ON public.reserve_movements
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    CREATE POLICY "Users can update own reserve movements" ON public.reserve_movements
      FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    CREATE POLICY "Users can delete own reserve movements" ON public.reserve_movements
      FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;

  -- 6. CREDIT CARD INVOICES TABLE
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'credit_card_invoices') THEN
    ALTER TABLE public.credit_card_invoices ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    UPDATE public.credit_card_invoices cci
      SET user_id = COALESCE(a.user_id, v_owner_user_id)
      FROM public.accounts a
      WHERE cci.account_id = a.id AND cci.user_id IS NULL;
    UPDATE public.credit_card_invoices SET user_id = v_owner_user_id WHERE user_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_credit_card_invoices_user_id ON public.credit_card_invoices(user_id);

    ALTER TABLE public.credit_card_invoices ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can view own credit card invoices" ON public.credit_card_invoices;
    DROP POLICY IF EXISTS "Users can insert own credit card invoices" ON public.credit_card_invoices;
    DROP POLICY IF EXISTS "Users can update own credit card invoices" ON public.credit_card_invoices;
    DROP POLICY IF EXISTS "Users can delete own credit card invoices" ON public.credit_card_invoices;

    CREATE POLICY "Users can view own credit card invoices" ON public.credit_card_invoices
      FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY "Users can insert own credit card invoices" ON public.credit_card_invoices
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    CREATE POLICY "Users can update own credit card invoices" ON public.credit_card_invoices
      FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    CREATE POLICY "Users can delete own credit card invoices" ON public.credit_card_invoices
      FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;

  -- 7. INVOICE PAYMENTS TABLE
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoice_payments') THEN
    ALTER TABLE public.invoice_payments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    UPDATE public.invoice_payments ip
      SET user_id = COALESCE(cci.user_id, v_owner_user_id)
      FROM public.credit_card_invoices cci
      WHERE ip.invoice_id = cci.id AND ip.user_id IS NULL;
    UPDATE public.invoice_payments SET user_id = v_owner_user_id WHERE user_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_invoice_payments_user_id ON public.invoice_payments(user_id);

    ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can view own invoice payments" ON public.invoice_payments;
    DROP POLICY IF EXISTS "Users can insert own invoice payments" ON public.invoice_payments;
    DROP POLICY IF EXISTS "Users can update own invoice payments" ON public.invoice_payments;
    DROP POLICY IF EXISTS "Users can delete own invoice payments" ON public.invoice_payments;

    CREATE POLICY "Users can view own invoice payments" ON public.invoice_payments
      FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY "Users can insert own invoice payments" ON public.invoice_payments
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    CREATE POLICY "Users can update own invoice payments" ON public.invoice_payments
      FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    CREATE POLICY "Users can delete own invoice payments" ON public.invoice_payments
      FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;

  -- 8. CATEGORIES TABLE (User custom categories + system categories visible to all)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'categories') THEN
    ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    UPDATE public.categories SET user_id = v_owner_user_id WHERE is_system = false AND user_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_categories_user_id ON public.categories(user_id);

    -- Adjust unique constraint to allow different users to create category with same normalized name
    ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS uq_categories_normalized_type;

    ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can view system and own categories" ON public.categories;
    DROP POLICY IF EXISTS "Users can insert own categories" ON public.categories;
    DROP POLICY IF EXISTS "Users can update own categories" ON public.categories;
    DROP POLICY IF EXISTS "Users can delete own categories" ON public.categories;

    CREATE POLICY "Users can view system and own categories" ON public.categories
      FOR SELECT TO authenticated USING (is_system = true OR user_id = auth.uid());
    CREATE POLICY "Users can insert own categories" ON public.categories
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND is_system = false);
    CREATE POLICY "Users can update own categories" ON public.categories
      FOR UPDATE TO authenticated USING (user_id = auth.uid() AND is_system = false) WITH CHECK (user_id = auth.uid() AND is_system = false);
    CREATE POLICY "Users can delete own categories" ON public.categories
      FOR DELETE TO authenticated USING (user_id = auth.uid() AND is_system = false);
  END IF;

  -- 9. CATEGORY LEARNING TABLE
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'category_learning') THEN
    ALTER TABLE public.category_learning ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    UPDATE public.category_learning SET user_id = v_owner_user_id WHERE user_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_category_learning_user_id ON public.category_learning(user_id);

    ALTER TABLE public.category_learning ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can view own category learning" ON public.category_learning;
    DROP POLICY IF EXISTS "Users can insert own category learning" ON public.category_learning;
    DROP POLICY IF EXISTS "Users can update own category learning" ON public.category_learning;
    DROP POLICY IF EXISTS "Users can delete own category learning" ON public.category_learning;

    CREATE POLICY "Users can view own category learning" ON public.category_learning
      FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY "Users can insert own category learning" ON public.category_learning
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    CREATE POLICY "Users can update own category learning" ON public.category_learning
      FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    CREATE POLICY "Users can delete own category learning" ON public.category_learning
      FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;

  -- 10. SHOPPING LISTS & ITEMS TABLES
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shopping_lists') THEN
    ALTER TABLE public.shopping_lists ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    UPDATE public.shopping_lists SET user_id = v_owner_user_id WHERE user_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_shopping_lists_user_id ON public.shopping_lists(user_id);

    ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can view own shopping lists" ON public.shopping_lists;
    DROP POLICY IF EXISTS "Users can insert own shopping lists" ON public.shopping_lists;
    DROP POLICY IF EXISTS "Users can update own shopping lists" ON public.shopping_lists;
    DROP POLICY IF EXISTS "Users can delete own shopping lists" ON public.shopping_lists;

    CREATE POLICY "Users can view own shopping lists" ON public.shopping_lists
      FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY "Users can insert own shopping lists" ON public.shopping_lists
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    CREATE POLICY "Users can update own shopping lists" ON public.shopping_lists
      FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    CREATE POLICY "Users can delete own shopping lists" ON public.shopping_lists
      FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shopping_list_items') THEN
    ALTER TABLE public.shopping_list_items ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    UPDATE public.shopping_list_items sli
      SET user_id = COALESCE(sl.user_id, v_owner_user_id)
      FROM public.shopping_lists sl
      WHERE sli.list_id = sl.id AND sli.user_id IS NULL;
    UPDATE public.shopping_list_items SET user_id = v_owner_user_id WHERE user_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_shopping_list_items_user_id ON public.shopping_list_items(user_id);

    ALTER TABLE public.shopping_list_items ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can view own shopping list items" ON public.shopping_list_items;
    DROP POLICY IF EXISTS "Users can insert own shopping list items" ON public.shopping_list_items;
    DROP POLICY IF EXISTS "Users can update own shopping list items" ON public.shopping_list_items;
    DROP POLICY IF EXISTS "Users can delete own shopping list items" ON public.shopping_list_items;

    CREATE POLICY "Users can view own shopping list items" ON public.shopping_list_items
      FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY "Users can insert own shopping list items" ON public.shopping_list_items
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    CREATE POLICY "Users can update own shopping list items" ON public.shopping_list_items
      FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    CREATE POLICY "Users can delete own shopping list items" ON public.shopping_list_items
      FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;

  -- 11. REMINDER LOGS & PREFERENCES TABLES (if present)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reminder_preferences') THEN
    ALTER TABLE public.reminder_preferences ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    UPDATE public.reminder_preferences SET auth_user_id = v_owner_user_id WHERE auth_user_id IS NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reminder_logs') THEN
    ALTER TABLE public.reminder_logs ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    UPDATE public.reminder_logs SET auth_user_id = v_owner_user_id WHERE auth_user_id IS NULL;
  END IF;

END $$;

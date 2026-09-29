-- Migration: 20260924151500_add_categories.sql
-- Description: Create categories table, add category_id to transactions, seed system categories, and migrate existing transactions.

create extension if not exists unaccent;

-- 1. Create categories table
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name varchar(60) not null,
  normalized_name varchar(60) not null,
  type varchar(10) not null check (type in ('expense', 'income')),
  icon varchar(40) not null default 'Tag',
  color varchar(20) not null default '#2F68FE',
  is_system boolean not null default false,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_categories_normalized_type unique (normalized_name, type)
);

-- Enable RLS and protect table
alter table if exists categories enable row level security;
revoke all on table categories from anon, authenticated;

-- 2. Add category_id FK to transactions
alter table transactions 
  add column if not exists category_id uuid references categories(id) on delete set null;

create index if not exists idx_transactions_category_id on transactions(category_id);
create index if not exists idx_categories_type_active on categories(type, active);

-- 3. Seed default system categories for EXPENSES
insert into categories (name, normalized_name, type, icon, color, is_system, sort_order)
values
  ('Alimentação', 'alimentacao', 'expense', 'UtensilsCrossed', '#F97316', true, 1),
  ('Mercado', 'mercado', 'expense', 'ShoppingCart', '#10B981', true, 2),
  ('Moradia', 'moradia', 'expense', 'Home', '#6366F1', true, 3),
  ('Transporte', 'transporte', 'expense', 'Car', '#3B82F6', true, 4),
  ('Saúde', 'saude', 'expense', 'HeartPulse', '#EC4899', true, 5),
  ('Lazer', 'lazer', 'expense', 'PartyPopper', '#8B5CF6', true, 6),
  ('Compras', 'compras', 'expense', 'ShoppingBag', '#06B6D4', true, 7),
  ('Educação', 'educacao', 'expense', 'GraduationCap', '#F59E0B', true, 8),
  ('Assinaturas', 'assinaturas', 'expense', 'Repeat', '#2F68FE', true, 9),
  ('Serviços', 'servicos', 'expense', 'Wrench', '#64748B', true, 10),
  ('Impostos & Tarifas', 'impostos e tarifas', 'expense', 'Receipt', '#94A3B8', true, 11),
  ('Outros', 'outros', 'expense', 'MoreHorizontal', '#9CA3AF', true, 99)
on conflict (normalized_name, type) do nothing;

-- Seed default system categories for INCOMES
insert into categories (name, normalized_name, type, icon, color, is_system, sort_order)
values
  ('Salário', 'salario', 'income', 'Briefcase', '#10B981', true, 1),
  ('Freelance', 'freelance', 'income', 'Laptop', '#2F68FE', true, 2),
  ('Vendas', 'vendas', 'income', 'TrendingUp', '#06B6D4', true, 3),
  ('Rendimentos', 'rendimentos', 'income', 'LineChart', '#8B5CF6', true, 4),
  ('Reembolsos', 'reembolsos', 'income', 'RotateCcw', '#F59E0B', true, 5),
  ('Outros', 'outros', 'income', 'PlusCircle', '#9CA3AF', true, 99)
on conflict (normalized_name, type) do nothing;

-- 4. Backfill existing transactions to canonical categories

-- 4.1 Despesas: Mercado
update transactions t
set category_id = c.id
from categories c
where c.type = 'expense' and c.normalized_name = 'mercado'
  and t.type = 'expense'
  and t.category_id is null
  and lower(trim(unaccent(coalesce(t.category, '')))) in (
    'groceries', 'grocery', 'supermarket', 'supermercado', 'mercado', 'mercado / supermercado'
  );

-- 4.2 Despesas: Alimentação
update transactions t
set category_id = c.id
from categories c
where c.type = 'expense' and c.normalized_name = 'alimentacao'
  and t.type = 'expense'
  and t.category_id is null
  and lower(trim(unaccent(coalesce(t.category, '')))) in (
    'dining', 'restaurant', 'restaurante', 'food', 'alimentacao', 'alimentacao & restaurante', 'lanche', 'refeicao'
  );

-- 4.3 Despesas: Transporte
update transactions t
set category_id = c.id
from categories c
where c.type = 'expense' and c.normalized_name = 'transporte'
  and t.type = 'expense'
  and t.category_id is null
  and lower(trim(unaccent(coalesce(t.category, '')))) in (
    'transportation', 'transport', 'fuel', 'gas', 'combustivel', 'transporte', 'transporte & combustivel', 'uber'
  );

-- 4.4 Despesas: Moradia
update transactions t
set category_id = c.id
from categories c
where c.type = 'expense' and c.normalized_name = 'moradia'
  and t.type = 'expense'
  and t.category_id is null
  and lower(trim(unaccent(coalesce(t.category, '')))) in (
    'utilities', 'bills', 'contas', 'contas & servicos', 'moradia', 'aluguel', 'luz', 'agua', 'internet'
  );

-- 4.5 Despesas: Saúde
update transactions t
set category_id = c.id
from categories c
where c.type = 'expense' and c.normalized_name = 'saude'
  and t.type = 'expense'
  and t.category_id is null
  and lower(trim(unaccent(coalesce(t.category, '')))) in (
    'health', 'pharmacy', 'farmacia', 'saude', 'saude & farmacia', 'medico'
  );

-- 4.6 Despesas: Lazer
update transactions t
set category_id = c.id
from categories c
where c.type = 'expense' and c.normalized_name = 'lazer'
  and t.type = 'expense'
  and t.category_id is null
  and lower(trim(unaccent(coalesce(t.category, '')))) in (
    'entertainment', 'lazer', 'lazer & entretenimento', 'cinema', 'jogos'
  );

-- 4.7 Despesas: Compras
update transactions t
set category_id = c.id
from categories c
where c.type = 'expense' and c.normalized_name = 'compras'
  and t.type = 'expense'
  and t.category_id is null
  and lower(trim(unaccent(coalesce(t.category, '')))) in (
    'shopping', 'clothing', 'vestuario', 'eletronicos', 'electronics', 'compras & vestuario', 'eletronicos & tecnologia', 'tecnologia'
  );

-- 4.8 Despesas: Serviços & Outros conhecidos
update transactions t
set category_id = c.id
from categories c
where c.type = 'expense' and c.normalized_name = 'servicos'
  and t.type = 'expense'
  and t.category_id is null
  and lower(trim(unaccent(coalesce(t.category, '')))) in (
    'office supplies', 'office', 'papelaria', 'servicos'
  );

-- 4.9 Receitas: Salário
update transactions t
set category_id = c.id
from categories c
where c.type = 'income' and c.normalized_name = 'salario'
  and t.type = 'income'
  and t.category_id is null
  and lower(trim(unaccent(coalesce(t.category, '')))) in (
    'salary', 'salario', 'pagamento'
  );

-- 4.10 Receitas: Freelance
update transactions t
set category_id = c.id
from categories c
where c.type = 'income' and c.normalized_name = 'freelance'
  and t.type = 'income'
  and t.category_id is null
  and lower(trim(unaccent(coalesce(t.category, '')))) in (
    'freelance', 'bico', 'consultoria'
  );

-- 4.11 Receitas: Vendas
update transactions t
set category_id = c.id
from categories c
where c.type = 'income' and c.normalized_name = 'vendas'
  and t.type = 'income'
  and t.category_id is null
  and lower(trim(unaccent(coalesce(t.category, '')))) in (
    'sale', 'sales', 'venda', 'vendas'
  );

-- 4.12 Receitas: Reembolsos
update transactions t
set category_id = c.id
from categories c
where c.type = 'income' and c.normalized_name = 'reembolsos'
  and t.type = 'income'
  and t.category_id is null
  and lower(trim(unaccent(coalesce(t.category, '')))) in (
    'refund', 'reembolso', 'reembolsos', 'reimbursement', 'estorno'
  );

-- 4.13 Receitas: Rendimentos
update transactions t
set category_id = c.id
from categories c
where c.type = 'income' and c.normalized_name = 'rendimentos'
  and t.type = 'income'
  and t.category_id is null
  and lower(trim(unaccent(coalesce(t.category, '')))) in (
    'investments', 'rendimentos', 'investimento', 'investimentos', 'dividendos', 'yield'
  );

-- 4.14 Fallback: Todas as despesas restantes sem category_id recebem "Outros" (despesa)
update transactions t
set category_id = c.id
from categories c
where c.type = 'expense' and c.normalized_name = 'outros'
  and t.type = 'expense'
  and t.category_id is null;

-- 4.15 Fallback: Todas as receitas restantes sem category_id recebem "Outros" (receita)
update transactions t
set category_id = c.id
from categories c
where c.type = 'income' and c.normalized_name = 'outros'
  and t.type = 'income'
  and t.category_id is null;


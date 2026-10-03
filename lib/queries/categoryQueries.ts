import { getSupabaseClient } from '../persist'
import type { Category } from '../schema'

export function normalizeCategoryName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export interface CategoryFilter {
  userId?: string
  type?: 'expense' | 'income' | 'all'
  activeOnly?: boolean
}

/**
 * List categories from Supabase
 */
export async function listCategories(options: CategoryFilter = { activeOnly: false }): Promise<Category[]> {
  const supabase = getSupabaseClient()
  const defaultList: Category[] = [
    { id: 'cat-mercado', name: 'Mercado', normalized_name: 'mercado', type: 'expense', icon: 'ShoppingCart', color: '#10B981', is_system: true, active: true, sort_order: 1 },
    { id: 'cat-alimentacao', name: 'Alimentação', normalized_name: 'alimentacao', type: 'expense', icon: 'UtensilsCrossed', color: '#F97316', is_system: true, active: true, sort_order: 2 },
    { id: 'cat-moradia', name: 'Moradia', normalized_name: 'moradia', type: 'expense', icon: 'Home', color: '#6366F1', is_system: true, active: true, sort_order: 3 },
    { id: 'cat-transporte', name: 'Transporte', normalized_name: 'transporte', type: 'expense', icon: 'Car', color: '#3B82F6', is_system: true, active: true, sort_order: 4 },
    { id: 'cat-saude', name: 'Saúde', normalized_name: 'saude', type: 'expense', icon: 'HeartPulse', color: '#EC4899', is_system: true, active: true, sort_order: 5 },
    { id: 'cat-lazer', name: 'Lazer', normalized_name: 'lazer', type: 'expense', icon: 'PartyPopper', color: '#8B5CF6', is_system: true, active: true, sort_order: 6 },
    { id: 'cat-compras', name: 'Compras', normalized_name: 'compras', type: 'expense', icon: 'ShoppingBag', color: '#06B6D4', is_system: true, active: true, sort_order: 7 },
    { id: 'cat-educacao', name: 'Educação', normalized_name: 'educacao', type: 'expense', icon: 'GraduationCap', color: '#F59E0B', is_system: true, active: true, sort_order: 8 },
    { id: 'cat-assinaturas', name: 'Assinaturas', normalized_name: 'assinaturas', type: 'expense', icon: 'Repeat', color: '#2F68FE', is_system: true, active: true, sort_order: 9 },
    { id: 'cat-servicos', name: 'Serviços', normalized_name: 'servicos', type: 'expense', icon: 'Wrench', color: '#64748B', is_system: true, active: true, sort_order: 10 },
    { id: 'cat-impostos', name: 'Impostos & Tarifas', normalized_name: 'impostos e tarifas', type: 'expense', icon: 'Receipt', color: '#94A3B8', is_system: true, active: true, sort_order: 11 },
    { id: 'cat-outros-exp', name: 'Outros', normalized_name: 'outros', type: 'expense', icon: 'MoreHorizontal', color: '#9CA3AF', is_system: true, active: true, sort_order: 99 },
    { id: 'cat-salario', name: 'Salário', normalized_name: 'salario', type: 'income', icon: 'Briefcase', color: '#10B981', is_system: true, active: true, sort_order: 1 },
    { id: 'cat-freelance', name: 'Freelance', normalized_name: 'freelance', type: 'income', icon: 'Laptop', color: '#2F68FE', is_system: true, active: true, sort_order: 2 },
    { id: 'cat-vendas', name: 'Vendas', normalized_name: 'vendas', type: 'income', icon: 'TrendingUp', color: '#06B6D4', is_system: true, active: true, sort_order: 3 },
    { id: 'cat-rendimentos', name: 'Rendimentos', normalized_name: 'rendimentos', type: 'income', icon: 'LineChart', color: '#8B5CF6', is_system: true, active: true, sort_order: 4 },
    { id: 'cat-reembolsos', name: 'Reembolsos', normalized_name: 'reembolsos', type: 'income', icon: 'RotateCcw', color: '#F59E0B', is_system: true, active: true, sort_order: 5 },
    { id: 'cat-outros-inc', name: 'Outros', normalized_name: 'outros', type: 'income', icon: 'PlusCircle', color: '#9CA3AF', is_system: true, active: true, sort_order: 99 },
  ]

  function filterDefault(list: Category[]) {
    return list.filter((c) => {
      if (options.type && options.type !== 'all' && c.type !== options.type) return false
      if (options.activeOnly && !c.active) return false
      return true
    })
  }

  if (!supabase || typeof supabase.from !== 'function') {
    return filterDefault(defaultList)
  }

  try {
    const fromRes = supabase.from('categories')
    if (!fromRes || typeof fromRes.select !== 'function') {
      return filterDefault(defaultList)
    }
    let query = fromRes.select('*').order('sort_order', { ascending: true }).order('name', { ascending: true })

    if (options.userId) {
      query = query.or(`is_system.eq.true,user_id.eq.${options.userId}`)
    }

    if (options.type && options.type !== 'all') {
      query = query.eq('type', options.type)
    }

    if (options.activeOnly) {
      query = query.eq('active', true)
    }

    const { data, error } = await query
    if (error) {
      console.warn('Could not query categories table directly, falling back to defaults:', error.message)
      return filterDefault(defaultList)
    }

    return (data || []) as Category[]
  } catch (e) {
    console.warn('Exception querying categories, using defaults:', e)
    return filterDefault(defaultList)
  }
}

/**
 * Create a new category in Supabase
 */
export async function createCategory(input: {
  userId?: string | null
  name: string
  type: 'expense' | 'income'
  icon?: string
  color?: string
  sortOrder?: number
}): Promise<Category> {
  const supabase = getSupabaseClient()
  const trimmedName = input.name.trim()
  const normalized = normalizeCategoryName(trimmedName)
  const userId = input.userId || 'bc5a76de-8865-4ec3-b7d5-5dfbfb8123a6'

  if (!supabase) {
    return {
      id: `mock-cat-${Date.now()}`,
      user_id: userId,
      name: trimmedName,
      normalized_name: normalized,
      type: input.type,
      icon: input.icon || 'Tag',
      color: input.color || '#2F68FE',
      is_system: false,
      active: true,
      sort_order: input.sortOrder || 50,
    }
  }

  // Verificar se já existe categoria com o mesmo normalized_name e type para este usuário
  let existingQuery = supabase
    .from('categories')
    .select('*')
    .eq('normalized_name', normalized)
    .eq('type', input.type)

  if (userId) {
    existingQuery = existingQuery.or(`is_system.eq.true,user_id.eq.${userId}`)
  }

  const { data: existing } = await existingQuery.maybeSingle()

  if (existing) {
    if (!existing.active) {
      // Reativar se estava desativada
      const { data: reactivated, error: reactivateErr } = await supabase
        .from('categories')
        .update({
          active: true,
          name: trimmedName,
          icon: input.icon || existing.icon,
          color: input.color || existing.color,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('*')
        .single()

      if (reactivateErr) throw new Error(reactivateErr.message)
      return reactivated as Category
    }
    return existing as Category
  }

  const { data, error } = await supabase
    .from('categories')
    .insert({
      user_id: userId,
      name: trimmedName,
      normalized_name: normalized,
      type: input.type,
      icon: input.icon || 'Tag',
      color: input.color || '#2F68FE',
      is_system: false,
      active: true,
      sort_order: input.sortOrder || 50,
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(`Failed to create category: ${error.message}`)
  }

  return data as Category
}

/**
 * Update an existing category (name, icon, color, active status).
 * Protects system categories from being completely deleted or breaking critical fallbacks.
 */
export async function updateCategory(
  id: string,
  input: {
    name?: string
    icon?: string
    color?: string
    active?: boolean
    sortOrder?: number
  }
): Promise<Category> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      id,
      name: input.name || 'Mock Category',
      type: 'expense',
      icon: input.icon || 'Tag',
      color: input.color || '#2F68FE',
      is_system: false,
      active: input.active ?? true,
      sort_order: input.sortOrder || 0,
    }
  }

  // Buscar categoria atual
  const { data: current, error: findError } = await supabase
    .from('categories')
    .select('*')
    .eq('id', id)
    .single()

  if (findError || !current) {
    throw new Error('Categoria não encontrada.')
  }

  // Impedir desativação da categoria "Outros" do sistema pois serve de fallback obrigatório
  if (current.is_system && current.normalized_name === 'outros' && input.active === false) {
    throw new Error('A categoria "Outros" é essencial para o sistema e não pode ser desativada.')
  }

  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  }

  if (input.name !== undefined) {
    const trimmed = input.name.trim()
    updates.name = trimmed
    updates.normalized_name = normalizeCategoryName(trimmed)
  }
  if (input.icon !== undefined) updates.icon = input.icon.trim()
  if (input.color !== undefined) updates.color = input.color.trim()
  if (input.active !== undefined) updates.active = input.active
  if (input.sortOrder !== undefined) updates.sort_order = input.sortOrder

  const { data, error } = await supabase
    .from('categories')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    throw new Error(`Failed to update category: ${error.message}`)
  }

  return data as Category
}

/**
 * Maps English / standard categories to clean, user-friendly Portuguese labels
 */
export function translateCategory(cat?: string | null): string {
  if (!cat || !cat.trim()) return 'Outros'
  const normalized = cat.trim().toLowerCase()

  const mapping: Record<string, string> = {
    // Expense categories
    groceries: 'Mercado / Supermercado',
    grocery: 'Mercado / Supermercado',
    supermarket: 'Mercado / Supermercado',
    supermercado: 'Mercado / Supermercado',
    mercado: 'Mercado / Supermercado',
    dining: 'Alimentação & Restaurante',
    restaurant: 'Alimentação & Restaurante',
    food: 'Alimentação & Restaurante',
    alimentacao: 'Alimentação & Restaurante',
    lanche: 'Alimentação & Restaurante',
    health: 'Saúde & Farmácia',
    pharmacy: 'Saúde & Farmácia',
    farmacia: 'Saúde & Farmácia',
    saude: 'Saúde & Farmácia',
    transportation: 'Transporte & Combustível',
    transport: 'Transporte & Combustível',
    fuel: 'Transporte & Combustível',
    gas: 'Transporte & Combustível',
    combustivel: 'Transporte & Combustível',
    transporte: 'Transporte & Combustível',
    utilities: 'Contas & Serviços',
    bills: 'Contas & Serviços',
    contas: 'Contas & Serviços',
    servicos: 'Contas & Serviços',
    'office supplies': 'Escritório & Papelaria',
    office: 'Escritório & Papelaria',
    papelaria: 'Escritório & Papelaria',
    entertainment: 'Lazer & Entretenimento',
    lazer: 'Lazer & Entretenimento',
    entretenimento: 'Lazer & Entretenimento',
    electronics: 'Eletrônicos & Tecnologia',
    tecnologia: 'Eletrônicos & Tecnologia',
    eletronicos: 'Eletrônicos & Tecnologia',
    shopping: 'Compras & Vestuário',
    clothing: 'Compras & Vestuário',
    vestuario: 'Compras & Vestuário',
    pantry: 'Despensa & Mercearia',
    dairy: 'Laticínios',
    laticinios: 'Laticínios',
    produce: 'Hortifrúti',
    hortifruti: 'Hortifrúti',
    bakery: 'Padaria',
    padaria: 'Padaria',
    beverages: 'Bebidas',
    bebidas: 'Bebidas',
    cleaning: 'Limpeza',
    limpeza: 'Limpeza',
    hardware: 'Construção & Casa',

    // Income categories
    salario: 'Salário',
    salary: 'Salário',
    freelance: 'Freelance',
    venda: 'Venda',
    sale: 'Venda',
    sales: 'Venda',
    reembolso: 'Reembolso',
    refund: 'Reembolso',
    reimbursement: 'Reembolso',
    rendimentos: 'Rendimentos',
    investments: 'Rendimentos',
    investimento: 'Rendimentos',
    yield: 'Rendimentos',
    dividendos: 'Rendimentos',

    miscellaneous: 'Outros',
    outros: 'Outros',
    others: 'Outros',
    other: 'Outros',
  }

  return mapping[normalized] || cat.trim()
}

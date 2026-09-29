import { getSupabaseClient, normalizeItemName } from './persist'
import type { Account, AccountType, Category } from './schema'
import { resolveInstallmentPlan, syncInstallmentGroup } from './installments'
import {
  resolveRecurrenceUpdate,
  projectRecurringTransactions,
  getUpcomingRecurringCommitments,
} from './recurrence'
import { readAccountsMetadata, updateAccountMetadata } from './accountsMetadata'
import { getCardInvoiceDates, isImmediatePayment } from './billingCycles'

export function normalizeCategoryName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export interface CategoryFilter {
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
  name: string
  type: 'expense' | 'income'
  icon?: string
  color?: string
  sortOrder?: number
}): Promise<Category> {
  const supabase = getSupabaseClient()
  const trimmedName = input.name.trim()
  const normalized = normalizeCategoryName(trimmedName)

  if (!supabase) {
    return {
      id: `mock-cat-${Date.now()}`,
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

  // Verificar se já existe categoria com o mesmo normalized_name e type
  const { data: existing } = await supabase
    .from('categories')
    .select('*')
    .eq('normalized_name', normalized)
    .eq('type', input.type)
    .single()

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

export interface TransactionFilter {
  type?: 'expense' | 'income' | 'all'
  accountId?: string
  categoryId?: string
  paymentMethod?: string
  reviewStatus?: 'confirmed' | 'needs_review' | 'all'
  isRecurring?: boolean
  recurrenceStatus?: 'active' | 'ended'
  isInstallment?: boolean
  installmentGroupId?: string
  startDate?: string
  endDate?: string
  vendor?: string
  category?: string
  product?: string
  itemCategory?: string
  limit?: number
  offset?: number
}

/**
 * List accounts from Supabase (defaults to active accounts)
 */
export async function listAccounts(options: { activeOnly?: boolean } = { activeOnly: false }): Promise<Account[]> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return [
      { id: 'default-cash', name: 'Carteira (Dinheiro)', type: 'cash', active: true },
      { id: 'default-bank', name: 'Conta Corrente', type: 'bank_account', active: true },
      { id: 'default-credit', name: 'Cartão de Crédito', type: 'credit_card', active: true, closing_day: 5, due_day: 15 },
    ]
  }

  let query = supabase.from('accounts').select('*').order('name', { ascending: true })
  if (options.activeOnly) {
    query = query.eq('active', true)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`Failed to list accounts: ${error.message}`)
  }

  const metadata = await readAccountsMetadata()
  const accounts = ((data || []) as Account[]).map((acc) => {
    const meta = metadata[acc.id] || {}
    return {
      ...acc,
      closing_day: meta.closing_day !== undefined ? meta.closing_day : (acc.type === 'credit_card' ? 5 : null),
      due_day: meta.due_day !== undefined ? meta.due_day : (acc.type === 'credit_card' ? 15 : null),
      custom_logo: meta.custom_logo || null,
      color: meta.color || null,
      skin: meta.skin || null,
    }
  })

  return accounts
}

/**
 * Create a new account in Supabase
 */
export async function createAccount(input: {
  name: string
  type: AccountType
  institution?: string | null
  active?: boolean
  closing_day?: number | null
  due_day?: number | null
  custom_logo?: string | null
  color?: string | null
  skin?: string | null
}): Promise<Account> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      id: 'mock-account-id',
      name: input.name,
      type: input.type,
      institution: input.institution || null,
      active: input.active ?? true,
      closing_day: input.closing_day !== undefined ? input.closing_day : (input.type === 'credit_card' ? 5 : null),
      due_day: input.due_day !== undefined ? input.due_day : (input.type === 'credit_card' ? 15 : null),
      custom_logo: input.custom_logo || null,
      color: input.color || null,
      skin: input.skin || null,
    }
  }

  const { data, error } = await supabase
    .from('accounts')
    .insert({
      name: input.name.trim(),
      type: input.type,
      institution: input.institution?.trim() || null,
      active: input.active ?? true,
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(`Failed to create account: ${error.message}`)
  }

  const created = data as Account
  const closing_day = input.closing_day !== undefined ? input.closing_day : (input.type === 'credit_card' ? 5 : null)
  const due_day = input.due_day !== undefined ? input.due_day : (input.type === 'credit_card' ? 15 : null)
  const custom_logo = input.custom_logo || null
  const color = input.color || null
  const skin = input.skin || null

  if (closing_day !== undefined || due_day !== undefined || custom_logo || color || skin) {
    await updateAccountMetadata(created.id, { closing_day, due_day, custom_logo, color, skin })
  }

  return {
    ...created,
    closing_day,
    due_day,
    custom_logo,
    color,
    skin,
  }
}

export interface AccountWithStats extends Account {
  transactionCount?: number
  currentMonthExpenses?: number
  futureInstallmentsTotal?: number
  futureInstallmentsCount?: number
}

/**
 * List accounts with aggregated stats useful per type:
 * - bank_account: transactionCount
 * - credit_card: currentMonthExpenses (active invoice), futureInstallmentsTotal, futureInstallmentsCount, transactionCount
 * - cash: transactionCount
 */
export interface AccountDetailsWithStats extends AccountWithStats {
  transactions: any[]
}

/**
 * Get a single account by ID along with its full stats and associated transactions.
 * Single source of truth for both card summaries and transaction detail drawers.
 */
export async function getAccountDetailsWithStats(
  id: string,
  referenceDateStr?: string
): Promise<AccountDetailsWithStats | null> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return null
  }

  const { data: accountData, error: accError } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', id)
    .single()

  if (accError || !accountData) {
    return null
  }

  const metadata = await readAccountsMetadata()
  const meta = metadata[accountData.id] || {}
  const closing_day = meta.closing_day !== undefined ? meta.closing_day : (accountData.type === 'credit_card' ? 5 : null)
  const due_day = meta.due_day !== undefined ? meta.due_day : (accountData.type === 'credit_card' ? 15 : null)
  const custom_logo = meta.custom_logo || null
  const color = meta.color || null
  const skin = meta.skin || null

  const accountWithStats: AccountDetailsWithStats = {
    ...accountData,
    closing_day,
    due_day,
    custom_logo,
    color,
    skin,
    transactionCount: 0,
    currentMonthExpenses: 0,
    futureInstallmentsTotal: 0,
    futureInstallmentsCount: 0,
    transactions: [],
  }

  const selectQuery =
    '*, categories(id, name, icon, color), accounts(id, name, type, institution), canonical_vendors(id, canonical_name, normalized_key, aliases), transaction_items(*, canonical_products(id, canonical_name, brand, unit_size))'

  const { data: txs, error: txError } = await supabase
    .from('transactions')
    .select(selectQuery)
    .eq('account_id', id)
    .order('created_at', { ascending: false })

  if (txError || !txs) {
    return accountWithStats
  }

  const activeCategories = await listCategories({ activeOnly: false })
  const catMap = new Map(activeCategories.map((c) => [c.id, c]))
  const catNormMap = new Map(activeCategories.map((c) => [c.normalized_name, c]))

  const transactions = txs.map((row: any) => {
    let catObj = row.categories
    if (!catObj && row.category_id && catMap.has(row.category_id)) {
      const c = catMap.get(row.category_id)!
      catObj = { id: c.id, name: c.name, icon: c.icon, color: c.color }
    } else if (!catObj && row.category) {
      const norm = normalizeCategoryName(row.category)
      if (catNormMap.has(norm)) {
        const c = catNormMap.get(norm)!
        catObj = { id: c.id, name: c.name, icon: c.icon, color: c.color }
      }
    }

    return {
      ...row,
      categories: catObj || null,
      type: row.type === 'income' ? 'income' : 'expense',
    }
  })

  accountWithStats.transactions = transactions
  accountWithStats.transactionCount = transactions.length

  const todayStr = referenceDateStr || new Date().toISOString().slice(0, 10)

  if (accountWithStats.type === 'credit_card') {
    const cDay = accountWithStats.closing_day || 5
    const dDay = accountWithStats.due_day || 15
    const currentActiveCycle = getCardInvoiceDates(todayStr, cDay, dDay)

    for (const tx of transactions) {
      if (tx.type === 'expense') {
        const txTotal = Math.abs(Number(tx.installment_amount) || Number(tx.total) || 0)
        const txDate = tx.date || todayStr
        const txCycle = getCardInvoiceDates(txDate, cDay, dDay)

        if (txCycle.dueDate === currentActiveCycle.dueDate) {
          accountWithStats.currentMonthExpenses = (accountWithStats.currentMonthExpenses || 0) + txTotal
        } else if (txCycle.dueDate > currentActiveCycle.dueDate) {
          accountWithStats.futureInstallmentsTotal = (accountWithStats.futureInstallmentsTotal || 0) + txTotal
          accountWithStats.futureInstallmentsCount = (accountWithStats.futureInstallmentsCount || 0) + 1
        }
      }
    }
  }

  return accountWithStats
}

export async function listAccountsWithStats(options: { activeOnly?: boolean } = { activeOnly: false }): Promise<AccountWithStats[]> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return [
      { id: 'default-cash', name: 'Carteira (Dinheiro)', type: 'cash', active: true, transactionCount: 0 },
      { id: 'default-bank', name: 'Conta Corrente', type: 'bank_account', active: true, transactionCount: 0 },
      { id: 'default-credit', name: 'Cartão de Crédito', type: 'credit_card', active: true, transactionCount: 0, currentMonthExpenses: 0, futureInstallmentsTotal: 0, futureInstallmentsCount: 0, closing_day: 5, due_day: 15 },
    ]
  }

  let query = supabase.from('accounts').select('*').order('name', { ascending: true })
  if (options.activeOnly) {
    query = query.eq('active', true)
  }

  const { data: accountsData, error: accError } = await query
  if (accError) {
    throw new Error(`Failed to list accounts: ${accError.message}`)
  }

  const metadata = await readAccountsMetadata()
  const accounts = (accountsData || []) as Account[]
  const accountsWithStats: AccountWithStats[] = accounts.map((acc) => {
    const meta = metadata[acc.id] || {}
    const closing_day = meta.closing_day !== undefined ? meta.closing_day : (acc.type === 'credit_card' ? 5 : null)
    const due_day = meta.due_day !== undefined ? meta.due_day : (acc.type === 'credit_card' ? 15 : null)
    const custom_logo = meta.custom_logo || null
    const color = meta.color || null
    const skin = meta.skin || null
    return {
      ...acc,
      closing_day,
      due_day,
      custom_logo,
      color,
      skin,
      transactionCount: 0,
      currentMonthExpenses: 0,
      futureInstallmentsTotal: 0,
      futureInstallmentsCount: 0,
    }
  })

  const { data: txs, error: txError } = await supabase
    .from('transactions')
    .select('id, account_id, type, total, date, installment_group_id, installment_total, installment_current, installment_amount, payment_method')

  if (txError) {
    console.warn('Could not query transactions for account stats:', txError.message)
    return accountsWithStats
  }
  if (!txs) {
    return accountsWithStats
  }

  const todayStr = new Date().toISOString().slice(0, 10)

  for (const acc of accountsWithStats) {
    if (acc.type === 'credit_card') {
      const closingDay = acc.closing_day || 5
      const dueDay = acc.due_day || 15
      const currentActiveCycle = getCardInvoiceDates(todayStr, closingDay, dueDay)

      for (const tx of txs) {
        if (tx.account_id !== acc.id) continue
        acc.transactionCount = (acc.transactionCount || 0) + 1

        if (tx.type === 'expense') {
          const txTotal = Math.abs(Number(tx.installment_amount) || Number(tx.total) || 0)
          const txDate = tx.date || todayStr
          const txCycle = getCardInvoiceDates(txDate, closingDay, dueDay)

          if (txCycle.dueDate === currentActiveCycle.dueDate) {
            acc.currentMonthExpenses = (acc.currentMonthExpenses || 0) + txTotal
          } else if (txCycle.dueDate > currentActiveCycle.dueDate) {
            acc.futureInstallmentsTotal = (acc.futureInstallmentsTotal || 0) + txTotal
            acc.futureInstallmentsCount = (acc.futureInstallmentsCount || 0) + 1
          }
        }
      }
    } else {
      for (const tx of txs) {
        if (tx.account_id === acc.id) {
          acc.transactionCount = (acc.transactionCount || 0) + 1
        }
      }
    }
  }

  return accountsWithStats
}

/**
 * Update an account's name, type, institution, or active status (activate/deactivate)
 */
export async function updateAccount(
  id: string,
  input: {
    name?: string
    type?: AccountType
    institution?: string | null
    active?: boolean
    closing_day?: number | null
    due_day?: number | null
  }
): Promise<Account> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      id,
      name: input.name || 'Mock Account',
      type: input.type || 'bank_account',
      institution: input.institution ?? null,
      active: input.active ?? true,
      closing_day: input.closing_day,
      due_day: input.due_day,
    }
  }

  const updates: Record<string, any> = {}
  if (input.name !== undefined) updates.name = input.name.trim()
  if (input.type !== undefined) updates.type = input.type
  if (input.institution !== undefined) {
    updates.institution = typeof input.institution === 'string' && input.institution.trim() ? input.institution.trim() : null
  }
  if (input.active !== undefined) updates.active = Boolean(input.active)

  let updatedAccount: Account
  if (Object.keys(updates).length > 0) {
    const { data, error } = await supabase
      .from('accounts')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      throw new Error(`Failed to update account: ${error.message}`)
    }
    updatedAccount = data as Account
  } else {
    const { data, error } = await supabase.from('accounts').select('*').eq('id', id).single()
    if (error) {
      throw new Error(`Failed to fetch account: ${error.message}`)
    }
    updatedAccount = data as Account
  }

  if (
    input.closing_day !== undefined ||
    input.due_day !== undefined ||
    (input as any).custom_logo !== undefined ||
    (input as any).color !== undefined ||
    (input as any).skin !== undefined
  ) {
    const metaUpdates: any = {}
    if (input.closing_day !== undefined) metaUpdates.closing_day = input.closing_day
    if (input.due_day !== undefined) metaUpdates.due_day = input.due_day
    if ((input as any).custom_logo !== undefined) metaUpdates.custom_logo = (input as any).custom_logo
    if ((input as any).color !== undefined) metaUpdates.color = (input as any).color
    if ((input as any).skin !== undefined) metaUpdates.skin = (input as any).skin
    await updateAccountMetadata(id, metaUpdates)
  }

  const metadata = await readAccountsMetadata()
  const meta = metadata[id] || {}

  return {
    ...updatedAccount,
    closing_day: meta.closing_day !== undefined ? meta.closing_day : (updatedAccount.type === 'credit_card' ? 5 : null),
    due_day: meta.due_day !== undefined ? meta.due_day : (updatedAccount.type === 'credit_card' ? 15 : null),
    custom_logo: meta.custom_logo || null,
    color: meta.color || null,
    skin: meta.skin || null,
  }
}


/**
 * Helper to extract effective date string (YYYY-MM-DD) from a transaction
 */
export function getEffectiveDate(tx: { date?: string | null; created_at?: string | null }): string {
  if (tx.date && /^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
    return tx.date
  }
  if (tx.created_at) {
    return tx.created_at.slice(0, 10)
  }
  return new Date().toISOString().slice(0, 10)
}

/**
 * Builds PostgREST filter string for effective date:
 * Match if (date >= start AND date <= end) OR (date IS NULL AND created_at >= start_iso AND created_at <= end_iso)
 */
export function buildEffectiveDateOrFilter(startDate?: string, endDate?: string): string | null {
  if (!startDate && !endDate) return null

  const clauses: string[] = []

  // Branch 1: date is present
  const dateParts: string[] = ['date.not.is.null']
  if (startDate) dateParts.push(`date.gte.${startDate}`)
  if (endDate) dateParts.push(`date.lte.${endDate}`)
  clauses.push(`and(${dateParts.join(',')})`)

  // Branch 2: date is null, fallback to created_at
  const createdParts: string[] = ['date.is.null']
  if (startDate) createdParts.push(`created_at.gte.${startDate}T00:00:00.000Z`)
  if (endDate) createdParts.push(`created_at.lte.${endDate}T23:59:59.999Z`)
  clauses.push(`and(${createdParts.join(',')})`)

  return clauses.join(',')
}

/**
 * List transactions with optional filters and item matching
 */
export async function listTransactions(filters: TransactionFilter = {}) {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      transactions: [],
      total_count: 0,
      total_amount: 0,
    }
  }

  // 1. If filtering by product or itemCategory, find matching transaction_ids first
  let matchingTransactionIds: string[] | null = null

  if (filters.product || filters.itemCategory) {
    let itemQuery = supabase.from('transaction_items').select('transaction_id')

    if (filters.product) {
      const rawSearch = filters.product.trim()
      const normalized = normalizeItemName(rawSearch)
      const { parseProductDescription } = await import('./canonical')
      const parsed = parseProductDescription(rawSearch)

      const { data: matchedCanonical } = await supabase
        .from('canonical_products')
        .select('id')
        .or(`normalized_key.ilike.%${parsed.normalizedKey}%,canonical_name.ilike.%${rawSearch}%,brand.ilike.%${rawSearch}%,product_type.ilike.%${parsed.productType}%`)

      const matchedProductIds = (matchedCanonical || []).map((cp: any) => cp.id)

      if (matchedProductIds.length > 0) {
        itemQuery = itemQuery.or(`product_id.in.(${matchedProductIds.join(',')}),normalized_name.ilike.%${normalized}%`)
      } else {
        itemQuery = itemQuery.ilike('normalized_name', `%${normalized}%`)
      }
    }

    if (filters.itemCategory) {
      itemQuery = itemQuery.ilike('category', `%${filters.itemCategory.trim()}%`)
    }

    const { data: itemMatches, error: itemError } = await itemQuery
    if (itemError) {
      throw new Error(`Failed to filter items: ${itemError.message}`)
    }

    matchingTransactionIds = Array.from(new Set(itemMatches.map((row) => row.transaction_id)))
    if (matchingTransactionIds.length === 0) {
      return {
        transactions: [],
        total_count: 0,
        total_amount: 0,
      }
    }
  }

  // 2. Query transactions
  let selectQuery = '*, categories(id, name, icon, color), accounts(id, name, type, institution), canonical_vendors(id, canonical_name, normalized_key, aliases), transaction_items(*, canonical_products(id, canonical_name, brand, unit_size))'
  
  let query = supabase
    .from('transactions')
    .select(selectQuery, { count: 'exact' })
    .order('created_at', { ascending: false })

  if (matchingTransactionIds) {
    query = query.in('id', matchingTransactionIds)
  }

  // Account filter
  if (filters.accountId) {
    query = query.eq('account_id', filters.accountId)
  }

  // Category ID filter
  if (filters.categoryId) {
    query = query.eq('category_id', filters.categoryId)
  }

  // Payment method filter (Cartão de crédito filtra por payment_method ou conta de cartão)
  if (filters.paymentMethod) {
    const pm = filters.paymentMethod.trim()
    const isCreditCard =
      pm === 'credit_card' ||
      pm.toLowerCase().includes('crédito') ||
      pm.toLowerCase().includes('credito')

    if (isCreditCard) {
      const { data: ccAccounts } = await supabase
        .from('accounts')
        .select('id')
        .eq('type', 'credit_card')
      const ccIds = (ccAccounts || []).map((a) => a.id)

      const conditions = [
        `payment_method.ilike.%crédito%`,
        `payment_method.ilike.%credito%`,
        `payment_method.eq.credit_card`,
      ]
      if (ccIds.length > 0) {
        conditions.push(`account_id.in.(${ccIds.join(',')})`)
      }
      query = query.or(conditions.join(','))
    } else {
      query = query.ilike('payment_method', `%${pm}%`)
    }
  }

  // Review status filter
  if (filters.reviewStatus && filters.reviewStatus !== 'all') {
    query = query.eq('review_status', filters.reviewStatus)
  }

  // Type filter: expense, income, or all (default all)
  if (filters.type && filters.type !== 'all') {
    query = query.eq('type', filters.type)
  }

  // Recurrence filter
  if (filters.isRecurring !== undefined) {
    query = query.eq('is_recurring', filters.isRecurring)
  }

  if (filters.recurrenceStatus) {
    query = query.eq('recurrence_status', filters.recurrenceStatus)
  }

  // Installment filter
  if (filters.installmentGroupId) {
    query = query.eq('installment_group_id', filters.installmentGroupId)
  } else if (filters.isInstallment !== undefined) {
    if (filters.isInstallment) {
      query = query.gt('installment_total', 1)
    } else {
      query = query.or('installment_total.is.null,installment_total.lte.1')
    }
  }

  if (filters.vendor) {
    const rawSearch = filters.vendor.trim()
    const { cleanVendorText } = await import('./canonicalVendor')
    const cleanSearch = cleanVendorText(rawSearch)

    // Check if canonical vendors match
    const { data: matchedVendors } = await supabase
      .from('canonical_vendors')
      .select('id')
      .or(`normalized_key.ilike.%${cleanSearch}%,canonical_name.ilike.%${rawSearch}%,aliases.cs.{${cleanSearch}}`)

    const matchedVendorIds = (matchedVendors || []).map((cv: any) => cv.id)

    if (matchedVendorIds.length > 0) {
      query = query.or(`vendor_id.in.(${matchedVendorIds.join(',')}),vendor.ilike.%${rawSearch}%`)
    } else {
      query = query.ilike('vendor', `%${rawSearch}%`)
    }
  }

  if (filters.category) {
    const term = filters.category.trim()
    query = query.ilike('category', `%${term}%`)
  }

  // Effective date filtering (date OR created_at)
  const dateOrFilter = buildEffectiveDateOrFilter(filters.startDate, filters.endDate)
  if (dateOrFilter) {
    query = query.or(dateOrFilter)
  }

  if (filters.limit) {
    query = query.limit(filters.limit)
  }

  if (filters.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1)
  }

  const { data, count, error } = await query

  if (error) {
    throw new Error(`Failed to fetch transactions: ${error.message}`)
  }

  // Enrich categories in application layer
  const activeCategories = await listCategories({ activeOnly: false })
  const catMap = new Map(activeCategories.map((c) => [c.id, c]))
  const catNormMap = new Map(activeCategories.map((c) => [c.normalized_name, c]))

  // Default missing type on older rows to 'expense'
  const transactions = (data || []).map((row: any) => {
    let catObj = row.categories
    if (!catObj && row.category_id && catMap.has(row.category_id)) {
      const c = catMap.get(row.category_id)!
      catObj = { id: c.id, name: c.name, icon: c.icon, color: c.color }
    } else if (!catObj && row.category) {
      const norm = normalizeCategoryName(row.category)
      if (catNormMap.has(norm)) {
        const c = catNormMap.get(norm)!
        catObj = { id: c.id, name: c.name, icon: c.icon, color: c.color }
      }
    }

    return {
      ...row,
      categories: catObj || null,
      type: row.type === 'income' ? 'income' : 'expense',
    }
  })
  const totalAmount = transactions.reduce((sum, tx) => sum + (Number(tx.total) || 0), 0)

  return {
    transactions,
    total_count: count ?? transactions.length,
    total_amount: Number(totalAmount.toFixed(2)),
  }
}


/**
 * Delete a transaction by ID from Supabase (cascades to transaction_items)
 */
export async function deleteTransaction(id: string): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return true
  }

  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) {
    throw new Error(`Failed to delete transaction: ${error.message}`)
  }

  return true
}

export interface UpdateTransactionInput {
  type?: 'expense' | 'income'
  account_id?: string | null
  category_id?: string | null
  payment_method?: string | null
  vendor?: string | null
  date?: string | null
  time?: string | null
  category?: string | null
  subtotal?: number | null
  total?: number
  notes?: string | null
  is_recurring?: boolean
  recurrence_frequency?: 'monthly' | 'weekly' | 'yearly' | null
  recurrence_next_date?: string | null
  recurrence_status?: 'active' | 'ended'
  installment_group_id?: string | null
  installment_current?: number | null
  installment_total?: number | null
  installment_amount?: number | null
  installment_date_anchor?: 'purchase_date' | 'current_installment' | null
  review_status?: 'confirmed' | 'needs_review'
  review_reasons?: string[]
  items?: {
    id?: string
    description: string
    quantity?: number | null
    unit_price?: number | null
    total?: number | null
    category?: string | null
  }[]
}

/**
 * Update an existing transaction and its items in Supabase
 */
export async function updateTransaction(id: string, input: UpdateTransactionInput) {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { id, type: input.type || 'expense', ...input }
  }

  let existingTx: any = null
  let existingItems: any[] = []
  try {
    const { data } = await supabase
      .from('transactions')
      .select('*, transaction_items(*)')
      .eq('id', id)
      .single()
    if (data) {
      const { transaction_items, ...txData } = data
      existingTx = txData
      existingItems = Array.isArray(transaction_items) ? transaction_items : []
    }
  } catch {
    // ignore
  }

  // 1. Prepare transaction update fields
  const txUpdate: Record<string, any> = {}
  if (input.type !== undefined) txUpdate.type = input.type
  if (input.account_id !== undefined) txUpdate.account_id = input.account_id || null
  if (input.category_id !== undefined) txUpdate.category_id = input.category_id || null
  if (input.payment_method !== undefined) txUpdate.payment_method = input.payment_method || null
  if (input.notes !== undefined) txUpdate.notes = input.notes || null
  if (input.vendor !== undefined) {
    txUpdate.vendor = input.vendor
    try {
      const { getOrCreateCanonicalVendor } = await import('./canonicalVendor')
      const vRes = await getOrCreateCanonicalVendor(supabase, input.vendor, input.category)
      txUpdate.vendor_id = vRes.vendorId
    } catch (err) {
      console.warn('Could not update canonical vendor:', err)
    }
  }
  if (input.date !== undefined) txUpdate.date = input.date || null
  if (input.time !== undefined) txUpdate.time = input.time || null
  if (input.category !== undefined) txUpdate.category = input.category || null
  if (input.subtotal !== undefined) txUpdate.subtotal = input.subtotal
  if (input.total !== undefined) txUpdate.total = input.total
  if (
    input.is_recurring !== undefined ||
    input.recurrence_frequency !== undefined ||
    input.recurrence_next_date !== undefined ||
    input.recurrence_status !== undefined
  ) {
    const recUpdate = resolveRecurrenceUpdate({
      is_recurring: input.is_recurring,
      recurrence_frequency: input.recurrence_frequency,
      recurrence_next_date: input.recurrence_next_date,
      recurrence_status: input.recurrence_status,
      date: txUpdate.date !== undefined ? txUpdate.date : (existingTx?.date ?? null),
      existingTx,
    })
    txUpdate.is_recurring = recUpdate.is_recurring
    txUpdate.recurrence_frequency = recUpdate.recurrence_frequency
    txUpdate.recurrence_next_date = recUpdate.recurrence_next_date
    txUpdate.recurrence_status = recUpdate.recurrence_status
  }
  if (input.installment_group_id !== undefined) txUpdate.installment_group_id = input.installment_group_id
  if (input.installment_current !== undefined) txUpdate.installment_current = input.installment_current
  if (input.installment_total !== undefined) txUpdate.installment_total = input.installment_total
  if (input.installment_amount !== undefined) txUpdate.installment_amount = input.installment_amount
  if (input.review_status !== undefined) txUpdate.review_status = input.review_status
  if (input.review_reasons !== undefined) txUpdate.review_reasons = input.review_reasons

  const plan = resolveInstallmentPlan({
    total: input.total !== undefined ? input.total : (existingTx?.total ? Number(existingTx.total) : 0),
    installmentTotal: input.installment_total,
    installmentCurrent: input.installment_current,
    installmentAmount: input.installment_amount,
    installmentDateAnchor: input.installment_date_anchor,
    subtotal: input.subtotal,
    installmentGroupId: input.installment_group_id,
    notes: input.notes,
    vendor: input.vendor,
    existingTx,
  })

  if (plan.isMultiInstallment) {
    txUpdate.installment_group_id = plan.installmentGroupId
    txUpdate.installment_total = plan.installmentTotal
    txUpdate.installment_current = plan.installmentCurrent
    txUpdate.total = plan.installmentAmount
    txUpdate.installment_amount = plan.installmentAmount
    txUpdate.subtotal = plan.totalPurchaseAmount
  }

  // Pre-resolve new items before modifying any DB state
  let itemsToInsert: any[] | null = null
  if (input.items !== undefined && input.items.length > 0) {
    const { getOrCreateCanonicalProduct } = await import('./canonical')
    itemsToInsert = await Promise.all(
      input.items.map(async (item) => {
        let productId: string | null = null
        try {
          const res = await getOrCreateCanonicalProduct(supabase, item.description, item.category)
          productId = res.productId
        } catch (err) {
          console.warn('Could not associate canonical product during update:', err)
        }

        return {
          transaction_id: id,
          product_id: productId,
          description: item.description,
          normalized_name: normalizeItemName(item.description),
          quantity: item.quantity ?? null,
          unit_price: item.unit_price ?? null,
          total: item.total ?? null,
          category: item.category ?? null,
        }
      })
    )
  } else if (input.items !== undefined) {
    itemsToInsert = []
  }

  // Helper to rollback state if mutation steps fail
  const rollback = async () => {
    try {
      if (input.items !== undefined) {
        // Clean up partial items and restore previous items
        await supabase.from('transaction_items').delete().eq('transaction_id', id)
        if (existingItems.length > 0) {
          const itemsToRestore = existingItems.map((item) => {
            const { ...rest } = item
            return {
              ...rest,
              transaction_id: id,
            }
          })
          await supabase.from('transaction_items').insert(itemsToRestore)
        }
      }
      if (existingTx && Object.keys(txUpdate).length > 0) {
        await supabase.from('transactions').update(existingTx).eq('id', id)
      }
    } catch (rollbackErr) {
      console.error('Failed to rollback transaction update:', rollbackErr)
    }
  }

  try {
    // 2. Apply transaction updates
    if (Object.keys(txUpdate).length > 0) {
      const { error: txError } = await supabase
        .from('transactions')
        .update(txUpdate)
        .eq('id', id)

      if (txError) {
        throw new Error(`Failed to update transaction: ${txError.message}`)
      }
    }

    if (plan.isMultiInstallment) {
      const baseDate = txUpdate.date || existingTx?.date || new Date().toISOString().slice(0, 10)
      await syncInstallmentGroup(supabase, id, plan, baseDate, {
        account_id: txUpdate.account_id !== undefined ? txUpdate.account_id : (existingTx?.account_id ?? null),
        category_id: txUpdate.category_id !== undefined ? txUpdate.category_id : (existingTx?.category_id ?? null),
        payment_method: txUpdate.payment_method !== undefined ? txUpdate.payment_method : (existingTx?.payment_method ?? null),
        vendor_id: txUpdate.vendor_id !== undefined ? txUpdate.vendor_id : (existingTx?.vendor_id ?? null),
        vendor: txUpdate.vendor !== undefined ? txUpdate.vendor : (existingTx?.vendor ?? null),
        vendor_address: existingTx?.vendor_address ?? null,
        category: txUpdate.category !== undefined ? txUpdate.category : (existingTx?.category ?? null),
        type: txUpdate.type !== undefined ? txUpdate.type : (existingTx?.type ?? 'expense'),
        notes: txUpdate.notes !== undefined ? txUpdate.notes : (existingTx?.notes ?? null),
        time: txUpdate.time !== undefined ? txUpdate.time : (existingTx?.time ?? null),
        currency: existingTx?.currency ?? 'BRL',
        review_status: txUpdate.review_status !== undefined ? txUpdate.review_status : (existingTx?.review_status ?? 'confirmed'),
        review_reasons: txUpdate.review_reasons !== undefined ? txUpdate.review_reasons : (existingTx?.review_reasons ?? []),
        created_at: existingTx?.created_at,
      })
    }

    // 3. Replace transaction_items atomically
    if (itemsToInsert !== null) {
      const { error: delError } = await supabase
        .from('transaction_items')
        .delete()
        .eq('transaction_id', id)

      if (delError) {
        throw new Error(`Failed to update transaction items (delete step): ${delError.message}`)
      }

      if (itemsToInsert.length > 0) {
        const { error: insError } = await supabase
          .from('transaction_items')
          .insert(itemsToInsert)

        if (insError) {
          throw new Error(`Failed to insert updated transaction items: ${insError.message}`)
        }
      }
    }
  } catch (err) {
    await rollback()
    throw err
  }

  // 3. Fetch and return the updated transaction with its items
  const { data: updatedTx, error: fetchError } = await supabase
    .from('transactions')
    .select('*, accounts(id, name, type, institution), canonical_vendors(id, canonical_name, normalized_key, aliases), transaction_items(*)')
    .eq('id', id)
    .single()

  if (fetchError) {
    throw new Error(`Failed to fetch updated transaction: ${fetchError.message}`)
  }

  let catObj = updatedTx.categories
  if (!catObj && (updatedTx.category_id || updatedTx.category)) {
    const cats = await listCategories({ activeOnly: false })
    const found = updatedTx.category_id
      ? cats.find((c) => c.id === updatedTx.category_id)
      : cats.find((c) => c.normalized_name === normalizeCategoryName(updatedTx.category))
    if (found) {
      catObj = { id: found.id, name: found.name, icon: found.icon, color: found.color }
    }
  }

  return {
    ...updatedTx,
    categories: catObj || null,
    type: updatedTx.type === 'income' ? 'income' : 'expense',
  }
}

/**
 * Get a single transaction by ID with its relations and provenance data
 */
export async function getTransactionById(id: string) {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from('transactions')
    .select('*, accounts(id, name, type, institution), canonical_vendors(id, canonical_name, normalized_key, aliases), transaction_items(*, canonical_products(id, canonical_name, brand, unit_size))')
    .eq('id', id)
    .single()

  if (error || !data) {
    return null
  }

  let catObj = data.categories
  if (!catObj && (data.category_id || data.category)) {
    const cats = await listCategories({ activeOnly: false })
    const found = data.category_id
      ? cats.find((c) => c.id === data.category_id)
      : cats.find((c) => c.normalized_name === normalizeCategoryName(data.category))
    if (found) {
      catObj = { id: found.id, name: found.name, icon: found.icon, color: found.color }
    }
  }

  return {
    ...data,
    categories: catObj || null,
    type: data.type === 'income' ? 'income' : 'expense',
  }
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

export interface DashboardFilter {
  periodType?: 'week' | 'month' | 'year' | 'custom'
  accountId?: string // Filter dashboard by specific account
  startDate?: string
  endDate?: string
  monthOffset?: number // For navigating months (0 = current, -1 = last, +1 = next)
  referenceDate?: string // YYYY-MM-DD
}

export interface AccountMetric {
  id: string
  name: string
  type: string
  institution: string | null
  totalExpenses: number
  totalIncome: number
  balance: number
  expensePercentage: number
  incomePercentage: number
  transactionCount: number
}

export interface UpcomingCommitment {
  id: string
  kind: 'recurring' | 'installment' | 'card_invoice'
  title: string
  vendor: string | null
  category: string
  accountName: string | null
  accountType: string | null
  amount: number
  date: string // YYYY-MM-DD
  dueDay?: number | null
  dueDayLabel?: string
  isEstimated?: boolean
  installmentInfo?: {
    current: number
    total: number
    groupId: string | null
  }
  frequency?: string | null
  invoiceItems?: any[]
  rawTx?: any
}

export interface DashboardSummary {
  period: {
    type: 'week' | 'month' | 'year' | 'custom'
    label: string
    startDate: string
    endDate: string
    previousLabel: string
    previousStartDate: string
    previousEndDate: string
  }
  selectedAccountId?: string | null
  metrics: {
    totalIncome: number
    totalExpenses: number
    balance: number
    totalSpent: number // Backward compatibility: equals totalExpenses
    expenseTransactionCount: number
    incomeTransactionCount: number
    transactionCount: number // Total transactions in period
    dailyAverage: number // Expense daily average
    activeDaysCount: number
    totalDaysInPeriod: number
    averageTicket: number // Expense average ticket
    maxExpense: {
      id: string
      vendor: string | null
      total: number
      date: string
      category: string
    } | null
    peakDay: {
      date: string
      formattedDate: string
      total: number
    } | null
    comparison: {
      previousTotalSpent: number // Previous total expenses
      previousTotalIncome: number
      previousBalance: number
      differenceAmount: number // Expense diff vs previous
      differencePercentage: number | null
    }
  }
  topCategories: {
    category: string
    rawCategory: string
    total: number
    percentage: number
    count: number
  }[]
  topIncomeSources: {
    source: string
    category: string
    total: number
    percentage: number
    count: number
  }[]
  topVendors: {
    vendor: string
    total: number
    percentage: number
    count: number
  }[]
  accountMetrics: AccountMetric[]
  recentTransactions: any[]
  dailyExpenses: {
    date: string
    label: string
    day: number
    total: number
    income: number
    expense: number
  }[]
  // Upcoming Financial Commitments in next 30 days
  upcomingCommitments: {
    forecastTotal30Days: number
    recurringTotal30Days: number
    installmentsTotal30Days: number
    upcomingRecurring: UpcomingCommitment[]
    upcomingInstallments: UpcomingCommitment[]
    allUpcoming: UpcomingCommitment[]
  }
  forecastTotal30Days: number
  recurringTotal30Days: number
  installmentsTotal30Days: number
  upcomingRecurring: UpcomingCommitment[]
  upcomingInstallments: UpcomingCommitment[]
  allUpcoming: UpcomingCommitment[]
  insights: {
    type: 'positive' | 'warning' | 'neutral' | 'info'
    title: string
    description: string
  }[]
}

/**
 * Computes comprehensive dashboard financial metrics based on real database records
 */
export async function getDashboardSummary(options: DashboardFilter = {}): Promise<DashboardSummary> {
  const supabase = getSupabaseClient()

  let ref = new Date()
  if (options.referenceDate) {
    ref = new Date(options.referenceDate)
    if (isNaN(ref.getTime())) {
      ref = new Date()
    }
  }
  const periodType = options.periodType || 'month'
  const monthOffset = options.monthOffset || 0

  let startStr = ''
  let endStr = ''
  let prevStartStr = ''
  let prevEndStr = ''
  let periodLabel = ''
  let prevPeriodLabel = ''

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ]

  if (periodType === 'custom' && options.startDate && options.endDate) {
    startStr = options.startDate
    endStr = options.endDate
    periodLabel = `${startStr.slice(8, 10)}/${startStr.slice(5, 7)} até ${endStr.slice(8, 10)}/${endStr.slice(5, 7)}`

    // Compute previous interval with same duration
    const dStart = new Date(startStr + 'T00:00:00Z')
    const dEnd = new Date(endStr + 'T23:59:59Z')
    const durationMs = dEnd.getTime() - dStart.getTime()
    const pEnd = new Date(dStart.getTime() - 1)
    const pStart = new Date(pEnd.getTime() - durationMs)
    prevStartStr = pStart.toISOString().slice(0, 10)
    prevEndStr = pEnd.toISOString().slice(0, 10)
    prevPeriodLabel = 'Período anterior equivalente'
  } else if (periodType === 'week') {
    const dayOfWeek = ref.getDay()
    const distanceToMonday = (dayOfWeek + 6) % 7
    const monday = new Date(ref)
    monday.setDate(ref.getDate() - distanceToMonday)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)

    startStr = monday.toISOString().slice(0, 10)
    endStr = sunday.toISOString().slice(0, 10)
    periodLabel = `Esta Semana (${startStr.slice(8, 10)}/${startStr.slice(5, 7)} a ${endStr.slice(8, 10)}/${endStr.slice(5, 7)})`

    const prevMonday = new Date(monday)
    prevMonday.setDate(monday.getDate() - 7)
    const prevSunday = new Date(sunday)
    prevSunday.setDate(sunday.getDate() - 7)
    prevStartStr = prevMonday.toISOString().slice(0, 10)
    prevEndStr = prevSunday.toISOString().slice(0, 10)
    prevPeriodLabel = 'Semana anterior'
  } else if (periodType === 'year') {
    const year = ref.getFullYear()
    startStr = `${year}-01-01`
    endStr = `${year}-12-31`
    periodLabel = `Ano de ${year}`

    prevStartStr = `${year - 1}-01-01`
    prevEndStr = `${year - 1}-12-31`
    prevPeriodLabel = `Ano de ${year - 1}`
  } else {
    // Default: 'month' (with monthOffset support)
    const targetDate = new Date(ref)
    targetDate.setMonth(targetDate.getMonth() + monthOffset)
    const year = targetDate.getFullYear()
    const monthIndex = targetDate.getMonth()

    const firstDay = new Date(Date.UTC(year, monthIndex, 1))
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0))
    startStr = firstDay.toISOString().slice(0, 10)
    endStr = lastDay.toISOString().slice(0, 10)
    periodLabel = `${monthNames[monthIndex]} de ${year}`

    const prevFirstDay = new Date(Date.UTC(year, monthIndex - 1, 1))
    const prevLastDay = new Date(Date.UTC(year, monthIndex, 0))
    prevStartStr = prevFirstDay.toISOString().slice(0, 10)
    prevEndStr = prevLastDay.toISOString().slice(0, 10)
    const prevMonthIdx = (monthIndex + 11) % 12
    prevPeriodLabel = `${monthNames[prevMonthIdx]} de ${prevFirstDay.getFullYear()}`
  }

  // Calculate days in period
  const startDateObj = new Date(startStr + 'T00:00:00Z')
  const endDateObj = new Date(endStr + 'T00:00:00Z')
  const totalDaysInPeriod = Math.max(1, Math.round((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)) + 1)

  if (!supabase) {
    return {
      period: {
        type: periodType,
        label: periodLabel,
        startDate: startStr,
        endDate: endStr,
        previousLabel: prevPeriodLabel,
        previousStartDate: prevStartStr,
        previousEndDate: prevEndStr,
      },
      selectedAccountId: options.accountId || null,
      metrics: {
        totalIncome: 0,
        totalExpenses: 0,
        balance: 0,
        totalSpent: 0,
        expenseTransactionCount: 0,
        incomeTransactionCount: 0,
        transactionCount: 0,
        dailyAverage: 0,
        activeDaysCount: 0,
        totalDaysInPeriod,
        averageTicket: 0,
        maxExpense: null,
        peakDay: null,
        comparison: {
          previousTotalSpent: 0,
          previousTotalIncome: 0,
          previousBalance: 0,
          differenceAmount: 0,
          differencePercentage: null,
        },
      },
      topCategories: [],
      topIncomeSources: [],
      topVendors: [],
      accountMetrics: [],
      recentTransactions: [],
      dailyExpenses: [],
      upcomingCommitments: {
        forecastTotal30Days: 0,
        recurringTotal30Days: 0,
        installmentsTotal30Days: 0,
        upcomingRecurring: [],
        upcomingInstallments: [],
        allUpcoming: [],
      },
      forecastTotal30Days: 0,
      recurringTotal30Days: 0,
      installmentsTotal30Days: 0,
      upcomingRecurring: [],
      upcomingInstallments: [],
      allUpcoming: [],
      insights: [
        {
          type: 'info',
          title: 'Pronto para começar',
          description: 'Nenhum lançamento encontrado neste período. Adicione despesas ou receitas para gerar estatísticas automáticas.',
        },
      ],
    }
  }

  // Fetch all accounts to compute account-level metrics
  const { data: accountsData } = await supabase
    .from('accounts')
    .select('id, name, type, institution, active')
    .order('name', { ascending: true })

  const accountsMetadata = await readAccountsMetadata()
  const accountsMap: Record<string, { id: string; name: string; type: string; institution: string | null; closing_day?: number | null; due_day?: number | null; custom_logo?: string | null; color?: string | null; skin?: string | null }> = {}
  for (const acc of accountsData || []) {
    const meta = accountsMetadata[acc.id] || {}
    accountsMap[acc.id] = {
      id: acc.id,
      name: acc.name,
      type: acc.type,
      institution: acc.institution || null,
      closing_day: meta.closing_day !== undefined ? meta.closing_day : (acc.type === 'credit_card' ? 5 : null),
      due_day: meta.due_day !== undefined ? meta.due_day : (acc.type === 'credit_card' ? 15 : null),
      custom_logo: meta.custom_logo || null,
      color: meta.color || null,
      skin: meta.skin || null,
    }
  }

  // ----------------------------------------------------
  // UPCOMING COMMITMENTS BOUNDARIES
  // ----------------------------------------------------
  const upcomingStartIso = endStr
  const upcomingEnd = new Date(endStr + 'T00:00:00Z')
  upcomingEnd.setUTCDate(upcomingEnd.getUTCDate() + 30)
  const upcomingEndIso = upcomingEnd.toISOString().slice(0, 10)

  const todayIso = ref.toISOString().slice(0, 10)
  const in30Days = new Date(ref)
  in30Days.setDate(in30Days.getDate() + 30)
  const in30DaysIso = in30Days.toISOString().slice(0, 10)

  // Determine overall minimum and maximum date boundaries for database filtering
  const allStartCandidates = [prevStartStr, startStr, todayIso].filter(Boolean)
  allStartCandidates.sort()
  const queryMinDate = allStartCandidates[0]

  const allEndCandidates = [in30DaysIso, upcomingEndIso, endStr, prevEndStr].filter(Boolean)
  allEndCandidates.sort()
  const queryMaxDate = allEndCandidates[allEndCandidates.length - 1]

  const effectiveFilter = buildEffectiveDateOrFilter(queryMinDate, queryMaxDate)
  const dateOrFilter = effectiveFilter ? `${effectiveFilter},is_recurring.eq.true,installment_total.gt.1` : 'is_recurring.eq.true,installment_total.gt.1'

  // Fetch only transactions within relevant date boundaries plus active recurrences and installments
  let txQuery = supabase
    .from('transactions')
    .select('id, type, account_id, category_id, vendor, vendor_id, date, time, currency, category, total, payment_method, notes, created_at, is_recurring, recurrence_frequency, recurrence_next_date, recurrence_status, recurrence_parent_id, recurrence_cycle_date, installment_group_id, installment_current, installment_total, installment_amount, categories(id, name, icon, color), accounts(id, name, type, institution), canonical_vendors(id, canonical_name, normalized_key)')
    .or(dateOrFilter)
    .order('created_at', { ascending: false })

  if (options.accountId) {
    txQuery = txQuery.eq('account_id', options.accountId)
  }

  const { data: allTxs, error } = await txQuery

  if (error) {
    throw new Error(`Failed to load dashboard data: ${error.message}`)
  }

  const allCategories = await listCategories({ activeOnly: false })
  const catMap = new Map(allCategories.map((c) => [c.id, c]))
  const catNormMap = new Map(allCategories.map((c) => [c.normalized_name, c]))

  const txList = (allTxs || []).map((t) => {
    const rawT = t as any
    let catObj = rawT.categories
    if (!catObj && rawT.category_id && catMap.has(rawT.category_id)) {
      const c = catMap.get(rawT.category_id)!
      catObj = { id: c.id, name: c.name, icon: c.icon, color: c.color }
    } else if (!catObj && rawT.category) {
      const norm = normalizeCategoryName(rawT.category)
      if (catNormMap.has(norm)) {
        const c = catNormMap.get(norm)!
        catObj = { id: c.id, name: c.name, icon: c.icon, color: c.color }
      }
    }

    return {
      ...t,
      categories: catObj || null,
      type: t.type === 'income' ? 'income' : 'expense',
    }
  })

  // -------------------------------------------------------------------------
  // PROJEÇÃO DE RECORRÊNCIAS PARA O PERÍODO CONSULTADO (Meses Futuros / Histórico)
  // Se o período consultado contém ciclos de uma recorrência ativa que ainda não
  // foram concretizados no banco, projetamos a ocorrência para aquele período.
  // -------------------------------------------------------------------------
  const projectedRecurringTxs = projectRecurringTransactions(txList, startStr, endStr, getEffectiveDate)

  // Agrega as projeções de recorrência à lista de transações
  if (projectedRecurringTxs.length > 0) {
    txList.push(...projectedRecurringTxs)
  }

  // -------------------------------------------------------------------------
  // PROJEÇÃO DE PARCELAS CASO AINDA NÃO MATERIALIZADAS NO BANCO
  // -------------------------------------------------------------------------
  const projectedInstallmentTxs: any[] = []
  const { addMonthsToDate: addMonthsHelper } = await import('./dateUtils')

  for (const t of txList) {
    if (t.installment_total && t.installment_total > 1 && !(t as any).is_projected) {
      const totalInst = t.installment_total
      const currentInst = t.installment_current || 1
      const baseDate = t.date || getEffectiveDate(t)
      const instAmount = Number(t.installment_amount) || Number((Number(t.total) / totalInst).toFixed(2))

      for (let i = 1; i <= totalInst; i++) {
        if (i === currentInst) continue
        const cycleDate = addMonthsHelper(baseDate, i - currentInst)
        if (cycleDate >= startStr && cycleDate <= endStr) {
          const alreadyExists = txList.some(
            (other) =>
              other.id !== t.id &&
              (
                (other.installment_group_id && t.installment_group_id && other.installment_group_id === t.installment_group_id && other.installment_current === i) ||
                (getEffectiveDate(other) === cycleDate && other.notes?.includes(t.id))
              )
          )

          if (!alreadyExists) {
            projectedInstallmentTxs.push({
              ...t,
              id: `proj_inst_${t.id}_${i}`,
              date: cycleDate,
              total: instAmount,
              installment_current: i,
              installment_total: totalInst,
              installment_amount: instAmount,
              is_projected: true,
            })
          }
        }
      }
    }
  }

  if (projectedInstallmentTxs.length > 0) {
    txList.push(...projectedInstallmentTxs)
  }

  let currentExpenses = 0
  let currentIncome = 0
  let expenseCount = 0
  let incomeCount = 0

  let prevExpenses = 0
  let prevIncome = 0

  const expenseCategoryTotals: Record<string, { total: number; count: number; rawCategory: string; color?: string | null; icon?: string | null }> = {}
  const incomeCategoryTotals: Record<string, { total: number; count: number; rawCategory: string; color?: string | null; icon?: string | null }> = {}
  const vendorTotals: Record<string, { total: number; count: number }> = {}
  const dayExpenseTotals: Record<string, number> = {}
  const dayIncomeTotals: Record<string, number> = {}

  // Account-level metrics accumulation for current period
  const accountTotals: Record<string, {
    id: string
    name: string
    type: string
    institution: string | null
    totalExpenses: number
    totalIncome: number
    transactionCount: number
  }> = {}

  let maxExpense: { id: string; vendor: string | null; total: number; date: string; category: string } | null = null
  const periodTransactions: any[] = []

  for (const tx of txList) {
    const effDate = getEffectiveDate(tx)
    const amount = Number(tx.total) || 0
    const isIncome = tx.type === 'income'
    const cv = tx.canonical_vendors ? (Array.isArray(tx.canonical_vendors) ? tx.canonical_vendors[0] : tx.canonical_vendors) : null
    const displayVendor = cv?.canonical_name || tx.vendor?.trim() || 'Não Identificado'
    const catRel = tx.categories ? (Array.isArray(tx.categories) ? tx.categories[0] : tx.categories) : null
    const categoryName = catRel?.name || (tx.category ? translateCategory(tx.category) : 'Outros')

    // Check if in current period
    if (effDate >= startStr && effDate <= endStr) {
      periodTransactions.push({
        ...tx,
        vendor: displayVendor,
        category: categoryName,
      })

      // Account accumulation
      const accId = tx.account_id || 'unassigned'
      if (!accountTotals[accId]) {
        const rawAcc = Array.isArray(tx.accounts) ? tx.accounts[0] : tx.accounts
        const accInfo = rawAcc || (tx.account_id ? accountsMap[tx.account_id] : null)
        accountTotals[accId] = {
          id: accId,
          name: accInfo?.name || (accId === 'unassigned' ? 'Sem conta definida' : 'Conta Removida'),
          type: accInfo?.type || 'other',
          institution: accInfo?.institution || null,
          totalExpenses: 0,
          totalIncome: 0,
          transactionCount: 0,
        }
      }
      accountTotals[accId].transactionCount += 1

      if (isIncome) {
        currentIncome += amount
        incomeCount += 1
        accountTotals[accId].totalIncome += amount
        dayIncomeTotals[effDate] = (dayIncomeTotals[effDate] || 0) + amount

        // Income Source Breakdown
        const sourceLabel = displayVendor !== 'Não Identificado' ? displayVendor : categoryName
        if (!incomeCategoryTotals[sourceLabel]) {
          incomeCategoryTotals[sourceLabel] = { total: 0, count: 0, rawCategory: categoryName }
        }
        incomeCategoryTotals[sourceLabel].total += amount
        incomeCategoryTotals[sourceLabel].count += 1
      } else {
        currentExpenses += amount
        expenseCount += 1
        accountTotals[accId].totalExpenses += amount
        dayExpenseTotals[effDate] = (dayExpenseTotals[effDate] || 0) + amount

        // Expense Category breakdown (using categories table name, icon, color or translated fallback)
        if (!expenseCategoryTotals[categoryName]) {
          expenseCategoryTotals[categoryName] = {
            total: 0,
            count: 0,
            rawCategory: categoryName,
            color: catRel?.color || null,
            icon: catRel?.icon || null,
          }
        }
        expenseCategoryTotals[categoryName].total += amount
        expenseCategoryTotals[categoryName].count += 1

        // Vendor breakdown (expenses only) using canonical vendor
        const ven = displayVendor
        if (!vendorTotals[ven]) vendorTotals[ven] = { total: 0, count: 0 }
        vendorTotals[ven].total += amount
        vendorTotals[ven].count += 1

        // Max single expense
        if (!maxExpense || amount > maxExpense.total) {
          maxExpense = {
            id: tx.id,
            vendor: displayVendor !== 'Não Identificado' ? displayVendor : (tx.vendor || null),
            total: amount,
            date: effDate,
            category: categoryName,
          }
        }
      }
    }

    // Check if in previous period
    if (effDate >= prevStartStr && effDate <= prevEndStr) {
      if (isIncome) {
        prevIncome += amount
      } else {
        prevExpenses += amount
      }
    }
  }

  const activeDaysCount = Object.keys(dayExpenseTotals).length
  const dailyAverage = currentExpenses > 0 ? Number((currentExpenses / totalDaysInPeriod).toFixed(2)) : 0
  const averageTicket = expenseCount > 0 ? Number((currentExpenses / expenseCount).toFixed(2)) : 0
  const balance = Number((currentIncome - currentExpenses).toFixed(2))

  // Compute Account Metrics ranking (sorted by total usage: expenses + income, then expenses)
  const accountMetrics: AccountMetric[] = Object.values(accountTotals)
    .map((acc) => {
      const exp = Number(acc.totalExpenses.toFixed(2))
      const inc = Number(acc.totalIncome.toFixed(2))
      return {
        id: acc.id,
        name: acc.name,
        type: acc.type,
        institution: acc.institution,
        totalExpenses: exp,
        totalIncome: inc,
        balance: Number((inc - exp).toFixed(2)),
        expensePercentage: currentExpenses > 0 ? Number(((exp / currentExpenses) * 100).toFixed(1)) : 0,
        incomePercentage: currentIncome > 0 ? Number(((inc / currentIncome) * 100).toFixed(1)) : 0,
        transactionCount: acc.transactionCount,
      }
    })
    .sort((a, b) => b.totalExpenses + b.totalIncome - (a.totalExpenses + a.totalIncome))

  // Peak expense day
  let peakDay: { date: string; formattedDate: string; total: number } | null = null
  let maxDaySpend = 0
  for (const [dStr, total] of Object.entries(dayExpenseTotals)) {
    if (total > maxDaySpend) {
      maxDaySpend = total
      const [y, m, d] = dStr.split('-')
      peakDay = {
        date: dStr,
        formattedDate: `${d}/${m}/${y}`,
        total: Number(total.toFixed(2)),
      }
    }
  }

  // Comparison with previous period (for expenses)
  const differenceAmount = Number((currentExpenses - prevExpenses).toFixed(2))
  const differencePercentage =
    prevExpenses > 0
      ? Number((((currentExpenses - prevExpenses) / prevExpenses) * 100).toFixed(1))
      : null

  const prevBalance = Number((prevIncome - prevExpenses).toFixed(2))

  // Top Expense Categories sorted
  const topCategories = Object.entries(expenseCategoryTotals)
    .map(([category, info]: [string, any]) => ({
      category,
      rawCategory: info.rawCategory,
      color: info.color || null,
      icon: info.icon || null,
      total: Number(info.total.toFixed(2)),
      count: info.count,
      percentage: currentExpenses > 0 ? Number(((info.total / currentExpenses) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.total - a.total)

  // Top Income Sources sorted
  const topIncomeSources = Object.entries(incomeCategoryTotals)
    .map(([source, info]) => ({
      source,
      category: translateCategory(info.rawCategory),
      total: Number(info.total.toFixed(2)),
      count: info.count,
      percentage: currentIncome > 0 ? Number(((info.total / currentIncome) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.total - a.total)

  // Top Vendors sorted (expenses)
  const topVendors = Object.entries(vendorTotals)
    .map(([vendor, info]) => ({
      vendor,
      total: Number(info.total.toFixed(2)),
      count: info.count,
      percentage: currentExpenses > 0 ? Number(((info.total / currentExpenses) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.total - a.total)

  // Daily evolution list for all days in the period
  const dailyExpenses: { date: string; label: string; day: number; total: number; income: number; expense: number }[] = []
  const curr = new Date(startDateObj)
  while (curr <= endDateObj) {
    const dStr = curr.toISOString().slice(0, 10)
    const day = curr.getUTCDate()
    const dayExp = dayExpenseTotals[dStr] || 0
    const dayInc = dayIncomeTotals[dStr] || 0
    dailyExpenses.push({
      date: dStr,
      label: `${String(day).padStart(2, '0')}/${String(curr.getUTCMonth() + 1).padStart(2, '0')}`,
      day,
      total: Number(dayExp.toFixed(2)),
      expense: Number(dayExp.toFixed(2)),
      income: Number(dayInc.toFixed(2)),
    })
    curr.setUTCDate(curr.getUTCDate() + 1)
  }

  // Deterministic Insights Generation
  const insights: { type: 'positive' | 'warning' | 'neutral' | 'info'; title: string; description: string }[] = []
  const totalOperations = expenseCount + incomeCount

  if (totalOperations === 0) {
    insights.push({
      type: 'info',
      title: 'Nenhum lançamento no período',
      description: `Não há despesas ou receitas registradas entre ${startStr} e ${endStr}.`,
    })
  } else {
    // 1. Balance Insight
    if (currentIncome > 0 || currentExpenses > 0) {
      if (balance > 0) {
        insights.push({
          type: 'positive',
          title: `Superávit do período: +R$ ${balance.toFixed(2)}`,
          description: `Suas receitas superaram as despesas em R$ ${balance.toFixed(2)} no período selecionado.`,
        })
      } else if (balance < 0) {
        insights.push({
          type: 'warning',
          title: `Déficit do período: -R$ ${Math.abs(balance).toFixed(2)}`,
          description: `Você gastou R$ ${Math.abs(balance).toFixed(2)} a mais do que recebeu no período.`,
        })
      } else {
        insights.push({
          type: 'neutral',
          title: 'Saldo equilibrado no período',
          description: `Receitas e despesas estão exatamente empatadas em R$ ${currentIncome.toFixed(2)}.`,
        })
      }
    }

    // 2. Top Category Insight
    if (topCategories.length > 0) {
      const topCat = topCategories[0]
      insights.push({
        type: topCat.percentage > 40 ? 'warning' : 'neutral',
        title: `Maior concentração: ${topCat.category}`,
        description: `Representa ${topCat.percentage}% do total gasto no período (R$ ${topCat.total.toFixed(2)} em ${topCat.count} compra(s)).`,
      })
    }

    // 3. Comparison Insight for expenses
    if (prevExpenses > 0 && differencePercentage !== null) {
      if (differenceAmount > 0) {
        insights.push({
          type: 'warning',
          title: 'Gastos acima do período anterior',
          description: `Você gastou R$ ${differenceAmount.toFixed(2)} a mais (+${differencePercentage}%) em relação a ${prevPeriodLabel}.`,
        })
      } else if (differenceAmount < 0) {
        insights.push({
          type: 'positive',
          title: 'Economia em relação ao período anterior',
          description: `Você economizou R$ ${Math.abs(differenceAmount).toFixed(2)} (${differencePercentage}%) comparado a ${prevPeriodLabel}.`,
        })
      }
    }

    // 4. Top Income Source Insight
    if (topIncomeSources.length > 0) {
      const topInc = topIncomeSources[0]
      insights.push({
        type: 'info',
        title: `Principal fonte de receita: ${topInc.source}`,
        description: `Gerou R$ ${topInc.total.toFixed(2)} (${topInc.percentage}% das receitas do período).`,
      })
    }

    // 5. Account insight (most used account)
    if (accountMetrics.length > 0 && accountMetrics[0].transactionCount > 0) {
      const mainAcc = accountMetrics[0]
      insights.push({
        type: 'info',
        title: `Meio mais utilizado: ${mainAcc.name}`,
        description: `${mainAcc.name} concentrou ${mainAcc.transactionCount} transação(ões), somando ${mainAcc.expensePercentage}% das despesas do período.`,
      })
    }

    // 6. Top Vendor Insight
    if (topVendors.length > 0) {
      const topVen = topVendors[0]
      insights.push({
        type: 'info',
        title: `Estabelecimento principal: ${topVen.vendor}`,
        description: `Concentrou ${topVen.percentage}% dos gastos (R$ ${topVen.total.toFixed(2)} em ${topVen.count} compra(s)).`,
      })
    }

    // 7. Peak day insight
    if (peakDay && peakDay.total > 0 && activeDaysCount > 1) {
      insights.push({
        type: 'neutral',
        title: `Pico de gastos em ${peakDay.formattedDate}`,
        description: `O dia de maior desembolso somou R$ ${peakDay.total.toFixed(2)}.`,
      })
    }
  }

  // ----------------------------------------------------
  // UPCOMING COMMITMENTS (Compromissos Futuros Reais - Próximos 30 dias)
  // ----------------------------------------------------
  const windowStart = todayIso
  const windowEnd = in30DaysIso

  // 1. Credit Card Invoices (Faturas Consolidadas)
  const invoiceGroups: Record<string, {
    acc: any
    dueDate: string
    total: number
    items: Array<{
      id: string
      date: string
      vendor: string | null
      category: string | null
      amount: number
      installmentCurrent?: number | null
      installmentTotal?: number | null
      isInstallment?: boolean
      notes?: string | null
      rawTx?: any
    }>
  }> = {}

  for (const tx of txList) {
    if (tx.type !== 'expense') continue
    if (tx.is_recurring) continue
    const rawAcc = Array.isArray(tx.accounts) ? tx.accounts[0] : tx.accounts
    const accountId = tx.account_id || (rawAcc as any)?.id
    const acc: any = (accountId && accountsMap[accountId]) ? accountsMap[accountId] : rawAcc
    if (!acc || acc.type !== 'credit_card') continue
    if (isImmediatePayment(tx.payment_method, acc.type)) continue

    const closingDay = acc.closing_day || 5
    const dueDay = acc.due_day || 15
    const txDate = getEffectiveDate(tx)
    const cycle = getCardInvoiceDates(txDate, closingDay, dueDay)

    // Check if invoice due date falls within the next 30 days
    if (cycle.dueDate >= windowStart && cycle.dueDate <= windowEnd) {
      const groupKey = `${acc.id}-${cycle.dueDate}`
      if (!invoiceGroups[groupKey]) {
        invoiceGroups[groupKey] = {
          acc,
          dueDate: cycle.dueDate,
          total: 0,
          items: [],
        }
      }

      const amount = Number(tx.installment_amount) || Number(tx.total) || 0
      invoiceGroups[groupKey].total = Number((invoiceGroups[groupKey].total + amount).toFixed(2))
      invoiceGroups[groupKey].items.push({
        id: tx.id,
        date: txDate,
        vendor: tx.vendor || null,
        category: translateCategory(tx.category) || 'Outros',
        amount,
        installmentCurrent: tx.installment_current || null,
        installmentTotal: tx.installment_total || null,
        isInstallment: Boolean(tx.installment_total && tx.installment_total > 1),
        notes: tx.notes || null,
        rawTx: tx,
      })
    }
  }

  const upcomingInvoices: UpcomingCommitment[] = Object.values(invoiceGroups).map((grp) => {
    const cardName = grp.acc.institution ? `Fatura ${grp.acc.institution}` : `Fatura ${grp.acc.name}`
    const dueDay = grp.acc.due_day || parseInt(grp.dueDate.slice(8, 10), 10)
    return {
      id: `invoice-${grp.acc.id}-${grp.dueDate}`,
      kind: 'card_invoice',
      title: cardName,
      vendor: cardName,
      category: 'Fatura de Cartão',
      accountName: grp.acc.name,
      accountType: 'credit_card',
      amount: grp.total,
      date: grp.dueDate,
      dueDay,
      dueDayLabel: `vence dia ${dueDay}`,
      invoiceItems: grp.items.sort((a, b) => a.date.localeCompare(b.date)),
    }
  })

  // 2. Fixed & Recurring Commitments (Despesas Recorrentes a Vencer)
  const rawUpcomingRecurring: UpcomingCommitment[] = getUpcomingRecurringCommitments(
    txList,
    windowStart,
    windowEnd,
    {
      getEffectiveDateFn: getEffectiveDate,
      accountsMap,
      translateCategoryFn: translateCategory,
    }
  )

  const upcomingRecurring: UpcomingCommitment[] = []
  for (const item of rawUpcomingRecurring) {
    const rawAcc = item.rawTx?.accounts
    const accInfo = rawAcc || (item.rawTx?.account_id ? accountsMap[item.rawTx.account_id] : null)
    const accType = accInfo?.type || null

    // Rule 3: Exclude immediate payments
    if (isImmediatePayment(item.rawTx?.payment_method, accType)) {
      continue
    }

    // Rule 4: If real transaction already launched for this cycle, substitute/replace forecast
    const itemCycleMonth = item.date.slice(0, 7)
    const alreadyLaunched = txList.some((t) => {
      if (t.id === item.id) return false
      if (t.type !== 'expense') return false
      // Matching via recurrence parent tracking
      if (t.recurrence_parent_id === item.id && t.recurrence_cycle_date === item.date) {
        return true
      }
      // Matching via vendor/category and cycle month (not recurring)
      if (!t.is_recurring && t.date && t.date.slice(0, 7) === itemCycleMonth) {
        const tVend = (t.vendor || '').trim().toLowerCase()
        const iVend = (item.vendor || '').trim().toLowerCase()
        if (tVend && iVend && tVend === iVend) {
          return true
        }
      }
      return false
    })

    if (alreadyLaunched) {
      continue
    }

    const dueDay = parseInt(item.date.slice(8, 10), 10)
    const isEstimated = Boolean(
      item.rawTx?.notes?.includes('[Estimado]') ||
      (item.rawTx as any)?.is_estimated
    )

    upcomingRecurring.push({
      ...item,
      dueDay,
      dueDayLabel: `vence dia ${dueDay}`,
      isEstimated,
    })
  }

  // 3. Installments (Loose / Standalone)
  const upcomingInstallments: UpcomingCommitment[] = []
  const standaloneInstallments: UpcomingCommitment[] = []

  for (const tx of txList) {
    if (tx.type !== 'expense') continue
    const rawAcc = Array.isArray(tx.accounts) ? tx.accounts[0] : tx.accounts
    const accInfo = rawAcc || (tx.account_id ? accountsMap[tx.account_id] : null)
    const accName = accInfo?.name || (tx.account_id ? 'Conta' : null)
    const accType = accInfo?.type || null
    const amount = Number(tx.total) || 0
    const cat = translateCategory(tx.category)

    if (tx.installment_total && tx.installment_total > 1 && !(tx as any).is_projected) {
      const currentInst = tx.installment_current || 1
      const totalInst = tx.installment_total
      const txDate = getEffectiveDate(tx)
      const instAmount = Number(tx.installment_amount) || amount

      if (txDate > windowStart && txDate <= windowEnd) {
        const instCommitment: UpcomingCommitment = {
          id: tx.id,
          kind: 'installment',
          title: `${tx.vendor || cat || 'Parcela'} (${currentInst}/${totalInst})`,
          vendor: tx.vendor || null,
          category: cat,
          accountName: accName,
          accountType: accType,
          amount: instAmount,
          date: txDate,
          installmentInfo: {
            current: currentInst,
            total: totalInst,
            groupId: tx.installment_group_id || null,
          },
          rawTx: tx,
        }

        upcomingInstallments.push(instCommitment)

        // Only include in standalone if not already consolidated into a card invoice
        if (accType !== 'credit_card' && !isImmediatePayment(tx.payment_method, accType)) {
          standaloneInstallments.push(instCommitment)
        }
      }
    }
  }

  // Sort upcoming commitments by date ascending
  upcomingInvoices.sort((a, b) => a.date.localeCompare(b.date))
  upcomingRecurring.sort((a, b) => a.date.localeCompare(b.date))
  upcomingInstallments.sort((a, b) => a.date.localeCompare(b.date))

  // Consolidated allUpcoming for UI Home: card invoices + recurring bills + standalone non-card installments
  const allUpcoming = [...upcomingInvoices, ...upcomingRecurring, ...standaloneInstallments].sort(
    (a, b) => a.date.localeCompare(b.date)
  )

  const recurringTotal30Days = Number(
    upcomingRecurring.reduce((sum, item) => sum + item.amount, 0).toFixed(2)
  )
  const invoicesTotal30Days = Number(
    upcomingInvoices.reduce((sum, item) => sum + item.amount, 0).toFixed(2)
  )
  const standaloneInstallmentsTotal = Number(
    standaloneInstallments.reduce((sum, item) => sum + item.amount, 0).toFixed(2)
  )
  const installmentsTotal30Days = Number(
    upcomingInstallments.reduce((sum, item) => sum + item.amount, 0).toFixed(2)
  )
  const forecastTotal30Days = Number(
    allUpcoming.reduce((sum, item) => sum + item.amount, 0).toFixed(2)
  )

  return {
    period: {
      type: periodType,
      label: periodLabel,
      startDate: startStr,
      endDate: endStr,
      previousLabel: prevPeriodLabel,
      previousStartDate: prevStartStr,
      previousEndDate: prevEndStr,
    },
    selectedAccountId: options.accountId || null,
    metrics: {
      totalIncome: Number(currentIncome.toFixed(2)),
      totalExpenses: Number(currentExpenses.toFixed(2)),
      balance,
      totalSpent: Number(currentExpenses.toFixed(2)),
      expenseTransactionCount: expenseCount,
      incomeTransactionCount: incomeCount,
      transactionCount: totalOperations,
      dailyAverage,
      activeDaysCount,
      totalDaysInPeriod,
      averageTicket,
      maxExpense,
      peakDay,
      comparison: {
        previousTotalSpent: Number(prevExpenses.toFixed(2)),
        previousTotalIncome: Number(prevIncome.toFixed(2)),
        previousBalance: prevBalance,
        differenceAmount,
        differencePercentage,
      },
    },
    topCategories,
    topIncomeSources,
    topVendors,
    accountMetrics,
    recentTransactions: periodTransactions.slice(0, 5),
    dailyExpenses,
    upcomingCommitments: {
      forecastTotal30Days,
      recurringTotal30Days,
      installmentsTotal30Days,
      upcomingRecurring,
      upcomingInstallments,
      allUpcoming,
    },
    forecastTotal30Days,
    recurringTotal30Days,
    installmentsTotal30Days,
    upcomingRecurring,
    upcomingInstallments,
    allUpcoming,
    insights,
  }
}

import { getSupabaseClient } from '../persist'
import type { Account, AccountType } from '../schema'
import { getCardInvoiceDates } from '../billingCycles'
import { listCategories, normalizeCategoryName } from './categoryQueries'

/**
 * Helper to identify if an account name/record represents a payment method pseudo-account (e.g. legacy 'PIX')
 * rather than an actual financial institution, bank account, or card.
 */
export function isPaymentMethodAccount(acc: { name?: string | null; institution?: string | null }): boolean {
  const nameNorm = (acc.name || '').trim().toLowerCase()
  return nameNorm === 'pix'
}

/**
 * List accounts from Supabase (defaults to active accounts)
 */
export async function listAccounts(options: { activeOnly?: boolean; includePaymentMethodAccounts?: boolean } = { activeOnly: false, includePaymentMethodAccounts: true }): Promise<Account[]> {
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

  const rawAccounts = ((data || []) as Account[])
  const filtered = options.includePaymentMethodAccounts !== false
    ? rawAccounts
    : rawAccounts.filter((acc) => !isPaymentMethodAccount(acc))

  const accounts = filtered.map((acc) => ({
    ...acc,
    closing_day: acc.closing_day !== undefined && acc.closing_day !== null ? acc.closing_day : (acc.type === 'credit_card' ? 5 : null),
    due_day: acc.due_day !== undefined && acc.due_day !== null ? acc.due_day : (acc.type === 'credit_card' ? 15 : null),
    custom_logo: acc.custom_logo || null,
    color: acc.color || null,
    skin: acc.skin || null,
  }))

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
  const closing_day = input.closing_day !== undefined ? input.closing_day : (input.type === 'credit_card' ? 5 : null)
  const due_day = input.due_day !== undefined ? input.due_day : (input.type === 'credit_card' ? 15 : null)
  const custom_logo = input.custom_logo || null
  const color = input.color || null
  const skin = input.skin || null

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      id: 'mock-account-id',
      name: input.name,
      type: input.type,
      institution: input.institution || null,
      active: input.active ?? true,
      closing_day,
      due_day,
      custom_logo,
      color,
      skin,
    }
  }

  const { data, error } = await supabase
    .from('accounts')
    .insert({
      name: input.name.trim(),
      type: input.type,
      institution: input.institution?.trim() || null,
      active: input.active ?? true,
      closing_day,
      due_day,
      custom_logo,
      color,
      skin,
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(`Failed to create account: ${error.message}`)
  }

  return data as Account
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

  const closing_day = accountData.closing_day !== undefined && accountData.closing_day !== null ? accountData.closing_day : (accountData.type === 'credit_card' ? 5 : null)
  const due_day = accountData.due_day !== undefined && accountData.due_day !== null ? accountData.due_day : (accountData.type === 'credit_card' ? 15 : null)
  const custom_logo = accountData.custom_logo || null
  const color = accountData.color || null
  const skin = accountData.skin || null

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

export async function listAccountsWithStats(options: { activeOnly?: boolean; includePaymentMethodAccounts?: boolean } = { activeOnly: false, includePaymentMethodAccounts: true }): Promise<AccountWithStats[]> {
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

  const rawAccounts = (accountsData || []) as Account[]
  const accounts = options.includePaymentMethodAccounts !== false
    ? rawAccounts
    : rawAccounts.filter((acc) => !isPaymentMethodAccount(acc))
  const accountsWithStats: AccountWithStats[] = accounts.map((acc) => ({
    ...acc,
    closing_day: acc.closing_day !== undefined && acc.closing_day !== null ? acc.closing_day : (acc.type === 'credit_card' ? 5 : null),
    due_day: acc.due_day !== undefined && acc.due_day !== null ? acc.due_day : (acc.type === 'credit_card' ? 15 : null),
    custom_logo: acc.custom_logo || null,
    color: acc.color || null,
    skin: acc.skin || null,
    transactionCount: 0,
    currentMonthExpenses: 0,
    futureInstallmentsTotal: 0,
    futureInstallmentsCount: 0,
  }))

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
    custom_logo?: string | null
    color?: string | null
    skin?: string | null
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
      custom_logo: input.custom_logo,
      color: input.color,
      skin: input.skin,
    }
  }

  const updates: Record<string, any> = {}
  if (input.name !== undefined) updates.name = input.name.trim()
  if (input.type !== undefined) updates.type = input.type
  if (input.institution !== undefined) {
    updates.institution = typeof input.institution === 'string' && input.institution.trim() ? input.institution.trim() : null
  }
  if (input.active !== undefined) updates.active = Boolean(input.active)
  if (input.closing_day !== undefined) updates.closing_day = input.closing_day
  if (input.due_day !== undefined) updates.due_day = input.due_day
  if (input.custom_logo !== undefined) updates.custom_logo = input.custom_logo
  if (input.color !== undefined) updates.color = input.color
  if (input.skin !== undefined) updates.skin = input.skin

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

  return {
    ...updatedAccount,
    closing_day: updatedAccount.closing_day !== undefined && updatedAccount.closing_day !== null ? updatedAccount.closing_day : (updatedAccount.type === 'credit_card' ? 5 : null),
    due_day: updatedAccount.due_day !== undefined && updatedAccount.due_day !== null ? updatedAccount.due_day : (updatedAccount.type === 'credit_card' ? 15 : null),
    custom_logo: updatedAccount.custom_logo || null,
    color: updatedAccount.color || null,
    skin: updatedAccount.skin || null,
  }
}

/**
 * Permanently delete an account or card from Supabase.
 * Strictly blocks deletion if there are any linked transactions, installments, or recurrences.
 */
export async function deleteAccount(id: string): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return true
  }

  // 1. Check if there are any transactions linked to this account
  const { count, error: countError } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', id)

  if (countError) {
    throw new Error(`Falha ao verificar lançamentos vinculados: ${countError.message}`)
  }

  if (count && count > 0) {
    throw new Error(
      `Não é possível excluir: existem ${count} lançamento(s) vinculado(s) a esta conta ou cartão. Para mantê-lo sem afetar o histórico, use a opção "Desativar".`
    )
  }

  // 2. Delete the account
  const { error: delError } = await supabase
    .from('accounts')
    .delete()
    .eq('id', id)

  if (delError) {
    throw new Error(`Falha ao excluir conta: ${delError.message}`)
  }

  return true
}

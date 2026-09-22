import { getSupabaseClient, normalizeItemName } from './persist'

export interface TransactionFilter {
  startDate?: string
  endDate?: string
  vendor?: string
  category?: string
  product?: string
  itemCategory?: string
  limit?: number
  offset?: number
}

export interface ItemReportFilter {
  product?: string
  vendor?: string
  category?: string
  itemCategory?: string
  startDate?: string
  endDate?: string
}

export interface ItemReportSummary {
  product: string
  total_spent: number
  occurrences: number
  total_quantity: number | null
  average_price: number | null
  min_price: number | null
  max_price: number | null
  purchases: {
    transaction_id: string
    vendor: string | null
    date: string | null
    currency: string
    description: string
    quantity: number | null
    unit_price: number | null
    total: number | null
    item_category: string | null
    created_at: string
  }[]
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
      const normalized = normalizeItemName(filters.product)
      itemQuery = itemQuery.ilike('normalized_name', `%${normalized}%`)
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
  let query = supabase
    .from('transactions')
    .select('*, transaction_items(*)', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (matchingTransactionIds) {
    query = query.in('id', matchingTransactionIds)
  }

  if (filters.vendor) {
    query = query.ilike('vendor', `%${filters.vendor.trim()}%`)
  }

  if (filters.category) {
    query = query.ilike('category', `%${filters.category.trim()}%`)
  }

  if (filters.startDate) {
    // If date is null in transaction, fallback or filter by date
    query = query.gte('date', filters.startDate)
  }

  if (filters.endDate) {
    query = query.lte('date', filters.endDate)
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

  const transactions = data || []
  const totalAmount = transactions.reduce((sum, tx) => sum + (Number(tx.total) || 0), 0)

  return {
    transactions,
    total_count: count ?? transactions.length,
    total_amount: Number(totalAmount.toFixed(2)),
  }
}

/**
 * Generate aggregated item purchase report
 */
export async function getItemReport(filters: ItemReportFilter = {}): Promise<ItemReportSummary> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      product: filters.product || 'all',
      total_spent: 0,
      occurrences: 0,
      total_quantity: 0,
      average_price: 0,
      min_price: 0,
      max_price: 0,
      purchases: [],
    }
  }

  let query = supabase
    .from('transaction_items')
    .select(`
      id,
      transaction_id,
      description,
      normalized_name,
      quantity,
      unit_price,
      total,
      category,
      created_at,
      transactions!inner (
        id,
        vendor,
        date,
        currency,
        category
      )
    `)
    .order('created_at', { ascending: false })

  if (filters.product) {
    const normalized = normalizeItemName(filters.product)
    query = query.ilike('normalized_name', `%${normalized}%`)
  }

  if (filters.itemCategory) {
    query = query.ilike('category', `%${filters.itemCategory.trim()}%`)
  }

  if (filters.vendor) {
    query = query.ilike('transactions.vendor', `%${filters.vendor.trim()}%`)
  }

  if (filters.category) {
    query = query.ilike('transactions.category', `%${filters.category.trim()}%`)
  }

  if (filters.startDate) {
    query = query.gte('transactions.date', filters.startDate)
  }

  if (filters.endDate) {
    query = query.lte('transactions.date', filters.endDate)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch item report: ${error.message}`)
  }

  const items = data || []
  const occurrences = items.length

  let totalSpent = 0
  let totalQuantity: number | null = 0
  const prices: number[] = []

  const purchases = items.map((row: any) => {
    const itemTotal = row.total != null ? Number(row.total) : (row.unit_price && row.quantity ? Number(row.unit_price) * Number(row.quantity) : 0)
    totalSpent += itemTotal

    if (row.quantity != null) {
      if (totalQuantity !== null) totalQuantity += Number(row.quantity)
    }

    const price = row.unit_price != null ? Number(row.unit_price) : row.total != null ? Number(row.total) : null
    if (price !== null && !isNaN(price)) {
      prices.push(price)
    }

    const tx = row.transactions
    return {
      transaction_id: row.transaction_id,
      vendor: tx?.vendor || null,
      date: tx?.date || null,
      currency: tx?.currency || 'BRL',
      description: row.description,
      quantity: row.quantity != null ? Number(row.quantity) : null,
      unit_price: row.unit_price != null ? Number(row.unit_price) : null,
      total: row.total != null ? Number(row.total) : null,
      item_category: row.category || null,
      created_at: row.created_at,
    }
  })

  const minPrice = prices.length > 0 ? Math.min(...prices) : null
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null
  const averagePrice = prices.length > 0 ? Number((prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2)) : null

  return {
    product: filters.product || 'all',
    total_spent: Number(totalSpent.toFixed(2)),
    occurrences,
    total_quantity: occurrences > 0 ? totalQuantity : 0,
    average_price: averagePrice,
    min_price: minPrice,
    max_price: maxPrice,
    purchases,
  }
}

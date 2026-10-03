import { getSupabaseClient, normalizeItemName } from '../persist'
import { resolveInstallmentPlan, syncInstallmentGroup } from '../installments'
import { resolveRecurrenceUpdate } from '../recurrence'
import { listCategories, normalizeCategoryName } from './categoryQueries'

export interface TransactionFilter {
  userId?: string
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
  search?: string
  limit?: number
  offset?: number
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
      has_more: false,
    }
  }

  // 1. If filtering by product or itemCategory, find matching transaction_ids first
  let matchingTransactionIds: string[] | null = null

  if (filters.product || filters.itemCategory) {
    let itemQuery = supabase.from('transaction_items').select('transaction_id')

    if (filters.product) {
      const rawSearch = filters.product.trim()
      const normalized = normalizeItemName(rawSearch)
      const { parseProductDescription } = await import('../canonical')
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
        has_more: false,
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

  // User ID filter (User isolation)
  if (filters.userId) {
    query = query.eq('user_id', filters.userId)
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
    const { cleanVendorText, parseVendor } = await import('../canonicalVendor')
    const parsed = parseVendor(rawSearch)
    const cleanSearch = cleanVendorText(rawSearch)
    const cleanKey = parsed.normalizedKey

    // Check if canonical vendors match by canonical_name, normalized_key, aliases, or clean search
    const { data: matchedVendors } = await supabase
      .from('canonical_vendors')
      .select('id')
      .or(`normalized_key.ilike.%${cleanKey}%,normalized_key.ilike.%${cleanSearch}%,canonical_name.ilike.%${rawSearch}%,canonical_name.ilike.%${parsed.canonicalName}%,aliases.cs.{${cleanSearch}}`)

    const matchedVendorIds = (matchedVendors || []).map((cv: any) => cv.id)

    const conditions: string[] = []
    if (matchedVendorIds.length > 0) {
      conditions.push(`vendor_id.in.(${matchedVendorIds.join(',')})`)
    }
    conditions.push(`vendor.ilike.%${rawSearch}%`)
    if (parsed.canonicalName !== 'Outros' && parsed.canonicalName !== rawSearch) {
      conditions.push(`vendor.ilike.%${parsed.canonicalName}%`)
    }
    if (cleanKey && cleanKey !== 'outros' && cleanKey !== cleanSearch) {
      conditions.push(`vendor.ilike.%${cleanKey}%`)
    }

    query = query.or(conditions.join(','))
  }

  if (filters.category) {
    const term = filters.category.trim()
    query = query.ilike('category', `%${term}%`)
  }

  // Global search across vendor, category, notes, canonical vendors and items
  if (filters.search && filters.search.trim()) {
    const rawSearch = filters.search.trim()
    const norm = normalizeItemName(rawSearch)

    try {
      const { parseProductDescription } = await import('../canonical')
      const parsed = parseProductDescription(rawSearch)

      const { data: matchedProducts } = await supabase
        .from('canonical_products')
        .select('id')
        .or(`normalized_key.ilike.%${parsed.normalizedKey}%,canonical_name.ilike.%${rawSearch}%,brand.ilike.%${rawSearch}%`)

      const matchedProductIds = (matchedProducts || []).map((cp: any) => cp.id)

      let searchItemQuery = supabase.from('transaction_items').select('transaction_id')
      if (matchedProductIds.length > 0) {
        searchItemQuery = searchItemQuery.or(`product_id.in.(${matchedProductIds.join(',')}),normalized_name.ilike.%${norm}%,description.ilike.%${rawSearch}%,category.ilike.%${rawSearch}%`)
      } else {
        searchItemQuery = searchItemQuery.or(`normalized_name.ilike.%${norm}%,description.ilike.%${rawSearch}%,category.ilike.%${rawSearch}%`)
      }

      const { data: searchItemMatches } = await searchItemQuery
      const searchItemTxIds = Array.from(new Set((searchItemMatches || []).map((r: any) => r.transaction_id)))

      const { cleanVendorText } = await import('../canonicalVendor')
      const cleanSearch = cleanVendorText(rawSearch)
      const { data: matchedVendors } = await supabase
        .from('canonical_vendors')
        .select('id')
        .or(`normalized_key.ilike.%${cleanSearch}%,canonical_name.ilike.%${rawSearch}%,aliases.cs.{${cleanSearch}}`)
      const matchedVendorIds = (matchedVendors || []).map((cv: any) => cv.id)

      const searchConditions = [
        `vendor.ilike.%${rawSearch}%`,
        `category.ilike.%${rawSearch}%`,
        `notes.ilike.%${rawSearch}%`,
      ]
      if (matchedVendorIds.length > 0) {
        searchConditions.push(`vendor_id.in.(${matchedVendorIds.join(',')})`)
      }
      if (searchItemTxIds.length > 0) {
        searchConditions.push(`id.in.(${searchItemTxIds.join(',')})`)
      }

      query = query.or(searchConditions.join(','))
    } catch (searchErr) {
      console.warn('Error applying search filter:', searchErr)
      query = query.or(`vendor.ilike.%${rawSearch}%,category.ilike.%${rawSearch}%,notes.ilike.%${rawSearch}%`)
    }
  }

  // Effective date filtering (date OR created_at)
  const dateOrFilter = buildEffectiveDateOrFilter(filters.startDate, filters.endDate)
  if (dateOrFilter) {
    query = query.or(dateOrFilter)
  }

  if (filters.offset !== undefined) {
    const lim = filters.limit || 50
    query = query.range(filters.offset, filters.offset + lim - 1)
  } else if (filters.limit) {
    query = query.limit(filters.limit)
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
  const totalCount = count ?? transactions.length
  const offset = filters.offset ?? 0
  const hasMore = offset + transactions.length < totalCount

  return {
    transactions,
    total_count: totalCount,
    total_amount: Number(totalAmount.toFixed(2)),
    has_more: hasMore,
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

/**
 * Delete all transactions belonging to an installment group by installment_group_id from Supabase
 * Cascades automatically to transaction_items.
 */
export async function deleteInstallmentGroup(groupId: string): Promise<boolean> {
  if (!groupId) {
    throw new Error('installment_group_id is required')
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return true
  }

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('installment_group_id', groupId)

  if (error) {
    throw new Error(`Failed to delete installment group: ${error.message}`)
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
      const { getOrCreateCanonicalVendor } = await import('../canonicalVendor')
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
    const { getOrCreateCanonicalProduct } = await import('../canonical')
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
        user_id: existingTx?.user_id || 'bc5a76de-8865-4ec3-b7d5-5dfbfb8123a6',
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

  // Learn preference if category or vendor were explicitly updated
  if ((input.category_id || input.category) && (updatedTx.vendor || input.vendor)) {
    try {
      const { learnCategoryPreference } = await import('../categoryLearning')
      await learnCategoryPreference({
        vendor: input.vendor || updatedTx.vendor,
        categoryId: input.category_id || updatedTx.category_id,
        categoryName: input.category || updatedTx.category,
        transactionType: (input.type || updatedTx.type) === 'income' ? 'income' : 'expense',
        source: 'user_correction',
      })
    } catch (learnErr) {
      console.warn('Could not register learned category preference on update:', learnErr)
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

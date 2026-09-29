import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Receipt, StoredReceipt } from './schema'
import { detectDuplicateTransaction, type DuplicateCheckResult } from './duplicate'
import { resolveInstallmentPlan, buildFutureInstallmentRows, generateUUID } from './installments'
import { resolveRecurrenceUpdate } from './recurrence'

export interface PersistInput {
  receipt: Receipt
  imageKey: string | null
  imageSha256: string | null
  sourceType?: 'image' | 'text' | 'manual'
  originType?: 'text' | 'image' | 'manual'
  rawText?: string | null
  originalFilename?: string | null
  capturedAt?: string
  originalExtractedData?: Record<string, any> | null
  allowDuplicate?: boolean
}

export class DuplicateTransactionError extends Error {
  duplicateResult: DuplicateCheckResult

  constructor(result: DuplicateCheckResult) {
    super(result.reason || 'Lançamento duplicado detectado.')
    this.name = 'DuplicateTransactionError'
    this.duplicateResult = result
  }
}

let cachedSupabase: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    return cachedSupabase
  }

  if (!cachedSupabase) {
    cachedSupabase = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        fetch: (input, init) => {
          return fetch(input, {
            ...init,
            cache: 'no-store',
          })
        },
      },
    })
  }

  return cachedSupabase
}

export function setSupabaseClientForTesting(client: SupabaseClient | null): void {
  cachedSupabase = client
}

/**
 * Normalise description into a clean search-friendly identifier
 */
export function normalizeItemName(description: string): string {
  return description
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/**
 * Persist transaction and all transaction items into Supabase.
 * When saving a purchase in N installments (installment_total > 1):
 * - creates all N transactions sharing the same installment_group_id
 * - assigns installment_current from 1 to N with sequential monthly dates
 * - each installment transaction has its own amount
 * If Supabase environment variables are not configured, it gracefully acts
 * as an in-memory generator preserving the existing pipeline behavior.
 */
interface PreparedRows { transactions: any[]; items: any[] }

export async function save(input: PersistInput, prepared?: PreparedRows): Promise<StoredReceipt> {
  const id = generateUUID()
  const scannedAt = new Date().toISOString()
  const originType: 'text' | 'image' | 'manual' = input.originType ?? (input.sourceType === 'manual' ? 'manual' : input.sourceType === 'text' ? 'text' : input.imageKey ? 'image' : input.sourceType ?? 'image')
  // The database transactions table check constraint requires source_type to be either 'image' or 'text'
  const sourceType: 'image' | 'text' = originType === 'image' ? 'image' : 'text'
  const rawText = input.rawText ?? input.receipt.raw_text ?? null
  const originalFilename = input.originalFilename ?? input.receipt.original_filename ?? null
  const capturedAt = input.capturedAt ?? input.receipt.captured_at ?? scannedAt
  const originalExtractedData = input.originalExtractedData ?? input.receipt.original_extracted_data ?? {
    type: input.receipt.type || 'expense',
    account_id: input.receipt.account_id || null,
    vendor: input.receipt.vendor || null,
    vendor_address: input.receipt.vendor_address || null,
    date: input.receipt.date || null,
    time: input.receipt.time || null,
    currency: input.receipt.currency || 'BRL',
    category: input.receipt.category || null,
    subtotal: input.receipt.subtotal ?? null,
    tax: input.receipt.tax ?? null,
    tip: input.receipt.tip ?? null,
    total: input.receipt.total ?? null,
    payment_method: input.receipt.payment_method || null,
    notes: input.receipt.notes || null,
    items: (input.receipt.items || []).map((it) => ({
      description: it.description,
      quantity: it.quantity ?? null,
      unit_price: it.unit_price ?? null,
      total: it.total ?? null,
      category: it.category ?? null,
    })),
  }

  const rawTotal = typeof input.receipt.total === 'number' ? input.receipt.total : 0
  const plan = resolveInstallmentPlan({
    total: rawTotal,
    installmentTotal: input.receipt.installment_total,
    installmentCurrent: input.receipt.installment_current,
    installmentAmount: input.receipt.installment_amount,
    subtotal: input.receipt.subtotal,
    installmentGroupId: input.receipt.installment_group_id,
    notes: input.receipt.notes,
    vendor: input.receipt.vendor,
  })

  const isMultiInstallment = plan.isMultiInstallment
  const totalInstallments = plan.installmentTotal
  const existingGroupId = input.receipt.installment_group_id || null
  const installmentGroupId = plan.installmentGroupId
  const installmentAmount = plan.installmentAmount
  const firstInstallmentTotal = plan.installmentAmount ?? rawTotal
  const totalPurchaseAmount = plan.totalPurchaseAmount
  const firstInstallmentCurrent = plan.installmentCurrent

  const recPlan = resolveRecurrenceUpdate({
    is_recurring: input.receipt.is_recurring,
    recurrence_frequency: input.receipt.recurrence_frequency,
    recurrence_next_date: input.receipt.recurrence_next_date,
    recurrence_status: input.receipt.recurrence_status,
    date: input.receipt.date,
  })

  const supabase = getSupabaseClient()
  const { validateReceipt } = await import('./validation')
  const validation = validateReceipt(input.receipt)
  const reviewStatus = validation.reviewStatus === 'needs_review' ? 'needs_review' : (input.receipt.review_status || 'confirmed')
  const reviewReasons = Array.from(new Set([...(input.receipt.review_reasons || []), ...validation.reviewReasons]))

  if (supabase) {
    // Check for duplicates before persisting
    if (!input.allowDuplicate) {
      const dupCheck = await detectDuplicateTransaction(
        {
          receipt: input.receipt,
          imageSha256: input.imageSha256,
          sourceType,
        },
        supabase
      )

      if (dupCheck.isDuplicate) {
        throw new DuplicateTransactionError(dupCheck)
      }
    }

    try {
      // Resolve canonical vendor
      let vendorId: string | null = null
      try {
        const { getOrCreateCanonicalVendor } = await import('./canonicalVendor')
        const vendorRes = await getOrCreateCanonicalVendor(supabase, input.receipt.vendor, input.receipt.category)
        vendorId = vendorRes.vendorId
      } catch (err) {
        console.warn('Could not associate canonical vendor:', err)
      }

      // Resolve category_id from categories table
      let categoryId: string | null = input.receipt.category_id || null
      let resolvedCategoryName: string | null = input.receipt.category || null
      let categoryNeedsReview = false

      if (!categoryId && supabase) {
        try {
          const { listCategories, normalizeCategoryName } = await import('./queries')
          const txType = input.receipt.type || 'expense'
          const activeCategories = await listCategories({ type: txType, activeOnly: true })
          const outrosCategory = activeCategories.find((c) => c.normalized_name === 'outros')

          if (input.receipt.category) {
            const rawNorm = normalizeCategoryName(input.receipt.category)
            
            // 1. Direct match by normalized name
            const directMatch = activeCategories.find((c) => c.normalized_name === rawNorm)
            if (directMatch) {
              categoryId = directMatch.id
              resolvedCategoryName = directMatch.name
            } else {
              // 2. Known synonym matching
              const synonymMap: Record<string, string> = {
                groceries: 'mercado',
                grocery: 'mercado',
                supermarket: 'mercado',
                supermercado: 'mercado',
                dining: 'alimentacao',
                restaurant: 'alimentacao',
                restaurante: 'alimentacao',
                food: 'alimentacao',
                lanche: 'alimentacao',
                transportation: 'transporte',
                transport: 'transporte',
                fuel: 'transporte',
                gas: 'transporte',
                combustivel: 'transporte',
                utilities: 'moradia',
                bills: 'moradia',
                contas: 'moradia',
                health: 'saude',
                pharmacy: 'saude',
                farmacia: 'saude',
                entertainment: 'lazer',
                shopping: 'compras',
                clothing: 'compras',
                electronics: 'compras',
                salary: 'salario',
                sale: 'vendas',
                sales: 'vendas',
                refund: 'reembolsos',
                investments: 'rendimentos',
              }
              const mappedCanonical = synonymMap[rawNorm]
              const synMatch = mappedCanonical ? activeCategories.find((c) => c.normalized_name === mappedCanonical) : null
              if (synMatch) {
                categoryId = synMatch.id
                resolvedCategoryName = synMatch.name
              } else {
                // Fallback to Outros and flag for review
                categoryId = outrosCategory?.id || null
                resolvedCategoryName = outrosCategory?.name || input.receipt.category
                categoryNeedsReview = true
              }
            }
          } else {
            categoryId = outrosCategory?.id || null
            resolvedCategoryName = outrosCategory?.name || 'Outros'
          }
        } catch (catErr) {
          console.warn('Could not resolve category_id:', catErr)
        }
      }

      const effectiveReviewReasons = [...reviewReasons]
      let effectiveReviewStatus = reviewStatus
      if (categoryNeedsReview && !effectiveReviewReasons.includes('Categoria sugerida requer confirmação')) {
        effectiveReviewReasons.push('Categoria sugerida requer confirmação')
        effectiveReviewStatus = 'needs_review'
      }

      const baseDate = input.receipt.date || scannedAt.slice(0, 10)

      // Build array of all transactions to insert in a single batch
      const allTxRowsToInsert: any[] = [
        {
          id,
          account_id: input.receipt.account_id || null,
          category_id: categoryId,
          vendor_id: vendorId,
          type: input.receipt.type || 'expense',
          vendor: input.receipt.vendor,
          vendor_address: input.receipt.vendor_address,
          date: input.receipt.date || null,
          time: input.receipt.time || null,
          currency: input.receipt.currency || 'BRL',
          category: resolvedCategoryName,
          subtotal: totalPurchaseAmount,
          tax: input.receipt.tax,
          tip: input.receipt.tip,
          total: firstInstallmentTotal,
          payment_method: input.receipt.payment_method,
          notes: input.receipt.notes,
          source_type: sourceType,
          image_key: input.imageKey,
          image_sha256: input.imageSha256,
          origin_type: originType,
          raw_text: rawText,
          original_filename: originalFilename,
          captured_at: capturedAt,
          original_extracted_data: originalExtractedData,
          is_recurring: recPlan.is_recurring,
          recurrence_frequency: recPlan.recurrence_frequency,
          recurrence_next_date: recPlan.recurrence_next_date,
          recurrence_status: recPlan.recurrence_status,
          installment_group_id: installmentGroupId,
          installment_current: firstInstallmentCurrent,
          installment_total: totalInstallments,
          installment_amount: installmentAmount,
          review_status: effectiveReviewStatus,
          review_reasons: effectiveReviewReasons,
          created_at: scannedAt,
        },
      ]

      // If new multi-installment group was initialized (without existing installment_group_id), prepare installments 2..N
      if (isMultiInstallment && !existingGroupId) {
        const futureRows = buildFutureInstallmentRows(
          {
            account_id: input.receipt.account_id || null,
            category_id: categoryId,
            vendor_id: vendorId,
            type: input.receipt.type || 'expense',
            vendor: input.receipt.vendor,
            vendor_address: input.receipt.vendor_address,
            time: input.receipt.time || null,
            currency: input.receipt.currency || 'BRL',
            category: resolvedCategoryName,
            payment_method: input.receipt.payment_method,
            notes: input.receipt.notes,
            source_type: sourceType,
            origin_type: originType,
            original_filename: originalFilename,
            captured_at: capturedAt,
            original_extracted_data: originalExtractedData,
            review_status: effectiveReviewStatus,
            review_reasons: effectiveReviewReasons,
            created_at: scannedAt,
          },
          plan,
          baseDate
        )
        allTxRowsToInsert.push(...futureRows)
      }

      // 1. Perform single insert or batch insertion of all transaction rows
      const insertPayload = allTxRowsToInsert.length === 1 ? allTxRowsToInsert[0] : allTxRowsToInsert
      const { error: txError } = prepared
        ? (prepared.transactions.push(...allTxRowsToInsert), { error: null })
        : await supabase.from('transactions').insert(insertPayload)

      if (txError) {
        console.error('Supabase transaction batch insert error:', txError)
        // Cleanup in case of any partial state
        if (installmentGroupId) {
          await supabase.from('transactions').delete().eq('installment_group_id', installmentGroupId)
        } else {
          await supabase.from('transactions').delete().eq('id', id)
        }
        throw new Error(`Failed to insert transaction batch: ${txError.message}`)
      }

      // 2. Insert items attached exclusively to the 1st installment (the purchase event)
      if (input.receipt.items && input.receipt.items.length > 0) {
        const { getOrCreateCanonicalProduct } = await import('./canonical')
        const itemsToInsert = await Promise.all(
          input.receipt.items.map(async (item) => {
            let productId: string | null = null
            try {
              const res = await getOrCreateCanonicalProduct(supabase, item.description, item.category)
              productId = res.productId
            } catch (err) {
              console.warn('Could not associate canonical product:', err)
            }

            return {
              transaction_id: id,
              product_id: productId,
              description: item.description,
              normalized_name: normalizeItemName(item.description),
              quantity: item.quantity,
              unit_price: item.unit_price,
              total: item.total,
              category: item.category || null,
            }
          })
        )

        const { error: itemsError } = prepared
          ? (prepared.items.push(...itemsToInsert), { error: null })
          : await supabase.from('transaction_items').insert(itemsToInsert)

        if (itemsError) {
          console.error('Supabase transaction_items insert error:', itemsError)
        }
      }
    } catch (e) {
      console.error('Error executing Supabase persistence:', e)
      throw e
    }
  }

  return {
    ...input.receipt,
    id,
    subtotal: totalPurchaseAmount,
    total: firstInstallmentTotal,
    installment_group_id: installmentGroupId,
    installment_current: firstInstallmentCurrent,
    installment_total: totalInstallments,
    installment_amount: installmentAmount,
    image_key: input.imageKey,
    image_sha256: input.imageSha256,
    origin_type: originType,
    raw_text: rawText,
    original_filename: originalFilename,
    captured_at: capturedAt,
    original_extracted_data: originalExtractedData,
    review_status: reviewStatus,
    review_reasons: reviewReasons,
    scanned_at: scannedAt,
  }
}


/** Reuses save's preparation rules; financial rows commit in one atomic insert. */
export async function saveBatch(inputs: PersistInput[]): Promise<StoredReceipt[]> {
  const prepared: PreparedRows = { transactions: [], items: [] }
  const results: StoredReceipt[] = []
  for (const input of inputs) results.push(await save(input, prepared))
  const client = getSupabaseClient()
  if (client && prepared.transactions.length) {
    const { error } = await client.from('transactions').insert(prepared.transactions)
    if (error) throw new Error(`Failed to insert transaction batch: ${error.message}`)
    // Same item persistence semantics as a single launch.
    if (prepared.items.length) {
      const { error: itemsError } = await client.from('transaction_items').insert(prepared.items)
      if (itemsError) console.error('Supabase transaction_items insert error:', itemsError)
    }
  }
  return results
}

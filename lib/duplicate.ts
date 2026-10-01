import type { SupabaseClient } from '@supabase/supabase-js'
import type { Receipt, LineItem } from './schema'
import { normalizeItemName } from './persist'
import { formatBRL } from './formatters'

export type DuplicateConfidence = 'exact' | 'probable' | 'none'

export interface DuplicateCheckResult {
  isDuplicate: boolean
  type: DuplicateConfidence
  existingTransaction?: {
    id: string
    date: string | null
    vendor: string | null
    total: number
    type: 'expense' | 'income'
    account_id?: string | null
    image_sha256?: string | null
    created_at?: string | null
    items?: LineItem[]
  } | null
  reason?: string
}

export interface DuplicateCheckInput {
  receipt: Receipt
  imageSha256?: string | null
  sourceType?: 'image' | 'text' | 'manual'
}

/**
 * Normalizes vendor strings for duplicate matching (e.g. "Carrefour Express - Loja 12" -> "carrefour express")
 */
export function normalizeVendor(vendor?: string | null): string {
  if (!vendor) return ''
  return vendor
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Compare two item lists to see if they have identical/near-identical contents.
 */
export function areItemsMatching(
  itemsA: Array<{ description: string; total?: number | null; quantity?: number | null }>,
  itemsB: Array<{ description: string; total?: number | null; quantity?: number | null }>
): boolean {
  if (!itemsA?.length || !itemsB?.length) return false
  if (itemsA.length !== itemsB.length) return false

  const normA = itemsA
    .map((i) => normalizeItemName(i.description))
    .sort()
  const normB = itemsB
    .map((i) => normalizeItemName(i.description))
    .sort()

  for (let idx = 0; idx < normA.length; idx++) {
    if (normA[idx] !== normB[idx]) {
      return false
    }
  }

  return true
}

/**
 * Check if a receipt is a duplicate before persisting.
 *
 * Rules:
 * 1. Exact duplicate (confidence: 'exact') -> Blocks saving
 *    - Same image hash (image_sha256 matches an existing transaction).
 *    - OR same date + same vendor + same total (within 0.01) + matching item list / descriptions.
 * 2. Probable duplicate (confidence: 'probable') -> Returns warning for confirmation
 *    - Same date (or missing date fallback) + same vendor + same total (within 0.01), but items are empty or differing slightly.
 * 3. Not a duplicate (confidence: 'none') -> Legitimate similar transactions allowed
 *    - Same vendor & same day but different amounts.
 *    - Different date, different vendor, or different type (expense vs income).
 *    - Two distinct purchases of same value on same day when items are clearly distinct (and image hash differs).
 */
export async function detectDuplicateTransaction(
  input: DuplicateCheckInput,
  supabase: SupabaseClient | null
): Promise<DuplicateCheckResult> {
  if (!supabase || typeof supabase.from !== 'function') {
    return { isDuplicate: false, type: 'none' }
  }

  const txQueryBuilder = supabase.from('transactions')
  if (!txQueryBuilder || typeof txQueryBuilder.select !== 'function') {
    return { isDuplicate: false, type: 'none' }
  }

  const newTotal = typeof input.receipt.total === 'number' ? Number(input.receipt.total.toFixed(2)) : 0
  const newType = input.receipt.type || 'expense'
  const newVendorNorm = normalizeVendor(input.receipt.vendor)
  const newDate = input.receipt.date || null
  const newSha = input.imageSha256 || null

  // 1. Check exact match by image SHA-256 (same receipt image scanned twice)
  if (newSha) {
    try {
      const shaQuery = supabase
        .from('transactions')
        .select('id, date, vendor, total, type, account_id, image_sha256, created_at')
        .eq('image_sha256', newSha)

      const shaResult = typeof shaQuery.limit === 'function' ? await shaQuery.limit(1) : await shaQuery
      const { data: shaMatch, error: shaErr } = shaResult || {}

      if (!shaErr && shaMatch && shaMatch.length > 0) {
        const match = shaMatch[0]
        return {
          isDuplicate: true,
          type: 'exact',
          existingTransaction: match,
          reason: 'Esta mesma imagem de comprovante/nota já foi escaneada e cadastrada anteriormente.',
        }
      }
    } catch {
      // Ignore query errors in minimal mock environments
    }
  }

  // 1b. Check if installment_group_id was explicitly provided and already exists in database
  if (input.receipt.installment_group_id) {
    try {
      const grpQuery = supabase
        .from('transactions')
        .select('id, date, vendor, total, type, account_id, image_sha256, created_at')
        .eq('installment_group_id', input.receipt.installment_group_id)

      const grpResult = typeof grpQuery.limit === 'function' ? await grpQuery.limit(1) : await grpQuery
      const { data: grpMatch, error: grpErr } = grpResult || {}

      if (!grpErr && grpMatch && grpMatch.length > 0) {
        const match = grpMatch[0]
        return {
          isDuplicate: true,
          type: 'exact',
          existingTransaction: match,
          reason: 'Este grupo de parcelamento já foi cadastrado anteriormente.',
        }
      }
    } catch {
      // Ignore query errors in minimal mock environments
    }
  }

  // If no vendor or total is 0, we can't reliably detect duplicates beyond SHA
  if (!newVendorNorm || newTotal === 0) {
    return { isDuplicate: false, type: 'none' }
  }

  // 2. Query candidates by type and total within ±0.01 tolerance
  let candidates: any[] = []
  try {
    let query = supabase
      .from('transactions')
      .select('id, date, vendor, total, type, account_id, image_sha256, created_at, transaction_items(description, total, quantity)')
      .eq('type', newType)
      .gte('total', newTotal - 0.01)
      .lte('total', newTotal + 0.01)

    // If date is provided, filter by exact date or created_at date
    if (newDate && typeof query.or === 'function') {
      query = query.or(`date.eq.${newDate},and(date.is.null,created_at.gte.${newDate}T00:00:00.000Z,created_at.lte.${newDate}T23:59:59.999Z)`)
    }

    const res = await query
    if (res?.data) {
      candidates = res.data
    }
  } catch {
    return { isDuplicate: false, type: 'none' }
  }

  // Filter candidates whose vendor matches normalized
  const matchingCandidates = candidates.filter((cand: any) => {
    const candVendorNorm = normalizeVendor(cand.vendor)
    if (!candVendorNorm || !newVendorNorm) return false
    return (
      candVendorNorm === newVendorNorm ||
      candVendorNorm.includes(newVendorNorm) ||
      newVendorNorm.includes(candVendorNorm)
    )
  })

  if (matchingCandidates.length === 0) {
    return { isDuplicate: false, type: 'none' }
  }

  // Check each matching candidate
  for (const cand of matchingCandidates) {
    const candItems = cand.transaction_items || []
    const newItems = input.receipt.items || []

    const hasNewItems = newItems.length > 0
    const hasCandItems = candItems.length > 0

    // If both have items and all items match: EXACT DUPLICATE
    if (hasNewItems && hasCandItems && areItemsMatching(newItems, candItems)) {
      return {
        isDuplicate: true,
        type: 'exact',
        existingTransaction: {
          id: cand.id,
          date: cand.date,
          vendor: cand.vendor,
          total: Number(cand.total),
          type: cand.type,
          account_id: cand.account_id,
          image_sha256: cand.image_sha256,
          created_at: cand.created_at,
          items: candItems,
        },
        reason: `Lançamento idêntico já cadastrado em ${cand.date || cand.created_at?.slice(0, 10)} com os mesmos itens e valor no estabelecimento "${cand.vendor}".`,
      }
    }

    // If both have items and items are clearly different, it is a legitimate separate transaction (e.g. 2 different snacks at same shop)
    if (hasNewItems && hasCandItems && !areItemsMatching(newItems, candItems)) {
      // Items are different: not a duplicate
      continue
    }

    // If one or both lack item breakdowns, but have same vendor, date, total, and type -> PROBABLE DUPLICATE
    return {
      isDuplicate: true,
      type: 'probable',
      existingTransaction: {
        id: cand.id,
        date: cand.date,
        vendor: cand.vendor,
        total: Number(cand.total),
        type: cand.type,
        account_id: cand.account_id,
        image_sha256: cand.image_sha256,
        created_at: cand.created_at,
        items: candItems,
      },
      reason: `Já existe um lançamento similar de ${formatBRL(newTotal)} em "${cand.vendor}" na data ${cand.date || cand.created_at?.slice(0, 10)}.`,
    }
  }

  return { isDuplicate: false, type: 'none' }
}

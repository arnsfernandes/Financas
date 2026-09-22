import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import type { Receipt, StoredReceipt } from './schema'

export interface PersistInput {
  receipt: Receipt
  imageKey: string | null
  imageSha256: string | null
  sourceType?: 'image' | 'text'
}

let cachedSupabase: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    return null
  }

  if (!cachedSupabase) {
    cachedSupabase = createClient(url, key)
  }

  return cachedSupabase
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
 * If Supabase environment variables are not configured, it gracefully acts
 * as an in-memory generator preserving the existing pipeline behavior.
 */
export async function save(input: PersistInput): Promise<StoredReceipt> {
  const id = randomUUID()
  const scannedAt = new Date().toISOString()
  const sourceType = input.sourceType ?? (input.imageKey ? 'image' : 'text')
  const total = typeof input.receipt.total === 'number' ? input.receipt.total : 0

  const supabase = getSupabaseClient()

  if (supabase) {
    try {
      // 1. Insert transaction
      const { error: txError } = await supabase.from('transactions').insert({
        id,
        vendor: input.receipt.vendor,
        vendor_address: input.receipt.vendor_address,
        date: input.receipt.date || null,
        time: input.receipt.time || null,
        currency: input.receipt.currency || 'BRL',
        category: input.receipt.category || null,
        subtotal: input.receipt.subtotal,
        tax: input.receipt.tax,
        tip: input.receipt.tip,
        total,
        payment_method: input.receipt.payment_method,
        notes: input.receipt.notes,
        source_type: sourceType,
        image_key: input.imageKey,
        image_sha256: input.imageSha256,
        created_at: scannedAt,
      })

      if (txError) {
        console.error('Supabase transaction insert error:', txError)
      } else if (input.receipt.items && input.receipt.items.length > 0) {
        // 2. Insert items
        const itemsToInsert = input.receipt.items.map((item) => ({
          transaction_id: id,
          description: item.description,
          normalized_name: normalizeItemName(item.description),
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total,
          category: item.category || null,
        }))

        const { error: itemsError } = await supabase
          .from('transaction_items')
          .insert(itemsToInsert)

        if (itemsError) {
          console.error('Supabase transaction_items insert error:', itemsError)
        }
      }
    } catch (e) {
      console.error('Error executing Supabase persistence:', e)
    }
  }

  return {
    ...input.receipt,
    id,
    image_key: input.imageKey,
    image_sha256: input.imageSha256,
    scanned_at: scannedAt,
  }
}

/**
 * lib/categoryLearning.ts - User Category Learning & Preference Engine
 *
 * Implements deterministic learning from user categorization corrections and manual assignments.
 * Rules:
 * - Persisted in Supabase `category_learning` table.
 * - Normalized canonical vendor key is the primary identifier.
 * - Disambiguates generic/ambiguous vendors (e.g. marketplaces, department stores) using item/keyword when present.
 * - Overrides AI/parser category suggestion before the final review.
 * - Never alters past transactions retroactively; applies only to future launches.
 * - Reusable by both Web and Telegram workflows.
 */

import { getSupabaseClient } from './persist'
import { parseVendor, cleanVendorText, compactVendorText } from './canonicalVendor'
import { normalizeCategoryName } from './queries/categoryQueries'

export interface LearnedCategoryRule {
  id: string
  vendorKey: string
  vendorDisplay: string
  categoryId: string
  categoryName: string
  transactionType: 'expense' | 'income'
  source: 'user_correction' | 'user_creation'
  itemKeyword?: string | null
  correctionCount: number
  confidence: number
  updatedAt: string
}

export interface LearnCategoryInput {
  userId?: string | null
  vendor?: string | null
  categoryId?: string | null
  categoryName?: string | null
  transactionType?: 'expense' | 'income'
  itemKeyword?: string | null
  rawText?: string | null
  source?: 'user_correction' | 'user_creation'
}

/**
 * List of overly generic or ambiguous vendors where a pure vendor-level rule might cause false positives
 * unless disambiguated or confirmed with high confidence.
 */
const AMBIGUOUS_VENDORS = new Set([
  'amazon',
  'shopee',
  'mercadolivre',
  'magalu',
  'aliexpress',
  'americanas',
  'outros',
  'diversos',
  'pagamento',
  'pix',
  'transferencia',
])

/**
 * Extracts a normalized vendor key and safe disambiguation keyword.
 */
export function extractLearningKeys(
  vendor?: string | null,
  itemKeyword?: string | null,
  rawText?: string | null
): { vendorKey: string; vendorDisplay: string; safeKeyword: string | null; isAmbiguous: boolean } {
  const parsed = parseVendor(vendor || 'Outros')
  const baseKey = parsed.normalizedKey ? cleanVendorText(parsed.normalizedKey) : 'outros'
  const compact = compactVendorText(baseKey)
  const isAmbiguous = AMBIGUOUS_VENDORS.has(compact) || baseKey.length < 3

  let safeKeyword: string | null = null
  if (itemKeyword && itemKeyword.trim()) {
    const cleanKw = cleanVendorText(itemKeyword)
    if (cleanKw.length >= 3 && cleanKw !== baseKey) {
      safeKeyword = cleanKw
    }
  } else if (isAmbiguous && rawText) {
    // If vendor is ambiguous (e.g. Amazon, Shopee), try extracting a dominant keyword from raw text
    const cleanRaw = cleanVendorText(rawText)
    const words = cleanRaw.split(/\s+/).filter((w) => w.length >= 4 && !baseKey.includes(w))
    if (words.length > 0) {
      safeKeyword = words.slice(0, 2).join(' ')
    }
  }

  return {
    vendorKey: baseKey,
    vendorDisplay: parsed.canonicalName || vendor || 'Outros',
    safeKeyword,
    isAmbiguous,
  }
}

/**
 * Consults learned category preferences for a given vendor and context.
 * Returns the learned category (id and name) if a reliable rule exists.
 */
export async function getLearnedCategory(params: {
  userId?: string | null
  vendor?: string | null
  transactionType?: 'expense' | 'income'
  itemKeyword?: string | null
  rawText?: string | null
}): Promise<{ categoryId: string; categoryName: string; confidence: number; ruleId: string } | null> {
  const supabase = getSupabaseClient()
  if (!supabase || !params.vendor) {
    return null
  }

  const { vendorKey, safeKeyword, isAmbiguous } = extractLearningKeys(
    params.vendor,
    params.itemKeyword,
    params.rawText
  )

  const txType = params.transactionType || 'expense'

  // 1. First priority: Exact match with item_keyword (specific rule for ambiguous/item-based purchases)
  if (safeKeyword) {
    let kwQuery = supabase
      .from('category_learning')
      .select('id, category_id, category_name, confidence, correction_count')
      .eq('vendor_key', vendorKey)
      .eq('transaction_type', txType)
      .eq('item_keyword', safeKeyword)

    if (params.userId) {
      kwQuery = kwQuery.eq('user_id', params.userId)
    }

    const { data: keywordMatch } = await kwQuery.maybeSingle()

    if (keywordMatch && keywordMatch.category_id) {
      return {
        categoryId: keywordMatch.category_id,
        categoryName: keywordMatch.category_name,
        confidence: Number(keywordMatch.confidence) || 1.0,
        ruleId: keywordMatch.id,
      }
    }
  }

  // 2. Second priority: Vendor-level rule (item_keyword IS NULL)
  // For highly ambiguous vendors, only apply vendor-level rule if no specific keyword was provided
  let vendorQuery = supabase
    .from('category_learning')
    .select('id, category_id, category_name, confidence, correction_count, item_keyword')
    .eq('vendor_key', vendorKey)
    .eq('transaction_type', txType)
    .is('item_keyword', null)

  if (params.userId) {
    vendorQuery = vendorQuery.eq('user_id', params.userId)
  }

  const { data: vendorMatch } = await vendorQuery.maybeSingle()

  if (vendorMatch && vendorMatch.category_id) {
    // If it's an ambiguous vendor but we have a learned preference, verify minimum confidence
    if (isAmbiguous && (vendorMatch.correction_count || 1) < 1) {
      return null
    }

    return {
      categoryId: vendorMatch.category_id,
      categoryName: vendorMatch.category_name,
      confidence: Number(vendorMatch.confidence) || 1.0,
      ruleId: vendorMatch.id,
    }
  }

  return null
}

/**
 * Saves or updates a learned category preference when a user creates or corrects a category.
 * Idempotent: updates existing rule for the vendor/context or creates a new one.
 */
export async function learnCategoryPreference(
  input: LearnCategoryInput
): Promise<{ ok: boolean; ruleId?: string; error?: string }> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: false, error: 'Database unavailable' }
  }

  if (!input.vendor || !input.vendor.trim()) {
    return { ok: false, error: 'Vendor is required for category learning' }
  }

  if (!input.categoryId && !input.categoryName) {
    return { ok: false, error: 'Category is required for category learning' }
  }

  // Resolve category details
  let resolvedCategoryId = input.categoryId || null
  let resolvedCategoryName = input.categoryName || ''

  if (!resolvedCategoryId && input.categoryName) {
    const norm = normalizeCategoryName(input.categoryName)
    const { data: cat } = await supabase
      .from('categories')
      .select('id, name')
      .or(`normalized_name.eq.${norm},name.ilike.${input.categoryName.trim()}`)
      .maybeSingle()

    if (cat) {
      resolvedCategoryId = cat.id
      resolvedCategoryName = cat.name
    }
  } else if (resolvedCategoryId && !resolvedCategoryName) {
    const { data: cat } = await supabase
      .from('categories')
      .select('id, name')
      .eq('id', resolvedCategoryId)
      .maybeSingle()

    if (cat) {
      resolvedCategoryName = cat.name
    }
  }

  if (!resolvedCategoryId) {
    return { ok: false, error: 'Valid category not found' }
  }

  const { vendorKey, vendorDisplay, safeKeyword } = extractLearningKeys(
    input.vendor,
    input.itemKeyword,
    input.rawText
  )

  const txType = input.transactionType || 'expense'
  const source = input.source || 'user_correction'
  const userId = input.userId || 'bc5a76de-8865-4ec3-b7d5-5dfbfb8123a6'

  try {
    // Check if a rule already exists for this vendor + type + keyword + user_id
    let query = supabase
      .from('category_learning')
      .select('id, correction_count, category_id')
      .eq('user_id', userId)
      .eq('vendor_key', vendorKey)
      .eq('transaction_type', txType)

    if (safeKeyword) {
      query = query.eq('item_keyword', safeKeyword)
    } else {
      query = query.is('item_keyword', null)
    }

    const { data: existing } = await query.maybeSingle()

    if (existing) {
      const isSameCategory = existing.category_id === resolvedCategoryId
      const newCount = isSameCategory ? (existing.correction_count || 1) + 1 : (existing.correction_count || 1) + 1

      const { data: updated, error: updateErr } = await supabase
        .from('category_learning')
        .update({
          category_id: resolvedCategoryId,
          category_name: resolvedCategoryName,
          vendor_display: vendorDisplay,
          source,
          correction_count: newCount,
          confidence: 1.00,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('id')
        .single()

      if (updateErr) {
        console.error('Error updating learned category:', updateErr)
        return { ok: false, error: updateErr.message }
      }

      return { ok: true, ruleId: updated.id }
    } else {
      // Insert new rule
      const { data: created, error: insertErr } = await supabase
        .from('category_learning')
        .insert({
          user_id: userId,
          vendor_key: vendorKey,
          vendor_display: vendorDisplay,
          category_id: resolvedCategoryId,
          category_name: resolvedCategoryName,
          transaction_type: txType,
          source,
          item_keyword: safeKeyword || null,
          correction_count: 1,
          confidence: 1.00,
        })
        .select('id')
        .single()

      if (insertErr) {
        console.error('Error inserting learned category:', insertErr)
        return { ok: false, error: insertErr.message }
      }

      return { ok: true, ruleId: created.id }
    }
  } catch (err: any) {
    console.error('Failed to learn category preference:', err)
    return { ok: false, error: err.message || 'Learning error' }
  }
}

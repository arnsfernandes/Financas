import { z } from 'zod'

/**
 * The Zod contract every expense/receipt scan must satisfy before it reaches
 * the UI, an export, or a database. This schema is also handed to the OpenAI model
 * as structured outputs.
 */
export const accountTypeSchema = z.enum([
  'bank_account',
  'cash',
  'credit_card',
  'debit_card',
  'digital_wallet',
  'other',
])

export type AccountType = z.infer<typeof accountTypeSchema>

export const accountSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: accountTypeSchema,
  institution: z.string().nullable().optional(),
  active: z.boolean().default(true),
  created_at: z.string().optional(),
  closing_day: z.number().int().min(1).max(31).nullable().optional(),
  due_day: z.number().int().min(1).max(31).nullable().optional(),
  custom_logo: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  skin: z.string().nullable().optional(),
})

export type Account = z.infer<typeof accountSchema>

export const categorySchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Nome da categoria é obrigatório'),
  normalized_name: z.string().optional(),
  type: z.enum(['expense', 'income']),
  icon: z.string().default('Tag'),
  color: z.string().default('#2F68FE'),
  is_system: z.boolean().default(false),
  active: z.boolean().default(true),
  sort_order: z.number().default(0),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
})

export type Category = z.infer<typeof categorySchema>

export const lineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().nullable(),
  unit_price: z.number().nullable(),
  total: z.number().nullable(),
  category: z.string().nullable().optional(),
})

export const receiptSchema = z.object({
  type: z.enum(['expense', 'income']).default('expense'),
  account_id: z.string().nullable().optional(),
  category_id: z.string().nullable().optional(),
  vendor: z.string().nullable(),
  vendor_address: z.string().nullable(),
  date: z.string().nullable(),
  time: z.string().nullable(),
  currency: z.string().nullable(),
  category: z.string().nullable().optional(),
  items: z.array(lineItemSchema),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  tip: z.number().nullable(),
  total: z.number().nullable(),
  payment_method: z.string().nullable(),
  notes: z.string().nullable(),
  // Recurrence
  is_recurring: z.boolean().default(false).optional(),
  recurrence_frequency: z.enum(['monthly', 'weekly', 'yearly']).nullable().optional(),
  recurrence_next_date: z.string().nullable().optional(),
  recurrence_status: z.enum(['active', 'ended']).default('active').optional(),
  recurrence_parent_id: z.string().nullable().optional(),
  recurrence_cycle_date: z.string().nullable().optional(),
  // Installments
  installment_group_id: z.string().nullable().optional(),
  installment_current: z.number().nullable().optional(),
  installment_total: z.number().nullable().optional(),
  installment_amount: z.number().nullable().optional(),
  installment_date_anchor: z.enum(['purchase_date', 'current_installment']).default('purchase_date').optional().nullable(),
  // Review Status
  review_status: z.enum(['confirmed', 'needs_review']).default('confirmed').optional(),
  review_reasons: z.array(z.string()).default([]).optional(),
  // Provenance & Traceability
  origin_type: z.enum(['text', 'image', 'manual']).default('image').optional(),
  raw_text: z.string().nullable().optional(),
  original_filename: z.string().nullable().optional(),
  captured_at: z.string().optional(),
  original_extracted_data: z.record(z.any()).nullable().optional(),
})

export type LineItem = z.infer<typeof lineItemSchema>
export type Receipt = z.infer<typeof receiptSchema>

/**
 * A receipt enriched with the metadata the pipeline attaches around the scan
 * itself: the storage key of the original image, the content hash used for
 * deduplication, and the id assigned on persistence.
 */
export const storedReceiptSchema = receiptSchema.extend({
  id: z.string(),
  category_id: z.string().nullable().optional(),
  image_key: z.string().nullable(),
  image_sha256: z.string().nullable(),
  scanned_at: z.string(),
  origin_type: z.enum(['text', 'image', 'manual']).default('image'),
  raw_text: z.string().nullable().optional(),
  original_filename: z.string().nullable().optional(),
  captured_at: z.string().optional(),
  original_extracted_data: z.record(z.any()).nullable().optional(),
  review_status: z.enum(['confirmed', 'needs_review']).default('confirmed'),
  review_reasons: z.array(z.string()).default([]),
})

export type StoredReceipt = z.infer<typeof storedReceiptSchema>

export interface TransactionItem {
  id?: string
  transaction_id?: string
  description: string
  normalized_name?: string
  quantity: number | null
  unit_price: number | null
  total: number | null
  category?: string | null
  product_id?: string | null
  canonical_products?: {
    id: string
    canonical_name: string
    brand?: string | null
    unit_size?: string | null
  } | null
}

export interface TransactionRecord {
  id: string
  type?: 'expense' | 'income'
  account_id?: string | null
  accounts?: Account | null
  vendor: string | null
  vendor_address: string | null
  date: string | null
  time: string | null
  currency: string
  category: string | null
  category_id?: string | null
  categories?: {
    id: string
    name: string
    icon?: string | null
    color?: string | null
  } | null
  subtotal: number | null
  tax: number | null
  tip: number | null
  total: number
  payment_method: string | null
  notes: string | null
  source_type: string
  origin_type?: 'text' | 'image' | 'manual' | null
  raw_text?: string | null
  original_filename?: string | null
  image_sha256?: string | null
  captured_at?: string | null
  original_extracted_data?: Record<string, any> | null
  is_recurring?: boolean
  recurrence_frequency?: string | null
  recurrence_next_date?: string | null
  recurrence_status?: 'active' | 'ended'
  installment_group_id?: string | null
  installment_current?: number | null
  installment_total?: number | null
  installment_amount?: number | null
  review_status?: 'confirmed' | 'needs_review'
  review_reasons?: string[]
  vendor_id?: string | null
  canonical_vendors?: {
    id: string
    canonical_name: string
    normalized_key?: string | null
  } | null
  created_at: string
  transaction_items?: TransactionItem[]
}

/**
 * Fill in the nullable fields so downstream code can rely on a complete shape.
 * The vision/language model is asked for every field, but I never assume it returned
 * them; this gives the rest of the app a single, total `Receipt`.
 */
export function normaliseReceipt(input: unknown): Receipt {
  const parsed = receiptSchema.parse(input)

  return {
    ...parsed,
    type: parsed.type === 'income' ? 'income' : 'expense',
    date: parsed.date ?? null,
    account_id: parsed.account_id ?? null,
    category_id: parsed.category_id ?? null,
    category: parsed.category ?? null,
    is_recurring: parsed.is_recurring ?? false,
    recurrence_frequency: parsed.recurrence_frequency ?? null,
    recurrence_next_date: parsed.recurrence_next_date ?? null,
    recurrence_status: parsed.recurrence_status ?? 'active',
    recurrence_parent_id: parsed.recurrence_parent_id ?? null,
    recurrence_cycle_date: parsed.recurrence_cycle_date ?? null,
    installment_group_id: parsed.installment_group_id ?? null,
    installment_current: parsed.installment_current ?? null,
    installment_total: parsed.installment_total ?? null,
    installment_amount: parsed.installment_amount ?? null,
    installment_date_anchor: parsed.installment_date_anchor ?? 'purchase_date',
    review_status: parsed.review_status ?? 'confirmed',
    review_reasons: parsed.review_reasons ?? [],
    items: (parsed.items ?? []).map((item) => {
      const netTotal = typeof item.total === 'number' ? item.total : null
      const quantity = typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1
      
      // Compute effective_unit_price = net_total / quantity
      let effectiveUnitPrice: number | null = item.unit_price ?? null
      if (netTotal !== null && quantity > 0) {
        effectiveUnitPrice = Number((netTotal / quantity).toFixed(4))
      }

      return {
        ...item,
        quantity,
        total: netTotal,
        unit_price: effectiveUnitPrice,
        category: item.category ?? null,
      }
    }),
  }
}

export interface InvoicePayment {
  id: string
  invoice_id: string
  amount: number
  payment_date: string
  payment_method?: string | null
  from_account_id?: string | null
  notes?: string | null
  created_at: string
}

export interface CreditCardInvoice {
  id: string
  account_id: string
  closing_date: string
  due_date: string
  total_amount: number
  paid_amount: number
  status: 'open' | 'partial' | 'paid'
  notes?: string | null
  created_at: string
  updated_at: string
  payments?: InvoicePayment[]
}


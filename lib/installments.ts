import { addMonthsToDate } from './dateUtils'

/**
 * Generates an isomorphic UUID (RFC 4122 compliant).
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Domain module for installments (parcelamento).
 * Single source of truth for:
 * - parsing installment text (e.g. "3x", "parcelado em 4x")
 * - calculating total purchase amount vs individual installment amount
 * - assigning installment_group_id
 * - computing installment dates across months
 * - creating and updating installment rows across the database
 */

export interface InstallmentPlanInput {
  total: number
  installmentTotal?: number | null
  installmentCurrent?: number | null
  installmentAmount?: number | null
  subtotal?: number | null // Total purchase amount (subtotal)
  installmentGroupId?: string | null
  notes?: string | null
  vendor?: string | null
  rawText?: string | null
  existingTx?: {
    total?: number | null
    subtotal?: number | null
    installment_total?: number | null
    installment_current?: number | null
    installment_amount?: number | null
    installment_group_id?: string | null
    notes?: string | null
    raw_text?: string | null
  } | null
}

export interface InstallmentPlanResult {
  isMultiInstallment: boolean
  installmentTotal: number | null
  installmentCurrent: number | null
  installmentAmount: number | null
  totalPurchaseAmount: number | null
  installmentGroupId: string | null
}

/**
 * Parses installment count from text (e.g. "parcelado em 4x", "12x no cartão").
 */
export function parseInstallmentFromText(text?: string | null): { total: number; current: number } | null {
  if (!text) return null

  const m1 = text.match(/(?:parcelad[oa]\s+em\s+|em\s+)(\d+)\s*(?:x|vezes)/i)
  if (m1) {
    const val = parseInt(m1[1], 10)
    if (val > 1) return { total: val, current: 1 }
  }

  const m2 = text.match(/\b(\d+)\s*x\s*(?:no\s+cart[aã]o|sem\s+juros)?\b/i)
  if (m2) {
    const val = parseInt(m2[1], 10)
    if (val > 1 && val <= 96) return { total: val, current: 1 }
  }

  return null
}

/**
 * Resolves the single, definitive rule for installment amounts and purchase subtotal:
 * - If total already represents the individual installment value, DO NOT divide again.
 * - The total purchase amount (subtotal) remains separated from the installment value.
 * - Example: R$ 480 in 4x produces 4 installments of R$ 120 and subtotal of R$ 480.
 * - Example: R$ 300 in 3x produces 3 installments of R$ 100 and subtotal of R$ 300.
 */
export function resolveInstallmentPlan(input: InstallmentPlanInput): InstallmentPlanResult {
  let totalInstallments = input.installmentTotal && input.installmentTotal > 1 ? input.installmentTotal : null

  // Fallback text check if not explicitly provided
  if (!totalInstallments) {
    const textToCheck = `${input.notes || ''} ${input.vendor || ''} ${input.rawText || ''} ${input.existingTx?.notes || ''} ${input.existingTx?.raw_text || ''}`
    const parsed = parseInstallmentFromText(textToCheck)
    if (parsed && !input.existingTx?.installment_group_id) {
      totalInstallments = parsed.total
    }
  }

  const isMultiInstallment = typeof totalInstallments === 'number' && totalInstallments > 1

  if (!isMultiInstallment) {
    const current = input.installmentCurrent ?? input.existingTx?.installment_current ?? null
    const existingGroupId = input.installmentGroupId || input.existingTx?.installment_group_id || null
    return {
      isMultiInstallment: false,
      installmentTotal: null,
      installmentCurrent: current,
      installmentAmount: null,
      totalPurchaseAmount: input.subtotal ?? (input.total > 0 ? input.total : null),
      installmentGroupId: existingGroupId,
    }
  }

  const safeTotalInstallments = totalInstallments!
  const currentInstallment = input.installmentCurrent ?? input.existingTx?.installment_current ?? 1
  const groupId = input.installmentGroupId || input.existingTx?.installment_group_id || generateUUID()

  const providedTotal = input.total !== undefined && !isNaN(input.total)
    ? input.total
    : (input.existingTx?.total ? Number(input.existingTx.total) : 0)

  let totalPurchaseAmount: number | null = input.subtotal !== undefined && input.subtotal !== null
    ? input.subtotal
    : (input.existingTx?.subtotal ? Number(input.existingTx.subtotal) : null)

  const hasExplicitInstallmentAmount = typeof input.installmentAmount === 'number' && input.installmentAmount > 0
  const matchesExistingInstallment = Boolean(
    input.existingTx?.installment_amount &&
    Math.abs(providedTotal - Number(input.existingTx.installment_amount)) < 0.01
  )
  const matchesExistingGroupTotal = Boolean(
    input.existingTx?.installment_total &&
    input.existingTx.installment_total > 1 &&
    Math.abs(providedTotal - Number(input.existingTx.total)) < 0.01
  )
  const matchesPurchaseSubtotal = Boolean(
    totalPurchaseAmount !== null &&
    (
      Math.abs(providedTotal * safeTotalInstallments - totalPurchaseAmount) < 0.05 ||
      (providedTotal < totalPurchaseAmount && totalPurchaseAmount > 0)
    )
  )

  let instAmount: number

  if (hasExplicitInstallmentAmount || matchesExistingInstallment || matchesExistingGroupTotal || matchesPurchaseSubtotal) {
    // Total already represents the individual installment value: do NOT divide again!
    instAmount = hasExplicitInstallmentAmount
      ? Number(input.installmentAmount!.toFixed(2))
      : Number(providedTotal.toFixed(2))

    if (!totalPurchaseAmount) {
      totalPurchaseAmount = Number((instAmount * safeTotalInstallments).toFixed(2))
    }
  } else if (providedTotal > 0) {
    // Total represents the total purchase amount: divide by number of installments
    instAmount = Number((providedTotal / safeTotalInstallments).toFixed(2))
    totalPurchaseAmount = Number(providedTotal.toFixed(2))
  } else {
    instAmount = 0
    if (!totalPurchaseAmount) totalPurchaseAmount = 0
  }

  return {
    isMultiInstallment: true,
    installmentTotal: safeTotalInstallments,
    installmentCurrent: currentInstallment,
    installmentAmount: instAmount,
    totalPurchaseAmount,
    installmentGroupId: groupId,
  }
}

/**
 * Computes chronological monthly dates for all installments in a plan.
 */
export function generateInstallmentDates(
  baseDate: string,
  totalInstallments: number,
  currentInstallment: number = 1
): { installmentCurrent: number; date: string }[] {
  const result: { installmentCurrent: number; date: string }[] = []
  for (let i = 1; i <= totalInstallments; i++) {
    result.push({
      installmentCurrent: i,
      date: addMonthsToDate(baseDate, i - currentInstallment),
    })
  }
  return result
}

export interface BaseInstallmentRowTemplate {
  account_id?: string | null
  category_id?: string | null
  vendor_id?: string | null
  type?: string
  vendor?: string | null
  vendor_address?: string | null
  time?: string | null
  currency?: string
  category?: string | null
  payment_method?: string | null
  notes?: string | null
  source_type?: string
  image_key?: string | null
  image_sha256?: string | null
  origin_type?: string
  raw_text?: string | null
  original_filename?: string | null
  captured_at?: string | null
  original_extracted_data?: any
  review_status?: string
  review_reasons?: string[]
  created_at?: string
}

/**
 * Builds all future transaction rows (installments 2..N) for persistence.
 */
export function buildFutureInstallmentRows(
  template: BaseInstallmentRowTemplate,
  plan: InstallmentPlanResult,
  baseDate: string
): any[] {
  if (!plan.isMultiInstallment || !plan.installmentTotal || !plan.installmentGroupId) {
    return []
  }

  const rows: any[] = []
  const dates = generateInstallmentDates(baseDate, plan.installmentTotal, plan.installmentCurrent || 1)

  for (const { installmentCurrent, date } of dates) {
    if (installmentCurrent === (plan.installmentCurrent || 1)) continue

    rows.push({
      id: generateUUID(),
      account_id: template.account_id || null,
      category_id: template.category_id || null,
      vendor_id: template.vendor_id || null,
      type: template.type || 'expense',
      vendor: template.vendor || null,
      vendor_address: template.vendor_address || null,
      date,
      time: template.time || null,
      currency: template.currency || 'BRL',
      category: template.category || null,
      subtotal: plan.totalPurchaseAmount,
      tax: null,
      tip: null,
      total: plan.installmentAmount,
      payment_method: template.payment_method || null,
      notes: template.notes || null,
      source_type: template.source_type || 'manual',
      image_key: template.image_key || null,
      image_sha256: template.image_sha256 || null,
      origin_type: template.origin_type || 'manual',
      raw_text: template.raw_text || null,
      original_filename: template.original_filename || null,
      captured_at: template.captured_at || null,
      original_extracted_data: template.original_extracted_data || null,
      is_recurring: false,
      recurrence_frequency: null,
      recurrence_next_date: null,
      recurrence_status: 'active',
      installment_group_id: plan.installmentGroupId,
      installment_current: installmentCurrent,
      installment_total: plan.installmentTotal,
      installment_amount: plan.installmentAmount,
      review_status: template.review_status || 'confirmed',
      review_reasons: template.review_reasons || [],
      created_at: template.created_at || new Date().toISOString(),
    })
  }

  return rows
}

export interface SharedInstallmentFields {
  account_id?: string | null
  category_id?: string | null
  vendor_id?: string | null
  vendor?: string | null
  vendor_address?: string | null
  category?: string | null
  payment_method?: string | null
  type?: string
  time?: string | null
  currency?: string
  notes?: string | null
  review_status?: string
  review_reasons?: string[]
  created_at?: string
}

/**
 * Synchronizes sibling installments in the database when a transaction in a group is updated.
 */
export async function syncInstallmentGroup(
  supabase: any,
  currentTxId: string,
  plan: InstallmentPlanResult,
  baseDate: string,
  shared: SharedInstallmentFields
): Promise<void> {
  if (!plan.isMultiInstallment || !plan.installmentTotal || !plan.installmentGroupId) {
    return
  }

  const groupId = plan.installmentGroupId
  const totalInstallments = plan.installmentTotal
  const currentInstallment = plan.installmentCurrent || 1

  let existingGroupRows: any[] = []
  try {
    const { data: gRows } = await supabase
      .from('transactions')
      .select('id, installment_current, date')
      .eq('installment_group_id', groupId)
    existingGroupRows = gRows || []
  } catch {
    // ignore
  }

  const existingRowsByCurrent = new Map<number, any>()
  for (const row of existingGroupRows) {
    if (row.id !== currentTxId && row.installment_current) {
      existingRowsByCurrent.set(row.installment_current, row)
    }
  }

  const dates = generateInstallmentDates(baseDate, totalInstallments, currentInstallment)
  const rowsToInsert: any[] = []

  for (const { installmentCurrent: instNum, date: instDate } of dates) {
    if (instNum === currentInstallment) continue

    const existingRow = existingRowsByCurrent.get(instNum)

    if (existingRow) {
      await supabase
        .from('transactions')
        .update({
          account_id: shared.account_id,
          category_id: shared.category_id,
          payment_method: shared.payment_method,
          vendor_id: shared.vendor_id,
          vendor: shared.vendor,
          category: shared.category,
          type: shared.type || 'expense',
          total: plan.installmentAmount,
          installment_amount: plan.installmentAmount,
          subtotal: plan.totalPurchaseAmount,
          installment_total: totalInstallments,
          installment_current: instNum,
          installment_group_id: groupId,
          notes: shared.notes,
        })
        .eq('id', existingRow.id)
    } else {
      rowsToInsert.push({
        id: generateUUID(),
        account_id: shared.account_id || null,
        category_id: shared.category_id || null,
        payment_method: shared.payment_method || null,
        vendor_id: shared.vendor_id || null,
        vendor: shared.vendor || null,
        vendor_address: shared.vendor_address || null,
        type: shared.type || 'expense',
        date: instDate,
        time: shared.time || null,
        currency: shared.currency || 'BRL',
        category: shared.category || null,
        subtotal: plan.totalPurchaseAmount,
        tax: null,
        tip: null,
        total: plan.installmentAmount,
        installment_amount: plan.installmentAmount,
        installment_group_id: groupId,
        installment_current: instNum,
        installment_total: totalInstallments,
        notes: shared.notes || null,
        review_status: shared.review_status || 'confirmed',
        review_reasons: shared.review_reasons || [],
        is_recurring: false,
        recurrence_status: 'active',
        created_at: shared.created_at || new Date().toISOString(),
      })
    }
  }

  if (rowsToInsert.length > 0 && typeof supabase.from('transactions').insert === 'function') {
    await supabase.from('transactions').insert(rowsToInsert)
  }

  if (typeof supabase.from('transactions').delete === 'function') {
    for (const [currNum, row] of existingRowsByCurrent.entries()) {
      if (currNum > totalInstallments) {
        await supabase.from('transactions').delete().eq('id', row.id)
      }
    }
  }
}

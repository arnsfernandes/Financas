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

export type InstallmentDateAnchor = 'purchase_date' | 'current_installment'

export interface InstallmentPlanInput {
  total: number
  installmentTotal?: number | null
  installmentCurrent?: number | null
  installmentAmount?: number | null
  subtotal?: number | null // Total purchase amount (subtotal)
  installmentGroupId?: string | null
  installmentDateAnchor?: InstallmentDateAnchor | null
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
    installment_date_anchor?: InstallmentDateAnchor | null
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
  installmentDateAnchor: InstallmentDateAnchor
}

/**
 * Parses installment count from text (e.g. "parcelado em 4x", "12x no cartão", "parcela 4/6", "4 de 6").
 */
export function parseInstallmentFromText(
  text?: string | null
): { total: number; current: number; anchor?: InstallmentDateAnchor } | null {
  if (!text) return null

  // Mask full dates (e.g. 26/06/2026 or 26/06/26) so they are not misparsed as fractions
  const sanitized = text.replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, ' ')

  // Check purchase vs current installment anchor indicators
  const isPurchaseAnchor = /\b(primeira\s+parcela|1[aªº]\s+parcela|parcela\s+1\b|compra(?:\s+(?:feita|realizada))?\s*(?:em\b|no\s+dia\b|:|\/|\d{1,2}[/-]\d{1,2})|comprad[oa]\s+em|data\s+da\s+compra|in[ií]cio\s+em|iniciando\s+em|come[cç]ou\s+em|a\s+partir\s+de|primeira\s+parcela\/compra|compra\/primeira\s+parcela)\b/i.test(text) ||
    /\b1\s*(?:\/|\s+de\s+)\d{1,2}\s*(?:em|no\s+dia|:)\b/i.test(text)
  const isExplicitCurrentAnchor = /\b(data\s+da\s+parcela\s+atual|vencimento\s+(?:da\s+parcela\s+atual|atual)|fatura\s+atual\s*(?:em|no\s+dia|de)|parcela\s+atual\s*(?:em|no\s+dia|do\s+dia|de)\s+\d{1,2}[/-]\d{1,2})\b/i.test(text)

  // Canonical rule: date represents purchase/1st installment date by default.
  // Only calculate backwards when current_installment is explicitly indicated.
  let anchor: InstallmentDateAnchor = 'purchase_date'
  if (isExplicitCurrentAnchor && !isPurchaseAnchor) {
    anchor = 'current_installment'
  }

  // e.g. "parcela 4/6", "4/6", "parcela 4 de 6", "4 de 6", "atual 4/4", "parcela atual 4/4"
  const mFraction = sanitized.match(/\b(?:parcela\s+|atual\s+|parcela\s+atual\s+)?(\d{1,2})\s*(?:\/|\s+de\s+)(\d{1,2})\b/i)
  if (mFraction) {
    const curr = parseInt(mFraction[1], 10)
    const tot = parseInt(mFraction[2], 10)
    if (tot > 1 && curr >= 1 && curr <= tot) {
      return {
        total: tot,
        current: curr,
        anchor,
      }
    }
  }

  const m1 = sanitized.match(/(?:parcelad[oa]\s+em\s+|em\s+)(\d+)\s*(?:x|vezes)/i)
  if (m1) {
    const val = parseInt(m1[1], 10)
    if (val > 1) {
      return { total: val, current: 1, anchor: 'purchase_date' }
    }
  }

  const m2 = sanitized.match(/\b(\d+)\s*x\s*(?:no\s+cart[aã]o|sem\s+juros)?\b/i)
  if (m2) {
    const val = parseInt(m2[1], 10)
    if (val > 1 && val <= 96) {
      return { total: val, current: 1, anchor: 'purchase_date' }
    }
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
  let currentInstallment = input.installmentCurrent ?? input.existingTx?.installment_current ?? null
  let detectedAnchor: InstallmentDateAnchor | null =
    input.installmentDateAnchor || (input.existingTx as any)?.installment_date_anchor || null

  const textToCheck = `${input.notes || ''} ${input.vendor || ''} ${input.rawText || ''} ${input.existingTx?.notes || ''} ${input.existingTx?.raw_text || ''}`

  // Check text for installments and anchor
  const parsed = parseInstallmentFromText(textToCheck)
  if (parsed) {
    if (!totalInstallments && !input.existingTx?.installment_group_id) {
      totalInstallments = parsed.total
    }
    if (!currentInstallment && !input.existingTx?.installment_current) {
      currentInstallment = parsed.current
    }
    if (!detectedAnchor && parsed.anchor) {
      detectedAnchor = parsed.anchor
    }
  }

  if (!detectedAnchor) {
    const isPurchaseAnchor = /\b(primeira\s+parcela|1[aªº]\s+parcela|parcela\s+1\b|compra(?:\s+(?:feita|realizada))?\s*(?:em\b|no\s+dia\b|:|\/|\d{1,2}[/-]\d{1,2})|comprad[oa]\s+em|data\s+da\s+compra|in[ií]cio\s+em|iniciando\s+em|come[cç]ou\s+em|a\s+partir\s+de|primeira\s+parcela\/compra|compra\/primeira\s+parcela)\b/i.test(textToCheck) ||
      /\b1\s*(?:\/|\s+de\s+)\d{1,2}\s*(?:em|no\s+dia|:)\b/i.test(textToCheck)
    const isExplicitCurrentAnchor = /\b(data\s+da\s+parcela\s+atual|vencimento\s+(?:da\s+parcela\s+atual|atual)|fatura\s+atual\s*(?:em|no\s+dia|de)|parcela\s+atual\s*(?:em|no\s+dia|do\s+dia|de)\s+\d{1,2}[/-]\d{1,2})\b/i.test(textToCheck)

    if (isExplicitCurrentAnchor && !isPurchaseAnchor) {
      detectedAnchor = 'current_installment'
    } else {
      detectedAnchor = 'purchase_date'
    }
  }

  const isMultiInstallment = typeof totalInstallments === 'number' && totalInstallments > 1

  const safeCurrent = currentInstallment ?? 1
  // Canonical rule: absent, null, undefined or ambiguous anchor is always purchase_date.
  // Only explicitly set current_installment calculates backward.
  const effectiveAnchor: InstallmentDateAnchor =
    (input.installmentDateAnchor === 'current_installment' || detectedAnchor === 'current_installment')
      ? 'current_installment'
      : 'purchase_date'

  if (!isMultiInstallment) {
    const existingGroupId = input.installmentGroupId || input.existingTx?.installment_group_id || null
    return {
      isMultiInstallment: false,
      installmentTotal: null,
      installmentCurrent: currentInstallment,
      installmentAmount: null,
      totalPurchaseAmount: input.subtotal ?? (input.total > 0 ? input.total : null),
      installmentGroupId: existingGroupId,
      installmentDateAnchor: effectiveAnchor,
    }
  }

  const safeTotalInstallments = totalInstallments!
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
    installmentCurrent: safeCurrent,
    installmentAmount: instAmount,
    totalPurchaseAmount,
    installmentGroupId: groupId,
    installmentDateAnchor: effectiveAnchor,
  }
}

/**
 * Computes chronological monthly dates for all installments in a plan.
 * Supports explicit anchor semantics:
 * - 'purchase_date': baseDate is the 1st installment date (purchase date), so date_i = baseDate + (i - 1) months.
 * - 'current_installment': baseDate is installment currentInstallment date, so purchaseDate = baseDate - (current - 1) months and date_i = purchaseDate + (i - 1) months.
 */
export function generateInstallmentDates(
  baseDate: string,
  totalInstallments: number,
  currentInstallment: number = 1,
  anchor: InstallmentDateAnchor | null = 'purchase_date'
): { installmentCurrent: number; date: string }[] {
  const result: { installmentCurrent: number; date: string }[] = []

  // Only an explicit current-installment anchor may move the date backward.
  const purchaseDate = anchor === 'current_installment'
    ? addMonthsToDate(baseDate, -(currentInstallment - 1))
    : baseDate

  for (let i = 1; i <= totalInstallments; i++) {
    result.push({
      installmentCurrent: i,
      date: addMonthsToDate(purchaseDate, i - 1),
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
 * Builds all sibling transaction rows (installments != current) for persistence.
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
  const dates = generateInstallmentDates(
    baseDate,
    plan.installmentTotal,
    plan.installmentCurrent || 1,
    plan.installmentDateAnchor
  )

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

  const dates = generateInstallmentDates(baseDate, totalInstallments, currentInstallment, plan.installmentDateAnchor)
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

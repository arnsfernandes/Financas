import type { SupabaseClient } from '@supabase/supabase-js'
import { computeNextRecurrenceDate, getEffectiveDate } from './dateUtils'
import { generateUUID } from './installments'

export { computeNextRecurrenceDate, getEffectiveDate }

export type RecurrenceFrequency = 'monthly' | 'weekly' | 'yearly'

/**
 * Normalizes recurrence frequency to supported values, defaulting to 'monthly'.
 */
export function resolveRecurrenceFrequency(freq?: string | null): RecurrenceFrequency {
  if (freq === 'weekly' || freq === 'yearly' || freq === 'monthly') {
    return freq
  }
  return 'monthly'
}

/**
 * Resolves the next recurrence date given the base date and frequency.
 */
export function resolveRecurrenceNextDate(
  baseDate: string,
  frequency: RecurrenceFrequency = 'monthly',
  explicitNextDate?: string | null
): string {
  if (explicitNextDate && explicitNextDate.trim()) {
    return explicitNextDate.trim().slice(0, 10)
  }
  return computeNextRecurrenceDate(baseDate, frequency)
}

export interface RecurrenceUpdateInput {
  is_recurring?: boolean | null
  recurrence_frequency?: 'monthly' | 'weekly' | 'yearly' | string | null
  recurrence_next_date?: string | null
  recurrence_status?: 'active' | 'ended' | string | null
  date?: string | null
  existingTx?: {
    date?: string | null
    is_recurring?: boolean | null
    recurrence_frequency?: string | null
    recurrence_next_date?: string | null
    recurrence_status?: string | null
  } | null
}

export interface RecurrenceUpdateResult {
  is_recurring: boolean
  recurrence_frequency: RecurrenceFrequency | null
  recurrence_next_date: string | null
  recurrence_status: 'active' | 'ended'
}

/**
 * Resolves recurrence fields when saving or editing transactions.
 * Single rule of truth for frequency, next date, and status.
 */
export function resolveRecurrenceUpdate(input: RecurrenceUpdateInput): RecurrenceUpdateResult {
  const isRecurring = input.is_recurring !== undefined
    ? Boolean(input.is_recurring)
    : Boolean(input.existingTx?.is_recurring)

  if (!isRecurring) {
    return {
      is_recurring: false,
      recurrence_frequency: null,
      recurrence_next_date: null,
      recurrence_status: (input.recurrence_status as 'active' | 'ended') || 'active',
    }
  }

  const frequency = resolveRecurrenceFrequency(
    input.recurrence_frequency !== undefined
      ? input.recurrence_frequency
      : input.existingTx?.recurrence_frequency
  )

  const status: 'active' | 'ended' = (
    input.recurrence_status !== undefined
      ? input.recurrence_status
      : (input.existingTx?.recurrence_status || 'active')
  ) as 'active' | 'ended'

  const baseDate = input.date || input.existingTx?.date || new Date().toISOString().slice(0, 10)

  let nextDate: string | null = null
  if (input.recurrence_next_date !== undefined) {
    nextDate = input.recurrence_next_date ? input.recurrence_next_date.trim() : null
  } else {
    nextDate = input.existingTx?.recurrence_next_date || null
  }

  if (!nextDate && status === 'active') {
    nextDate = computeNextRecurrenceDate(baseDate, frequency)
  }

  return {
    is_recurring: true,
    recurrence_frequency: frequency,
    recurrence_next_date: nextDate,
    recurrence_status: status,
  }
}

export interface ProcessRecurrencesResult {
  processedCount: number
  generatedTransactions: {
    id: string
    parentTransactionId: string
    date: string
    vendor: string | null
    total: number
    type: string
  }[]
  advancedRecurrences: {
    id: string
    previousNextDate: string
    newNextDate: string
  }[]
}

/**
 * Deterministically processes all active recurrences whose recurrence_next_date <= today.
 * For each cycle that has elapsed up to referenceDate (defaults to today in UTC/local ISO format):
 * 1. Generates the real transaction for that cycle.
 * 2. Inherits account, vendor, canonical vendor, category, total, payment method, notes, and original provenance.
 * 3. Ensures idempotency: will not generate a transaction if a transaction with the same cycle date and parent origin already exists.
 * 4. Advances recurrence_next_date to the next cycle until recurrence_next_date > referenceDate.
 * 5. Does not replicate line items (transaction_items) to avoid distorting item purchase reports.
 */
export async function processPendingRecurrences(
  options: {
    referenceDate?: string // YYYY-MM-DD (defaults to today)
    client?: SupabaseClient | null
  } = {}
): Promise<ProcessRecurrencesResult> {
  const supabase = options.client !== undefined ? options.client : (await import('./persist')).getSupabaseClient()
  const todayStr = options.referenceDate || new Date().toISOString().slice(0, 10)

  const result: ProcessRecurrencesResult = {
    processedCount: 0,
    generatedTransactions: [],
    advancedRecurrences: [],
  }

  if (!supabase) {
    return result
  }

  // 1. Fetch all active recurring transactions
  const { data: recurringTxs, error: fetchErr } = await supabase
    .from('transactions')
    .select('*')
    .eq('is_recurring', true)
    .eq('recurrence_status', 'active')

  if (fetchErr || !recurringTxs || recurringTxs.length === 0) {
    return result
  }

  // 2. Process each active recurring transaction
  for (const parentTx of recurringTxs) {
    let nextDate = parentTx.recurrence_next_date

    // Fallback if recurrence_next_date was missing: compute next cycle after effective transaction date
    if (!nextDate) {
      const effDate = getEffectiveDate(parentTx)
      nextDate = computeNextRecurrenceDate(effDate, parentTx.recurrence_frequency || 'monthly')
    }

    const frequency = resolveRecurrenceFrequency(parentTx.recurrence_frequency)
    let currentCycleDate = nextDate
    let cyclesGenerated = 0

    // Catch up all cycles where cycleDate <= todayStr
    while (currentCycleDate <= todayStr) {
      // 1. Check idempotency using recurrence_parent_id and recurrence_cycle_date (with fallback to existing notes tag for legacy data)
      const cycleNoteTag = `[Recorrência: ${parentTx.id} - ${currentCycleDate}]`

      const { data: existingCycle } = await supabase
        .from('transactions')
        .select('id')
        .or(`and(recurrence_parent_id.eq.${parentTx.id},recurrence_cycle_date.eq.${currentCycleDate}),and(date.eq.${currentCycleDate},notes.ilike.%${parentTx.id}%)`)
        .limit(1)

      const alreadyExists = existingCycle && existingCycle.length > 0

      if (!alreadyExists) {
        const newTxId = generateUUID()
        const nowIso = new Date().toISOString()
        const combinedNotes = parentTx.notes
          ? `${parentTx.notes} ${cycleNoteTag}`
          : cycleNoteTag

        const { error: insErr } = await supabase.from('transactions').insert({
          id: newTxId,
          user_id: parentTx.user_id || 'bc5a76de-8865-4ec3-b7d5-5dfbfb8123a6',
          account_id: parentTx.account_id || null,
          category_id: parentTx.category_id || null,
          vendor_id: parentTx.vendor_id || null,
          type: parentTx.type || 'expense',
          vendor: parentTx.vendor || null,
          vendor_address: parentTx.vendor_address || null,
          date: currentCycleDate,
          time: parentTx.time || null,
          currency: parentTx.currency || 'BRL',
          category: parentTx.category || null,
          subtotal: parentTx.subtotal || null,
          tax: parentTx.tax || null,
          tip: parentTx.tip || null,
          total: parentTx.total || 0,
          payment_method: parentTx.payment_method || null,
          notes: combinedNotes,
          source_type: parentTx.source_type || 'manual',
          image_key: null,
          image_sha256: null,
          origin_type: parentTx.origin_type || 'manual',
          raw_text: parentTx.raw_text || null,
          original_filename: parentTx.original_filename || null,
          captured_at: parentTx.captured_at || nowIso,
          original_extracted_data: parentTx.original_extracted_data || null,
          is_recurring: false, // Generated cycles are standalone transactions
          recurrence_frequency: null,
          recurrence_next_date: null,
          recurrence_status: 'active',
          recurrence_parent_id: parentTx.id,
          recurrence_cycle_date: currentCycleDate,
          installment_group_id: null,
          installment_current: null,
          installment_total: null,
          installment_amount: null,
          review_status: parentTx.review_status || 'confirmed',
          review_reasons: parentTx.review_reasons || [],
          created_at: nowIso,
        })

        if (!insErr) {
          result.generatedTransactions.push({
            id: newTxId,
            parentTransactionId: parentTx.id,
            date: currentCycleDate,
            vendor: parentTx.vendor || null,
            total: parentTx.total || 0,
            type: parentTx.type || 'expense',
          })
          cyclesGenerated++
        } else {
          // Unique constraint violation (code 23505 in PostgreSQL) means a concurrent worker already inserted it
          const isUniqueViolation = insErr.code === '23505' || String(insErr.message).includes('unique') || String(insErr.message).includes('duplicate')
          if (!isUniqueViolation) {
            console.error(`Error inserting recurring cycle ${currentCycleDate} for ${parentTx.id}:`, insErr)
          }
        }
      }

      // Advance to next cycle
      currentCycleDate = computeNextRecurrenceDate(currentCycleDate, frequency)
    }

    // 3. If next date advanced, update parent transaction's recurrence_next_date
    if (currentCycleDate !== parentTx.recurrence_next_date) {
      await supabase
        .from('transactions')
        .update({
          recurrence_next_date: currentCycleDate,
        })
        .eq('id', parentTx.id)

      result.advancedRecurrences.push({
        id: parentTx.id,
        previousNextDate: parentTx.recurrence_next_date || '',
        newNextDate: currentCycleDate,
      })
    }

    result.processedCount += cyclesGenerated
  }

  return result
}

/**
 * Monthly / Periodic projection: generates projected occurrences of active recurrences
 * within [startStr, endStr] that are not yet materialized.
 */
export function projectRecurringTransactions(
  txList: any[],
  startStr: string,
  endStr: string,
  getEffectiveDateFn: (tx: any) => string = getEffectiveDate
): any[] {
  const projectedRecurringTxs: any[] = []

  for (const t of txList) {
    if (t.is_recurring && t.recurrence_status === 'active') {
      const frequency = resolveRecurrenceFrequency(t.recurrence_frequency)
      let cycleDate = t.recurrence_next_date || getEffectiveDateFn(t)

      // Itera avançando pelas datas de ciclo até ultrapassar o final do período consultado
      let safetyCount = 0
      while (cycleDate <= endStr && safetyCount < 120) {
        safetyCount++
        if (cycleDate >= startStr && cycleDate <= endStr) {
          // Verifica se já existe um lançamento real neste ciclo exato
          const alreadyExists = txList.some(
            (other) =>
              other.id !== t.id &&
              getEffectiveDateFn(other) === cycleDate &&
              ((other as any).recurrence_parent_id === t.id || other.notes?.includes(t.id))
          )

          // Se for a própria transação base e sua data cai no período, ela já está contada
          const isBaseInPeriod = getEffectiveDateFn(t) === cycleDate

          if (!alreadyExists && !isBaseInPeriod) {
            projectedRecurringTxs.push({
              ...t,
              id: `proj_${t.id}_${cycleDate}`,
              date: cycleDate,
              is_projected: true,
            })
          }
        }
        cycleDate = computeNextRecurrenceDate(cycleDate, frequency)
      }
    }
  }

  return projectedRecurringTxs
}

export interface UpcomingRecurringCommitment {
  id: string
  kind: 'recurring'
  title: string
  vendor: string | null
  category: string
  accountName: string | null
  accountType: string | null
  amount: number
  date: string
  frequency: string
  rawTx?: any
}

/**
 * Extracts upcoming recurring commitments within a specific date window [todayIso, windowEndIso].
 */
export function getUpcomingRecurringCommitments(
  txList: any[],
  todayIso: string,
  windowEndIso: string,
  options: {
    getEffectiveDateFn?: (tx: any) => string
    accountsMap?: Record<string, any>
    translateCategoryFn?: (cat: string | null | undefined) => string | null
  } = {}
): UpcomingRecurringCommitment[] {
  const upcoming: UpcomingRecurringCommitment[] = []
  const getEffDate = options.getEffectiveDateFn || getEffectiveDate
  const accountsMap = options.accountsMap || {}
  const translateCategory = options.translateCategoryFn || ((c) => c || null)

  for (const tx of txList) {
    if (tx.is_recurring && tx.recurrence_status === 'active') {
      const frequency = resolveRecurrenceFrequency(tx.recurrence_frequency)
      let nextDate = tx.recurrence_next_date
      if (!nextDate) {
        nextDate = computeNextRecurrenceDate(getEffDate(tx), frequency)
      }

      if (nextDate > todayIso && nextDate <= windowEndIso) {
        const rawAcc = tx.accounts
        const accInfo = rawAcc || (tx.account_id ? accountsMap[tx.account_id] : null)
        const accName = accInfo?.name || (tx.account_id ? 'Conta' : null)
        const accType = accInfo?.type || null
        const amount = Number(tx.total) || 0
        const cat = translateCategory(tx.category) || 'Outros'

        upcoming.push({
          id: tx.id,
          kind: 'recurring',
          title: tx.vendor || cat || 'Despesa Recorrente',
          vendor: tx.vendor || null,
          category: cat,
          accountName: accName,
          accountType: accType,
          amount,
          date: nextDate,
          frequency,
          rawTx: tx,
        })
      }
    }
  }

  return upcoming
}

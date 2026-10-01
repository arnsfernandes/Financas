/**
 * Core business rules and backend operations for Credit Card Invoices & Payments.
 * Single source of truth for Web and Telegram.
 */

import { getSupabaseClient } from '@/lib/persist'
import { getCardInvoiceDates } from '@/lib/billingCycles'
import type { CreditCardInvoice, InvoicePayment } from '@/lib/schema'

export interface RegisterInvoicePaymentInput {
  accountId: string
  dueDate: string // YYYY-MM-DD
  closingDate?: string // YYYY-MM-DD
  amount: number
  paymentDate: string // YYYY-MM-DD
  fromAccountId?: string | null
  paymentMethod?: string | null
  notes?: string | null
}

export interface InvoiceWithDetails extends CreditCardInvoice {
  computedTotal: number
  remainingAmount: number
  payments: InvoicePayment[]
}

/**
 * Calculates current computed total for an invoice based on actual card purchases for this cycle.
 */
export async function computeInvoicePurchasesTotal(
  accountId: string,
  dueDate: string
): Promise<number> {
  const supabase = getSupabaseClient()
  if (!supabase) return 0

  // 1. Fetch account closing_day and due_day
  const { data: account } = await supabase
    .from('accounts')
    .select('closing_day, due_day, type')
    .eq('id', accountId)
    .single()

  if (!account || account.type !== 'credit_card') {
    return 0
  }

  const cDay = account.closing_day || 5
  const dDay = account.due_day || 15

  // 2. Fetch all expense transactions for this account
  const { data: txs } = await supabase
    .from('transactions')
    .select('id, date, total, installment_amount, type')
    .eq('account_id', accountId)
    .eq('type', 'expense')

  if (!txs || txs.length === 0) return 0

  let sum = 0
  for (const tx of txs) {
    const txDate = tx.date || new Date().toISOString().slice(0, 10)
    const cycle = getCardInvoiceDates(txDate, cDay, dDay)
    if (cycle.dueDate === dueDate) {
      const val = Math.abs(Number(tx.installment_amount) || Number(tx.total) || 0)
      sum += val
    }
  }

  return Number(sum.toFixed(2))
}

/**
 * Gets or creates the invoice record for a credit card and due date.
 */
export async function getOrCreateInvoice(
  accountId: string,
  dueDate: string,
  closingDate?: string
): Promise<InvoiceWithDetails | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null

  // 1. Fetch computed total from purchases
  const computedTotal = await computeInvoicePurchasesTotal(accountId, dueDate)

  // 2. If closingDate is not provided, compute it
  let finalClosingDate = closingDate
  if (!finalClosingDate) {
    const { data: account } = await supabase
      .from('accounts')
      .select('closing_day, due_day')
      .eq('id', accountId)
      .single()
    const cDay = account?.closing_day || 5
    const dDay = account?.due_day || 15
    const cycle = getCardInvoiceDates(dueDate, cDay, dDay)
    finalClosingDate = cycle.closingDate
  }

  // 3. Find or create invoice record
  const { data: existing, error: findError } = await supabase
    .from('credit_card_invoices')
    .select('*, invoice_payments(*)')
    .eq('account_id', accountId)
    .eq('due_date', dueDate)
    .maybeSingle()

  if (findError) {
    console.error('Error fetching credit_card_invoice:', findError)
    return null
  }

  let invoiceRecord: any = existing

  if (!invoiceRecord) {
    const { data: created, error: insertError } = await supabase
      .from('credit_card_invoices')
      .insert({
        account_id: accountId,
        closing_date: finalClosingDate,
        due_date: dueDate,
        total_amount: computedTotal,
        paid_amount: 0,
        status: 'open',
      })
      .select('*, invoice_payments(*)')
      .single()

    if (insertError) {
      console.error('Error inserting credit_card_invoice:', insertError)
      return null
    }
    invoiceRecord = created
  } else if (Math.abs(Number(invoiceRecord.total_amount) - computedTotal) > 0.009) {
    // Keep total_amount in sync with purchases
    const { data: updated } = await supabase
      .from('credit_card_invoices')
      .update({
        total_amount: computedTotal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoiceRecord.id)
      .select('*, invoice_payments(*)')
      .single()

    if (updated) {
      invoiceRecord = updated
    }
  }

  const payments: InvoicePayment[] = invoiceRecord.invoice_payments || []
  const paidAmount = payments.reduce((acc, p) => acc + Number(p.amount || 0), 0)
  const remainingAmount = Math.max(0, computedTotal - paidAmount)

  return {
    ...invoiceRecord,
    total_amount: computedTotal,
    paid_amount: paidAmount,
    computedTotal,
    remainingAmount: Number(remainingAmount.toFixed(2)),
    payments: payments.sort((a, b) => (b.payment_date > a.payment_date ? 1 : -1)),
  }
}

/**
 * Registers an invoice payment (total or partial).
 * Ensures invoice status is updated to 'paid', 'partial', or 'open'.
 */
export async function registerInvoicePayment(
  input: RegisterInvoicePaymentInput
): Promise<{ ok: boolean; invoice?: InvoiceWithDetails; error?: string }> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { ok: false, error: 'Database client unavailable' }
  }

  const paymentAmount = Number(input.amount)
  if (!paymentAmount || paymentAmount <= 0) {
    return { ok: false, error: 'Valor do pagamento deve ser maior que zero.' }
  }

  if (!input.dueDate) {
    return { ok: false, error: 'Data de vencimento da fatura é obrigatória.' }
  }

  // 1. Ensure invoice exists and get current status
  const invoice = await getOrCreateInvoice(input.accountId, input.dueDate, input.closingDate)
  if (!invoice) {
    return { ok: false, error: 'Falha ao recuperar ou gerar fatura do cartão.' }
  }

  // 2. Insert invoice payment record
  const { data: paymentRecord, error: paymentError } = await supabase
    .from('invoice_payments')
    .insert({
      invoice_id: invoice.id,
      amount: paymentAmount,
      payment_date: input.paymentDate || new Date().toISOString().slice(0, 10),
      from_account_id: input.fromAccountId || null,
      payment_method: input.paymentMethod || 'PIX',
      notes: input.notes?.trim() || null,
    })
    .select('*')
    .single()

  if (paymentError || !paymentRecord) {
    console.error('Error inserting invoice payment:', paymentError)
    return { ok: false, error: paymentError?.message || 'Erro ao registrar pagamento de fatura.' }
  }

  // 3. Recalculate total paid on this invoice
  const { data: allPayments } = await supabase
    .from('invoice_payments')
    .select('amount')
    .eq('invoice_id', invoice.id)

  const newTotalPaid = (allPayments || []).reduce((acc, p) => acc + Number(p.amount || 0), 0)
  const computedTotal = invoice.computedTotal

  // Status rule:
  // - If newTotalPaid >= computedTotal: 'paid'
  // - If newTotalPaid > 0 && newTotalPaid < computedTotal: 'partial'
  // - If newTotalPaid <= 0: 'open'
  let newStatus: 'open' | 'partial' | 'paid' = 'open'
  if (computedTotal > 0) {
    if (newTotalPaid >= computedTotal - 0.009) {
      newStatus = 'paid'
    } else if (newTotalPaid > 0) {
      newStatus = 'partial'
    }
  } else if (newTotalPaid > 0) {
    newStatus = 'paid'
  }

  // 4. Update invoice record
  const { data: updatedInvoice, error: updateError } = await supabase
    .from('credit_card_invoices')
    .update({
      paid_amount: newTotalPaid,
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoice.id)
    .select('*, invoice_payments(*)')
    .single()

  if (updateError || !updatedInvoice) {
    console.error('Error updating invoice summary:', updateError)
  }

  const refreshedInvoice = await getOrCreateInvoice(input.accountId, input.dueDate, input.closingDate)

  return {
    ok: true,
    invoice: refreshedInvoice || undefined,
  }
}

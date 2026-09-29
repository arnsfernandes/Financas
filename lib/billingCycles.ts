/**
 * Billing cycles and credit card invoice management
 */

export interface InvoiceCycleDates {
  closingDate: string // YYYY-MM-DD
  dueDate: string // YYYY-MM-DD
  invoiceKey: string // Unique identifier for this card's invoice cycle (e.g. YYYY-MM of due date)
}

function getDaysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

function formatDateIso(year: number, monthIndex: number, day: number): string {
  const y = String(year).padStart(4, '0')
  const m = String(monthIndex + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Calculates the exact closing date and due date for a credit card purchase.
 *
 * Rules:
 * - If purchase day <= closingDay: closes in the same month as the purchase.
 * - If purchase day > closingDay: closes in the month following the purchase.
 * - If dueDay > closingDay: due date is in the same month as the closing date.
 * - If dueDay <= closingDay: due date is in the month following the closing date.
 */
export function getCardInvoiceDates(
  purchaseDateStr: string,
  closingDay: number = 5,
  dueDay: number = 15
): InvoiceCycleDates {
  const safeClosing = Math.max(1, Math.min(31, Math.round(closingDay || 5)))
  const safeDue = Math.max(1, Math.min(31, Math.round(dueDay || 15)))

  const pYear = parseInt(purchaseDateStr.slice(0, 4), 10) || new Date().getUTCFullYear()
  const pMonth = (parseInt(purchaseDateStr.slice(5, 7), 10) || 1) - 1
  const pDay = parseInt(purchaseDateStr.slice(8, 10), 10) || 1

  let closingYear = pYear
  let closingMonth = pMonth

  if (pDay > safeClosing) {
    closingMonth += 1
    if (closingMonth > 11) {
      closingMonth = 0
      closingYear += 1
    }
  }

  const maxClosingDay = getDaysInMonth(closingYear, closingMonth)
  const actualClosingDay = Math.min(safeClosing, maxClosingDay)
  const closingDate = formatDateIso(closingYear, closingMonth, actualClosingDay)

  let dueYear = closingYear
  let dueMonth = closingMonth

  if (safeDue <= safeClosing) {
    dueMonth += 1
    if (dueMonth > 11) {
      dueMonth = 0
      dueYear += 1
    }
  }

  const maxDueDay = getDaysInMonth(dueYear, dueMonth)
  const actualDueDay = Math.min(safeDue, maxDueDay)
  const dueDate = formatDateIso(dueYear, dueMonth, actualDueDay)

  const invoiceKey = `${dueYear}-${String(dueMonth + 1).padStart(2, '0')}`

  return {
    closingDate,
    dueDate,
    invoiceKey,
  }
}

/**
 * Checks if a payment method or account type represents an immediate payment.
 * Immediate payments: PIX, Débito, Dinheiro, Transferência (TED/DOC).
 * They are paid immediately on transaction date and MUST NOT appear in "Próximos Pagamentos".
 */
export function isImmediatePayment(
  paymentMethod?: string | null,
  accountType?: string | null
): boolean {
  if (accountType === 'cash' || accountType === 'debit_card') {
    return true
  }

  if (!paymentMethod) {
    return false
  }

  const pm = paymentMethod.toLowerCase().trim()
  return (
    pm.includes('pix') ||
    pm.includes('débito') ||
    pm.includes('debito') ||
    pm.includes('debit') ||
    pm.includes('dinheiro') ||
    pm.includes('cash') ||
    pm.includes('transferência') ||
    pm.includes('transferencia') ||
    pm.includes('transfer') ||
    pm.includes('ted') ||
    pm.includes('doc')
  )
}

export interface InvoiceItem {
  id: string
  date: string
  vendor: string | null
  category: string | null
  amount: number
  installmentCurrent?: number | null
  installmentTotal?: number | null
  isInstallment?: boolean
  notes?: string | null
  rawTx?: any
}

export interface ConsolidatedInvoice {
  id: string
  accountId: string
  accountName: string
  closingDate: string
  dueDate: string
  dueDay: number
  total: number
  items: InvoiceItem[]
}

/**
 * Consolidates credit card transactions and installments into structured invoices by card and due date.
 */
export function groupTransactionsIntoInvoices(
  txList: any[],
  accountsMap: Record<string, any>
): ConsolidatedInvoice[] {
  const invoiceMap: Record<string, ConsolidatedInvoice> = {}

  for (const tx of txList) {
    if (tx.type !== 'expense') continue

    const accountId = tx.account_id
    if (!accountId) continue

    const acc = accountsMap[accountId]
    if (!acc || acc.type !== 'credit_card') continue

    const closingDay = acc.closing_day || 5
    const dueDay = acc.due_day || 15

    const txDate = tx.date || new Date().toISOString().slice(0, 10)
    const cycle = getCardInvoiceDates(txDate, closingDay, dueDay)

    const key = `${accountId}-${cycle.dueDate}`
    if (!invoiceMap[key]) {
      invoiceMap[key] = {
        id: `invoice-${key}`,
        accountId,
        accountName: acc.name || 'Cartão de Crédito',
        closingDate: cycle.closingDate,
        dueDate: cycle.dueDate,
        dueDay,
        total: 0,
        items: [],
      }
    }

    const amount = Number(tx.installment_amount) || Number(tx.total) || 0
    invoiceMap[key].total = Number((invoiceMap[key].total + amount).toFixed(2))
    invoiceMap[key].items.push({
      id: tx.id,
      date: txDate,
      vendor: tx.vendor || null,
      category: tx.category || null,
      amount,
      installmentCurrent: tx.installment_current || null,
      installmentTotal: tx.installment_total || null,
      isInstallment: Boolean(tx.installment_total && tx.installment_total > 1),
      notes: tx.notes || null,
      rawTx: tx,
    })
  }

  return Object.values(invoiceMap).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

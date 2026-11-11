/**
 * Mês de competência de um gasto no cartão de crédito: o mês da fatura em que ele é cobrado, e não a
 * data do calendário. A fatura que vence em 15/12 (ciclo ~10/11 a 09/12) é a de "novembro".
 *
 * - Lançamento importado de fatura: usa o vencimento real daquela fatura (o banco nem sempre fecha
 *   no mesmo dia) e, para parcelas futuras, soma os meses a partir da parcela que estava na fatura.
 * - Outros lançamentos no cartão: calcula pelo dia de fechamento e de vencimento do cartão.
 */
import { getCardInvoiceDates } from './billingCycles'
import { addMonthsToDate } from './dateUtils'

export interface CompetenceTx {
  date?: string | null
  created_at?: string | null
  installment_current?: number | null
  original_extracted_data?: Record<string, any> | null
}

/** Vencimento da fatura em que este lançamento é cobrado. */
export function cardInvoiceDue(tx: CompetenceTx, closingDay: number, dueDay: number): string {
  const oed = tx.original_extracted_data
  const statementDue = typeof oed?.statement_due_date === 'string' ? oed.statement_due_date : null
  if (statementDue && /^\d{4}-\d{2}-\d{2}$/.test(statementDue)) {
    const present: number[] = Array.isArray(oed?.present_installments) ? oed!.present_installments : []
    const current = Number(tx.installment_current) || 0
    if (current && present.length) {
      // Parcelas presentes na fatura importada são daquela fatura; as demais, um mês por parcela.
      if (present.includes(current)) return statementDue
      return addMonthsToDate(statementDue, current - Math.max(...present))
    }
    return statementDue
  }
  const date = tx.date || tx.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10)
  return getCardInvoiceDates(date, closingDay, dueDay).dueDate
}

/** "YYYY-MM" do mês de competência: o mês anterior ao do vencimento da fatura. */
export function cardCompetenceMonth(tx: CompetenceTx, closingDay: number, dueDay: number): string {
  return addMonthsToDate(cardInvoiceDue(tx, closingDay, dueDay), -1).slice(0, 7)
}

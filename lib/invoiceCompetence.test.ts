import { describe, expect, it } from 'vitest'
import { cardCompetenceMonth, cardInvoiceDue } from './invoiceCompetence'

describe('mês da fatura de um gasto no cartão', () => {
  it('lançamento importado usa o vencimento real da fatura e soma um mês por parcela futura', () => {
    const oed = { statement_due_date: '2026-11-15', present_installments: [1] }
    // Drogasil 08/10 em 3×: o banco cobrou a 1ª na fatura de 15/11 (fechou antes do dia 9)
    expect(cardInvoiceDue({ date: '2026-10-08', installment_current: 1, original_extracted_data: oed }, 9, 15)).toBe('2026-11-15')
    expect(cardInvoiceDue({ date: '2026-11-08', installment_current: 2, original_extracted_data: oed }, 9, 15)).toBe('2026-12-15')
    expect(cardCompetenceMonth({ date: '2026-11-08', installment_current: 2, original_extracted_data: oed }, 9, 15)).toBe('2026-11')
  })
  it('lançamento manual no cartão segue o fechamento: compra no dia 10 entra na fatura seguinte', () => {
    expect(cardCompetenceMonth({ date: '2026-11-09' }, 9, 15)).toBe('2026-10')
    expect(cardCompetenceMonth({ date: '2026-11-10' }, 9, 15)).toBe('2026-11')
  })
})

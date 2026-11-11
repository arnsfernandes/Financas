import { describe, expect, it } from 'vitest'
import { markProbableMatches, mergePatch, type ProbableCandidate } from './probableMatches'
import type { PreviewLine } from './importStatement'
import type { ParsedStatement } from './interPdf'

const line = (over: Partial<PreviewLine> = {}): PreviewLine =>
  ({
    index: 0, date: '2026-11-12', description: 'SUPERMERCADOS BH LTDA', vendor: 'Supermercados BH', amount: 45.9,
    isCredit: false, kind: 'purchase', card: '1234', installmentCurrent: null, installmentTotal: null,
    action: 'import', reason: '', category: 'Mercado', netAmount: 45.9, ...over,
  }) as PreviewLine

const manual = (over: Partial<ProbableCandidate> = {}): ProbableCandidate => ({
  id: 'tx1', date: '2026-11-10', vendor: 'mercado', total: 45.9, account_id: 'nubank', category: 'Mercado', ...over,
})

describe('markProbableMatches', () => {
  it('marca compra com mesmo valor e data próxima, mesmo com outro nome e outra conta', () => {
    const [l] = markProbableMatches([line()], [manual()], new Map([['nubank', 'Nubank']]))
    expect(l.probable).toMatchObject({ id: 'tx1', vendor: 'mercado', accountName: 'Nubank', total: 45.9 })
  })

  it('ignora valor diferente ou data a mais de 3 dias', () => {
    const lines = markProbableMatches([line()], [manual({ total: 46.9 }), manual({ id: 'tx2', date: '2026-11-08' })])
    expect(lines[0].probable).toBeUndefined()
  })

  it('não usa lançamentos vindos de faturas/extratos nem os já reconhecidos como repetidos', () => {
    const lines = markProbableMatches(
      [line({ index: 0 }), line({ index: 1, action: 'duplicate', duplicateOf: 'tx3' })],
      [manual({ original_extracted_data: { source: 'inter_statement_pdf' } }), manual({ id: 'tx3' })],
    )
    expect(lines[0].probable).toBeUndefined()
  })

  it('cada lançamento manual só é sugerido para uma compra, a de data mais próxima', () => {
    const lines = markProbableMatches(
      [line({ index: 0, date: '2026-11-13' }), line({ index: 1, date: '2026-11-11' })],
      [manual()],
    )
    expect(lines[0].probable?.id).toBe('tx1')
    expect(lines[1].probable).toBeUndefined()
  })

  it('não marca parcelas, créditos ou linhas que não serão importadas', () => {
    const lines = markProbableMatches(
      [line({ installmentTotal: 3, installmentCurrent: 1 }), line({ index: 1, isCredit: true }), line({ index: 2, action: 'duplicate' })],
      [manual(), manual({ id: 'tx2' }), manual({ id: 'tx3' })],
    )
    expect(lines.every((l) => !l.probable)).toBe(true)
  })
})

describe('mergePatch', () => {
  it('usa nome, data e cartão da fatura e mantém as observações do usuário', () => {
    const statement = { dueDate: '2026-12-15', issuerName: 'Inter', sha256: 'abc' } as ParsedStatement
    const patch = mergePatch(line(), { vendor: 'mercado', date: '2026-11-10', notes: 'compra do mês' }, { accountId: 'inter', statement })
    expect(patch).toMatchObject({ vendor: 'Supermercados BH', date: '2026-11-12', account_id: 'inter', total: 45.9 })
    expect(patch.notes).toBe('compra do mês · Conferido com a fatura Inter (venc. 15/12/2026)')
    expect(patch.original_extracted_data.statement_match).toMatchObject({ manual_vendor: 'mercado', manual_date: '2026-11-10' })
    expect(patch).not.toHaveProperty('category')
  })
})

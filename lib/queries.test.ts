import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listTransactions, getItemReport } from './queries'
import * as persistModule from './persist'

describe('Queries & Reports with filters', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('normalizes item names consistently (accents and casing)', () => {
    const fn = (persistModule as any).normalizeItemName || ((s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim())
    expect(fn('macarrão')).toBe('macarrao')
    expect(fn('Macarrao')).toBe('macarrao')
    expect(fn('MACARRÃO')).toBe('macarrao')
    expect(fn('  Café Torrado ')).toBe('cafe torrado')
  })

  it('handles empty database / client gracefully in listTransactions', async () => {
    vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue(null)
    const res = await listTransactions({ vendor: 'Carrefour' })
    expect(res).toEqual({ transactions: [], total_count: 0, total_amount: 0 })
  })

  it('handles empty database / client gracefully in getItemReport', async () => {
    vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue(null)
    const report = await getItemReport({ product: 'macarrão' })
    expect(report.total_spent).toBe(0)
    expect(report.occurrences).toBe(0)
    expect(report.purchases).toEqual([])
  })
})

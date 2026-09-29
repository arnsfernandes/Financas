import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listTransactions, getEffectiveDate, buildEffectiveDateOrFilter } from './queries'
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

  describe('Effective Date & Period Filter Logic', () => {
    it('uses date when present, otherwise extracts date from created_at', () => {
      expect(getEffectiveDate({ date: '2026-05-10', created_at: '2026-09-22T12:00:00Z' })).toBe('2026-05-10')
      expect(getEffectiveDate({ date: null, created_at: '2026-09-22T18:16:08.998Z' })).toBe('2026-09-22')
      expect(getEffectiveDate({ date: undefined, created_at: '2026-08-15T09:30:00Z' })).toBe('2026-08-15')
    })

    it('builds compound PostgREST OR filter for effective date covering date and created_at', () => {
      const orFilter = buildEffectiveDateOrFilter('2026-09-01', '2026-09-30')
      expect(orFilter).toContain('and(date.not.is.null,date.gte.2026-09-01,date.lte.2026-09-30)')
      expect(orFilter).toContain('and(date.is.null,created_at.gte.2026-09-01T00:00:00.000Z,created_at.lte.2026-09-30T23:59:59.999Z)')
    })

    it('returns null when no date boundaries are supplied', () => {
      expect(buildEffectiveDateOrFilter(undefined, undefined)).toBeNull()
    })
  })

  it('handles empty database / client gracefully in listTransactions', async () => {
    vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue(null)
    const res = await listTransactions({ vendor: 'Carrefour', startDate: '2026-09-01' })
    expect(res).toEqual({ transactions: [], total_count: 0, total_amount: 0, has_more: false })
  })


  describe('deleteTransaction', () => {
    it('handles null client gracefully', async () => {
      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue(null)
      const res = await (await import('./queries')).deleteTransaction('fake-id')
      expect(res).toBe(true)
    })

    it('calls supabase delete with correct id', async () => {
      const eqMock = vi.fn().mockResolvedValue({ error: null })
      const deleteMock = vi.fn().mockReturnValue({ eq: eqMock })
      const fromMock = vi.fn().mockReturnValue({ delete: deleteMock })

      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: fromMock,
      } as any)

      const { deleteTransaction } = await import('./queries')
      const res = await deleteTransaction('123-abc')

      expect(res).toBe(true)
      expect(fromMock).toHaveBeenCalledWith('transactions')
      expect(deleteMock).toHaveBeenCalledOnce()
      expect(eqMock).toHaveBeenCalledWith('id', '123-abc')
    })

    it('throws error if supabase deletion fails', async () => {
      const eqMock = vi.fn().mockResolvedValue({ error: { message: 'Database delete failed' } })
      const deleteMock = vi.fn().mockReturnValue({ eq: eqMock })
      const fromMock = vi.fn().mockReturnValue({ delete: deleteMock })

      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: fromMock,
      } as any)

      const { deleteTransaction } = await import('./queries')
      await expect(deleteTransaction('123-abc')).rejects.toThrow('Database delete failed')
    })
  })

  describe('deleteInstallmentGroup', () => {
    it('throws error if groupId is empty or invalid', async () => {
      const { deleteInstallmentGroup } = await import('./queries')
      await expect(deleteInstallmentGroup('')).rejects.toThrow('installment_group_id is required')
    })

    it('handles null client gracefully', async () => {
      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue(null)
      const { deleteInstallmentGroup } = await import('./queries')
      const res = await deleteInstallmentGroup('grp-123')
      expect(res).toBe(true)
    })

    it('calls supabase delete with correct installment_group_id exclusively', async () => {
      const eqMock = vi.fn().mockResolvedValue({ error: null })
      const deleteMock = vi.fn().mockReturnValue({ eq: eqMock })
      const fromMock = vi.fn().mockReturnValue({ delete: deleteMock })

      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: fromMock,
      } as any)

      const { deleteInstallmentGroup } = await import('./queries')
      const res = await deleteInstallmentGroup('grp-abc-789')

      expect(res).toBe(true)
      expect(fromMock).toHaveBeenCalledWith('transactions')
      expect(deleteMock).toHaveBeenCalledOnce()
      expect(eqMock).toHaveBeenCalledWith('installment_group_id', 'grp-abc-789')
    })

    it('throws error if supabase group deletion fails', async () => {
      const eqMock = vi.fn().mockResolvedValue({ error: { message: 'Database group delete failed' } })
      const deleteMock = vi.fn().mockReturnValue({ eq: eqMock })
      const fromMock = vi.fn().mockReturnValue({ delete: deleteMock })

      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: fromMock,
      } as any)

      const { deleteInstallmentGroup } = await import('./queries')
      await expect(deleteInstallmentGroup('grp-abc-789')).rejects.toThrow('Database group delete failed')
    })
  })

  describe('updateTransaction', () => {
    it('handles null client gracefully', async () => {
      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue(null)
      const { updateTransaction } = await import('./queries')
      const res = await updateTransaction('tx-1', { vendor: 'Novo Mercado', total: 50 })
      expect(res).toEqual({ id: 'tx-1', type: 'expense', vendor: 'Novo Mercado', total: 50 })
    })

    it('updates transaction fields and replaces items atomically', async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })
      const deleteMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })
      const insertMock = vi.fn().mockResolvedValue({ error: null })
      const singleMock = vi.fn().mockResolvedValue({
        data: {
          id: 'tx-123',
          vendor: 'Supermercado Atualizado',
          total: 80.5,
          transaction_items: [
            { id: 'item-1', description: 'Arroz 5kg', normalized_name: 'arroz 5kg', total: 30 },
            { id: 'item-2', description: 'Feijão 1kg', normalized_name: 'feijao 1kg', total: 50.5 },
          ],
        },
        error: null,
      })
      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: singleMock,
        }),
      })

      const fromMock = vi.fn().mockImplementation((table: string) => {
        if (table === 'transactions') {
          return {
            update: updateMock,
            select: selectMock,
          }
        }
        if (table === 'transaction_items') {
          return {
            delete: deleteMock,
            insert: insertMock,
          }
        }
        return {}
      })

      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: fromMock,
      } as any)

      const { updateTransaction } = await import('./queries')
      const updated = await updateTransaction('tx-123', {
        vendor: 'Supermercado Atualizado',
        total: 80.5,
        items: [
          { description: 'Arroz 5kg', quantity: 1, unit_price: 30, total: 30 },
          { description: 'Feijão 1kg', quantity: 5, unit_price: 10.1, total: 50.5 },
        ],
      })

      expect(fromMock).toHaveBeenCalledWith('transactions')
      expect(fromMock).toHaveBeenCalledWith('transaction_items')
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          vendor: 'Supermercado Atualizado',
          total: 80.5,
        })
      )
      expect(insertMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            transaction_id: 'tx-123',
            description: 'Arroz 5kg',
            normalized_name: 'arroz 5kg',
          }),
        ])
      )
      expect(updated.id).toBe('tx-123')
      expect(updated.transaction_items).toHaveLength(2)
    })

    it('throws error when transaction update fails', async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: { message: 'Update failed' } }),
      })
      const fromMock = vi.fn().mockReturnValue({ update: updateMock })

      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: fromMock,
      } as any)

      const { updateTransaction } = await import('./queries')
      await expect(
        updateTransaction('tx-123', { vendor: 'Novo' })
      ).rejects.toThrow('Update failed')
    })

    it('rolls back transaction fields and restores original items when item replacement fails', async () => {
      const initialTx = {
        id: 'tx-123',
        vendor: 'Mercado Antigo',
        total: 50,
        transaction_items: [
          { id: 'item-orig-1', description: 'Item Antigo 1', total: 20, transaction_id: 'tx-123' },
          { id: 'item-orig-2', description: 'Item Antigo 2', total: 30, transaction_id: 'tx-123' },
        ],
      }

      const txUpdateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })
      const txSelectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: initialTx, error: null }),
        }),
      })

      const itemDeleteMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })
      // Fail on the insert step for new items, then succeed on rollback insert
      let insertCalls = 0
      const itemInsertMock = vi.fn().mockImplementation(() => {
        insertCalls++
        if (insertCalls === 1) {
          return Promise.resolve({ error: { message: 'Foreign key or DB constraint error' } })
        }
        return Promise.resolve({ error: null })
      })

      const fromMock = vi.fn().mockImplementation((table: string) => {
        if (table === 'transactions') {
          return {
            select: txSelectMock,
            update: txUpdateMock,
          }
        }
        if (table === 'transaction_items') {
          return {
            delete: itemDeleteMock,
            insert: itemInsertMock,
          }
        }
        return {}
      })

      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: fromMock,
      } as any)

      const { updateTransaction } = await import('./queries')

      await expect(
        updateTransaction('tx-123', {
          vendor: 'Mercado Novo Falho',
          total: 100,
          items: [
            { description: 'Item Novo', quantity: 1, unit_price: 100, total: 100 },
          ],
        })
      ).rejects.toThrow('Failed to insert updated transaction items')

      // Verify initial update was attempted
      expect(txUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          vendor: 'Mercado Novo Falho',
          total: 100,
        })
      )

      // Verify rollback reverted transaction fields to original snapshot
      expect(txUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'tx-123',
          vendor: 'Mercado Antigo',
          total: 50,
        })
      )

      // Verify rollback restored original items
      expect(itemInsertMock).toHaveBeenCalledTimes(2)
      expect(itemInsertMock).toHaveBeenLastCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'item-orig-1', description: 'Item Antigo 1' }),
          expect.objectContaining({ id: 'item-orig-2', description: 'Item Antigo 2' }),
        ])
      )
    })
  })

  describe('Validation of Isolated and Combined Filters', () => {
    // Helper to create a chainable Supabase query mock
    function createQueryChainMock(finalResult: { data: any; count?: number; error: any }) {
      const chain: any = {}
      chain.select = vi.fn().mockReturnValue(chain)
      chain.order = vi.fn().mockReturnValue(chain)
      chain.ilike = vi.fn().mockReturnValue(chain)
      chain.in = vi.fn().mockReturnValue(chain)
      chain.or = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.gt = vi.fn().mockReturnValue(chain)
      chain.not = vi.fn().mockReturnValue(chain)
      chain.is = vi.fn().mockReturnValue(chain)
      chain.limit = vi.fn().mockReturnValue(chain)
      chain.range = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: any) => Promise.resolve(finalResult).then(resolve)
      return chain
    }

    it('Filter: Período isolado', async () => {
      const txChain = createQueryChainMock({
        data: [{ id: 'tx-1', total: 100, date: '2026-09-10' }],
        count: 1,
        error: null,
      })
      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: vi.fn().mockReturnValue(txChain),
      } as any)

      const res = await listTransactions({ startDate: '2026-09-01', endDate: '2026-09-30' })
      expect(txChain.or).toHaveBeenCalledWith(expect.stringContaining('date.gte.2026-09-01'))
      expect(res.transactions).toHaveLength(1)
    })

    it('Filter: Categoria da transação isolada (case-insensitive)', async () => {
      const txChain = createQueryChainMock({
        data: [{ id: 'tx-1', total: 50, category: 'Groceries' }],
        count: 1,
        error: null,
      })
      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: vi.fn().mockReturnValue(txChain),
      } as any)

      await listTransactions({ category: 'groceries' })
      expect(txChain.ilike).toHaveBeenCalledWith('category', '%groceries%')
    })

    it('Filter: Estabelecimento isolado (case-insensitive)', async () => {
      const txChain = createQueryChainMock({
        data: [{ id: 'tx-1', total: 120, vendor: 'Carrefour' }],
        count: 1,
        error: null,
      })
      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: vi.fn().mockReturnValue(txChain),
      } as any)

      await listTransactions({ vendor: 'carrefour' })
      expect(txChain.or).toHaveBeenCalledWith(expect.stringContaining('vendor.ilike.%carrefour%'))
    })

    it('Filter: Produto isolado (accent & case insensitive)', async () => {
      const itemChain = createQueryChainMock({
        data: [{ transaction_id: 'tx-1' }],
        error: null,
      })
      const canonicalChain = createQueryChainMock({
        data: [],
        error: null,
      })
      const txChain = createQueryChainMock({
        data: [{ id: 'tx-1', total: 25 }],
        count: 1,
        error: null,
      })

      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'canonical_products') return canonicalChain
          if (table === 'transaction_items') return itemChain
          return txChain
        }),
      } as any)

      await listTransactions({ product: 'Macarrão' })
      expect(txChain.in).toHaveBeenCalledWith('id', ['tx-1'])
    })

    it('Filter: Categoria do item isolada', async () => {
      const itemChain = createQueryChainMock({
        data: [{ transaction_id: 'tx-2' }],
        error: null,
      })
      const txChain = createQueryChainMock({
        data: [{ id: 'tx-2', total: 40 }],
        count: 1,
        error: null,
      })

      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'transaction_items') return itemChain
          return txChain
        }),
      } as any)

      await listTransactions({ itemCategory: 'Bebidas' })
      expect(itemChain.ilike).toHaveBeenCalledWith('category', '%Bebidas%')
      expect(txChain.in).toHaveBeenCalledWith('id', ['tx-2'])
    })

    it('Filter Combinado: Período + Estabelecimento', async () => {
      const txChain = createQueryChainMock({
        data: [{ id: 'tx-1', total: 84, vendor: 'Carrefour', date: '2026-09-05' }],
        count: 1,
        error: null,
      })
      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: vi.fn().mockReturnValue(txChain),
      } as any)

      const res = await listTransactions({
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        vendor: 'Carrefour',
      })
      expect(txChain.or).toHaveBeenCalledWith(expect.stringContaining('date.gte.2026-09-01'))
      expect(txChain.or).toHaveBeenCalledWith(expect.stringContaining('vendor.ilike.%Carrefour%'))
      expect(res.transactions).toHaveLength(1)
    })


    it('Filter Combinado: Período + Categoria', async () => {
      const txChain = createQueryChainMock({
        data: [{ id: 'tx-1', total: 70, category: 'Alimentação', date: '2026-09-12' }],
        count: 1,
        error: null,
      })
      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: vi.fn().mockReturnValue(txChain),
      } as any)

      await listTransactions({
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        category: 'Alimentação',
      })
      expect(txChain.or).toHaveBeenCalledWith(expect.stringContaining('date.gte.2026-09-01'))
      expect(txChain.ilike).toHaveBeenCalledWith('category', '%Alimentação%')
    })

  })

  describe('getDashboardSummary', () => {
    it('handles null client gracefully and returns zeroed metrics', async () => {
      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue(null)
      const { getDashboardSummary } = await import('./queries')
      const summary = await getDashboardSummary({ referenceDate: '2026-09-22T12:00:00Z' })

      expect(summary.metrics.totalSpent).toBe(0)
      expect(summary.metrics.transactionCount).toBe(0)
      expect(summary.metrics.dailyAverage).toBe(0)
      expect(summary.metrics.averageTicket).toBe(0)
      expect(summary.metrics.activeDaysCount).toBe(0)
      expect(summary.topCategories).toEqual([])
      expect(summary.topVendors).toEqual([])
      expect(summary.recentTransactions).toEqual([])
      expect(summary.insights).toHaveLength(1)
      expect(summary.insights[0].title).toBe('Pronto para começar')
    })

    it('accurately computes month metrics, translations, peak day, max expense and deterministic insights', async () => {
      const mockTxs = [
        // Current Month (Sep 2026)
        { id: '1', vendor: 'Carrefour', date: '2026-09-22', category: 'Groceries', total: 100, created_at: '2026-09-22T10:00:00Z' },
        { id: '2', vendor: 'Drogasil', date: '2026-09-21', category: 'Health', total: 50, created_at: '2026-09-21T10:00:00Z' },
        { id: '3', vendor: 'Carrefour', date: '2026-09-05', category: 'Groceries', total: 150, created_at: '2026-09-05T10:00:00Z' },
        // Previous Month (Aug 2026)
        { id: '4', vendor: 'Pão de Açúcar', date: '2026-08-15', category: 'Groceries', total: 200, created_at: '2026-08-15T10:00:00Z' },
      ]

      const chainMock: any = {
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockTxs, error: null }),
          }),
          order: vi.fn().mockResolvedValue({ data: mockTxs, error: null }),
        }),
      }

      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: vi.fn().mockReturnValue(chainMock),
      } as any)

      const { getDashboardSummary } = await import('./queries')
      const summary = await getDashboardSummary({
        periodType: 'month',
        referenceDate: '2026-09-22T12:00:00Z',
      })

      // Current month (100 + 50 + 150 = 300)
      expect(summary.metrics.totalSpent).toBe(300)
      expect(summary.metrics.transactionCount).toBe(3)
      expect(summary.metrics.averageTicket).toBe(100)
      expect(summary.metrics.activeDaysCount).toBe(3)
      expect(summary.metrics.maxExpense?.total).toBe(150)
      expect(summary.metrics.maxExpense?.vendor).toBe('Carrefour')
      expect(summary.metrics.peakDay?.date).toBe('2026-09-05')
      expect(summary.metrics.peakDay?.total).toBe(150)

      // Comparison vs previous month (200) -> Diff +100 (+50%)
      expect(summary.metrics.comparison.previousTotalSpent).toBe(200)
      expect(summary.metrics.comparison.differenceAmount).toBe(100)
      expect(summary.metrics.comparison.differencePercentage).toBe(50)

      // Top categories translated to Portuguese
      expect(summary.topCategories[0].category).toBe('Mercado / Supermercado')
      expect(summary.topCategories[0].total).toBe(250)
      expect(summary.topCategories[0].percentage).toBe(83.3)
      expect(summary.topCategories[1].category).toBe('Saúde & Farmácia')
      expect(summary.topCategories[1].total).toBe(50)

      // Top vendors
      expect(summary.topVendors[0].vendor).toBe('Carrefour')
      expect(summary.topVendors[0].total).toBe(250)
      expect(summary.topVendors[1].vendor).toBe('Drogasil')
      expect(summary.topVendors[1].total).toBe(50)

      // Daily evolution has 30 days for September
      expect(summary.dailyExpenses).toHaveLength(30)
      expect(summary.dailyExpenses.find((d) => d.day === 22)?.total).toBe(100)
      expect(summary.dailyExpenses.find((d) => d.day === 5)?.total).toBe(150)

      // Deterministic insights
      expect(summary.insights.length).toBeGreaterThanOrEqual(3)
      const topCatInsight = summary.insights.find((i) => i.title.includes('Maior concentração'))
      expect(topCatInsight).toBeDefined()
      expect(topCatInsight?.title).toContain('Mercado / Supermercado')
      expect(topCatInsight?.description).toContain('83.3%')
    })

    it('handles week, year, and month navigation offsets correctly', async () => {
      const mockTxs = [
        { id: '1', vendor: 'Amazon', date: '2026-09-22', category: 'Shopping', total: 80, created_at: '2026-09-22T10:00:00Z' },
        { id: '2', vendor: 'Subway', date: '2026-09-18', category: 'Dining', total: 30, created_at: '2026-09-18T10:00:00Z' },
        { id: '3', vendor: 'Steam', date: '2026-08-10', category: 'Entertainment', total: 60, created_at: '2026-08-10T10:00:00Z' },
      ]

      const chainMock: any = {
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockTxs, error: null }),
          }),
          order: vi.fn().mockResolvedValue({ data: mockTxs, error: null }),
        }),
      }

      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: vi.fn().mockReturnValue(chainMock),
      } as any)

      const { getDashboardSummary } = await import('./queries')

      // Week mode (Sep 21-27, 2026 -> only Amazon 80)
      const weekSummary = await getDashboardSummary({
        periodType: 'week',
        referenceDate: '2026-09-22T12:00:00Z',
      })
      expect(weekSummary.metrics.totalSpent).toBe(80)
      expect(weekSummary.metrics.transactionCount).toBe(1)
      expect(weekSummary.topCategories[0].category).toBe('Compras & Vestuário')

      // Month offset -1 (August 2026 -> Steam 60)
      const prevMonthSummary = await getDashboardSummary({
        periodType: 'month',
        monthOffset: -1,
        referenceDate: '2026-09-22T12:00:00Z',
      })
      expect(prevMonthSummary.metrics.totalSpent).toBe(60)
      expect(prevMonthSummary.topVendors[0].vendor).toBe('Steam')

      // Yearly mode (2026 -> 80 + 30 + 60 = 170)
      const yearSummary = await getDashboardSummary({
        periodType: 'year',
        referenceDate: '2026-09-22T12:00:00Z',
      })
      expect(yearSummary.metrics.totalSpent).toBe(170)
      expect(yearSummary.dailyExpenses).toHaveLength(365) // 365 days in 2026
    })

    it('accurately computes totalIncome, totalExpenses, balance, and topIncomeSources', async () => {
      const mockTxs = [
        { id: '1', vendor: 'Empresa XPTO', date: '2026-09-05', category: 'Salário', total: 5000, type: 'income', created_at: '2026-09-05T10:00:00Z' },
        { id: '2', vendor: 'Cliente Freelance', date: '2026-09-12', category: 'Freelance', total: 800, type: 'income', created_at: '2026-09-12T10:00:00Z' },
        { id: '3', vendor: 'Carrefour', date: '2026-09-10', category: 'Groceries', total: 350, type: 'expense', created_at: '2026-09-10T10:00:00Z' },
        { id: '4', vendor: 'Drogasil', date: '2026-09-15', category: 'Health', total: 150, type: 'expense', created_at: '2026-09-15T10:00:00Z' },
      ]

      const chainMock: any = {
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockTxs, error: null }),
          }),
          order: vi.fn().mockResolvedValue({ data: mockTxs, error: null }),
        }),
      }

      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: vi.fn().mockReturnValue(chainMock),
      } as any)

      const { getDashboardSummary } = await import('./queries')
      const summary = await getDashboardSummary({
        periodType: 'month',
        referenceDate: '2026-09-22T12:00:00Z',
      })

      // Income = 5800, Expenses = 500, Balance = 5300
      expect(summary.metrics.totalIncome).toBe(5800)
      expect(summary.metrics.totalExpenses).toBe(500)
      expect(summary.metrics.balance).toBe(5300)
      expect(summary.metrics.incomeTransactionCount).toBe(2)
      expect(summary.metrics.expenseTransactionCount).toBe(2)

      // Expenses metrics only count expense rows
      expect(summary.metrics.totalSpent).toBe(500)
      expect(summary.topCategories[0].category).toBe('Mercado / Supermercado')
      expect(summary.topCategories[0].total).toBe(350)

      // Income sources breakdown
      expect(summary.topIncomeSources).toBeDefined()
      expect(summary.topIncomeSources?.[0].category).toBe('Salário')
      expect(summary.topIncomeSources?.[0].total).toBe(5000)
      expect(summary.topIncomeSources?.[1].category).toBe('Freelance')
      expect(summary.topIncomeSources?.[1].total).toBe(800)

      // Superávit insight
      const balanceInsight = summary.insights.find((i) => i.title.includes('Superávit'))
      expect(balanceInsight).toBeDefined()
    })

    it('computes accountMetrics ranking, expenses, income, net balance, percentages, and handles accountId filtering', async () => {
      const mockAccounts = [
        { id: 'acc-nubank', name: 'Nubank Crédito', type: 'credit_card', institution: 'Nubank', active: true },
        { id: 'acc-itau', name: 'Itaú Corrente', type: 'bank_account', institution: 'Itaú', active: true },
      ]

      const mockTxs = [
        { id: '1', account_id: 'acc-itau', vendor: 'Empresa XPTO', date: '2026-09-05', category: 'Salário', total: 5000, type: 'income', created_at: '2026-09-05T10:00:00Z', accounts: mockAccounts[1] },
        { id: '2', account_id: 'acc-nubank', vendor: 'Carrefour', date: '2026-09-10', category: 'Groceries', total: 300, type: 'expense', created_at: '2026-09-10T10:00:00Z', accounts: mockAccounts[0] },
        { id: '3', account_id: 'acc-itau', vendor: 'Luz & Água', date: '2026-09-15', category: 'Utilities', total: 200, type: 'expense', created_at: '2026-09-15T10:00:00Z', accounts: mockAccounts[1] },
      ]

      const fromMock = vi.fn().mockImplementation((table: string) => {
        if (table === 'accounts') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockAccounts, error: null }),
            }),
          }
        }
        if (table === 'transactions') {
          const txChain: any = {}
          txChain.select = vi.fn().mockReturnValue(txChain)
          txChain.order = vi.fn().mockReturnValue(txChain)
          txChain.or = vi.fn().mockReturnValue(txChain)
          txChain.eq = vi.fn().mockImplementation((col: string, val: any) => {
            if (col === 'account_id') {
              const filtered = mockTxs.filter((t) => t.account_id === val)
              const subChain: any = {}
              subChain.then = (resolve: any) => Promise.resolve({ data: filtered, error: null }).then(resolve)
              return subChain
            }
            return txChain
          })
          txChain.then = (resolve: any) => Promise.resolve({ data: mockTxs, error: null }).then(resolve)
          return txChain
        }
        return {}
      })

      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: fromMock,
      } as any)

      const { getDashboardSummary } = await import('./queries')
      const summary = await getDashboardSummary({
        periodType: 'month',
        referenceDate: '2026-09-22T12:00:00Z',
      })

      // Accounts breakdown
      expect(summary.accountMetrics).toBeDefined()
      expect(summary.accountMetrics.length).toBe(2)

      const itauMetric = summary.accountMetrics.find((a) => a.id === 'acc-itau')
      expect(itauMetric).toBeDefined()
      expect(itauMetric?.totalIncome).toBe(5000)
      expect(itauMetric?.totalExpenses).toBe(200)
      expect(itauMetric?.balance).toBe(4800) // 5000 - 200
      expect(itauMetric?.transactionCount).toBe(2)
      expect(itauMetric?.expensePercentage).toBe(40) // 200 / 500

      const nubankMetric = summary.accountMetrics.find((a) => a.id === 'acc-nubank')
      expect(nubankMetric).toBeDefined()
      expect(nubankMetric?.totalIncome).toBe(0)
      expect(nubankMetric?.totalExpenses).toBe(300)
      expect(nubankMetric?.balance).toBe(-300)
      expect(nubankMetric?.transactionCount).toBe(1)
      expect(nubankMetric?.expensePercentage).toBe(60) // 300 / 500

      // Filtered by specific account (acc-nubank)
      const filteredSummary = await getDashboardSummary({
        periodType: 'month',
        accountId: 'acc-nubank',
        referenceDate: '2026-09-22T12:00:00Z',
      })
      expect(filteredSummary.selectedAccountId).toBe('acc-nubank')
      expect(filteredSummary.metrics.totalExpenses).toBe(300)
      expect(filteredSummary.metrics.totalIncome).toBe(0)
      expect(filteredSummary.accountMetrics).toHaveLength(1)
      expect(filteredSummary.accountMetrics[0].id).toBe('acc-nubank')
    })
  })

  describe('Transaction Type Filtering and Updating', () => {
    function createQueryChainMock(finalResult: { data: any; count?: number; error: any }) {
      const chain: any = {}
      chain.select = vi.fn().mockReturnValue(chain)
      chain.order = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.gt = vi.fn().mockReturnValue(chain)
      chain.not = vi.fn().mockReturnValue(chain)
      chain.is = vi.fn().mockReturnValue(chain)
      chain.ilike = vi.fn().mockReturnValue(chain)
      chain.in = vi.fn().mockReturnValue(chain)
      chain.or = vi.fn().mockReturnValue(chain)
      chain.limit = vi.fn().mockReturnValue(chain)
      chain.range = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: any) => Promise.resolve(finalResult).then(resolve)
      return chain
    }

    it('filters transactions by type = income', async () => {
      const txChain = createQueryChainMock({
        data: [{ id: 'tx-inc-1', total: 5000, type: 'income', category: 'Salário' }],
        count: 1,
        error: null,
      })
      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: vi.fn().mockReturnValue(txChain),
      } as any)

      const res = await listTransactions({ type: 'income' })
      expect(txChain.eq).toHaveBeenCalledWith('type', 'income')
      expect(res.transactions[0].type).toBe('income')
    })

    it('filters transactions by type = expense', async () => {
      const txChain = createQueryChainMock({
        data: [{ id: 'tx-exp-1', total: 100, type: 'expense', category: 'Groceries' }],
        count: 1,
        error: null,
      })
      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: vi.fn().mockReturnValue(txChain),
      } as any)

      const res = await listTransactions({ type: 'expense' })
      expect(txChain.eq).toHaveBeenCalledWith('type', 'expense')
      expect(res.transactions[0].type).toBe('expense')
    })

    it('updates transaction type from expense to income', async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })
      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'tx-1', type: 'income', vendor: 'Freela', total: 800 },
            error: null,
          }),
        }),
      })

      const fromMock = vi.fn().mockImplementation((table: string) => {
        if (table === 'transactions') {
          return { update: updateMock, select: selectMock }
        }
        return { delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }), insert: vi.fn().mockResolvedValue({ error: null }) }
      })

      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({ from: fromMock } as any)

      const { updateTransaction } = await import('./queries')
      const res = await updateTransaction('tx-1', { type: 'income', total: 800 })

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'income', total: 800 })
      )
      expect(res.type).toBe('income')
    })

    it('lists accounts with activeOnly filter and handles null client', async () => {
      const { listAccounts, createAccount } = await import('./queries')
      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue(null)
      const emptyAccounts = await listAccounts()
      expect(emptyAccounts).toHaveLength(3)
      expect(emptyAccounts[0].type).toBe('cash')

      const mockAccount = {
        id: 'acc-1',
        name: 'Nubank',
        type: 'credit_card',
        institution: 'Nubank',
        active: true,
      }
      const accChain = createQueryChainMock({
        data: [mockAccount],
        error: null,
      })
      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: vi.fn().mockReturnValue(accChain),
      } as any)

      const accounts = await listAccounts({ activeOnly: true })
      expect(accChain.eq).toHaveBeenCalledWith('active', true)
      expect(accounts[0].name).toBe('Nubank')
    })

    it('retrieves full account details with stats and transactions avoiding limited list divergence', async () => {
      const { getAccountDetailsWithStats, listAccountsWithStats } = await import('./queries')
      const mockAccount = {
        id: 'acc-card-1',
        name: 'Cartão Nubank',
        type: 'credit_card',
        institution: 'Nubank',
        active: true,
      }

      // Generate 150 transactions belonging to this invoice and future cycles
      const mockTxs: any[] = []
      for (let i = 1; i <= 120; i++) {
        mockTxs.push({
          id: `tx-cur-${i}`,
          account_id: 'acc-card-1',
          type: 'expense',
          total: 10,
          date: '2026-09-02',
          installment_total: null,
          installment_current: null,
          installment_amount: null,
          vendor: `Mercado ${i}`,
          created_at: '2026-09-02T10:00:00Z',
        })
      }
      for (let i = 1; i <= 30; i++) {
        mockTxs.push({
          id: `tx-fut-${i}`,
          account_id: 'acc-card-1',
          type: 'expense',
          total: 20,
          date: '2026-09-20', // after closing day (5) -> future invoice
          installment_total: null,
          installment_current: null,
          installment_amount: null,
          vendor: `Futuro ${i}`,
          created_at: '2026-09-20T10:00:00Z',
        })
      }

      const accSingleMock = vi.fn().mockResolvedValue({
        data: mockAccount,
        error: null,
      })
      const accSelectMock = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ single: accSingleMock }),
        }),
      }

      const txChain = createQueryChainMock({
        data: mockTxs,
        error: null,
      })

      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'accounts') return accSelectMock
          if (table === 'transactions') return txChain
          return createQueryChainMock({ data: [], error: null })
        }),
      } as any)

      const details = await getAccountDetailsWithStats('acc-card-1', '2026-09-03')
      expect(details).not.toBeNull()
      expect(details!.id).toBe('acc-card-1')
      expect(details!.transactions).toHaveLength(150)
      expect(details!.transactionCount).toBe(150)
      // 120 current txs * 10 = 1200
      expect(details!.currentMonthExpenses).toBe(1200)
      // 30 future txs * 20 = 600
      expect(details!.futureInstallmentsTotal).toBe(600)
      expect(details!.futureInstallmentsCount).toBe(30)
    })

    it('creates a new account successfully', async () => {
      const { createAccount } = await import('./queries')
      const mockAccount = {
        id: 'acc-2',
        name: 'Carteira Dinheiro',
        type: 'cash',
        active: true,
      }
      const singleMock = vi.fn().mockResolvedValue({
        data: mockAccount,
        error: null,
      })
      const selectMock = vi.fn().mockReturnValue({ single: singleMock })
      const insertMock = vi.fn().mockReturnValue({ select: selectMock })
      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: vi.fn().mockReturnValue({ insert: insertMock }),
      } as any)

      const created = await createAccount({
        name: 'Carteira Dinheiro',
        type: 'cash',
      })
      expect(created.name).toBe('Carteira Dinheiro')
      expect(created.type).toBe('cash')
    })

    it('filters transactions by accountId', async () => {
      const txChain = createQueryChainMock({
        data: [{ id: 'tx-acc-1', total: 45, account_id: 'acc-123', accounts: { id: 'acc-123', name: 'Nubank', type: 'credit_card' } }],
        count: 1,
        error: null,
      })
      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: vi.fn().mockReturnValue(txChain),
      } as any)

      const res = await listTransactions({ accountId: 'acc-123' })
      expect(txChain.eq).toHaveBeenCalledWith('account_id', 'acc-123')
      expect(res.transactions[0].account_id).toBe('acc-123')
      expect(res.transactions[0].accounts?.name).toBe('Nubank')
    })

    it('updates transaction account_id', async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })
      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'tx-1', account_id: 'acc-999', total: 100 },
            error: null,
          }),
        }),
      })
      const fromMock = vi.fn().mockImplementation((table: string) => {
        if (table === 'transactions') return { update: updateMock, select: selectMock }
        return { delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }), insert: vi.fn().mockResolvedValue({ error: null }) }
      })
      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({ from: fromMock } as any)

      const { updateTransaction } = await import('./queries')
      const res = await updateTransaction('tx-1', { account_id: 'acc-999' })
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ account_id: 'acc-999' })
      )
      expect(res.account_id).toBe('acc-999')
    })

    it('filters transactions by recurrence and installments', async () => {
      const txChain = createQueryChainMock({
        data: [
          { id: 'tx-rec-1', is_recurring: true, recurrence_frequency: 'monthly', recurrence_status: 'active', total: 120 },
        ],
        count: 1,
        error: null,
      })
      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: vi.fn().mockReturnValue(txChain),
      } as any)

      const resRec = await listTransactions({ isRecurring: true, recurrenceStatus: 'active' })
      expect(txChain.eq).toHaveBeenCalledWith('is_recurring', true)
      expect(txChain.eq).toHaveBeenCalledWith('recurrence_status', 'active')
      expect(resRec.transactions[0].is_recurring).toBe(true)

      const instChain = createQueryChainMock({
        data: [
          { id: 'tx-inst-1', installment_current: 2, installment_total: 6, installment_amount: 50, total: 50 },
        ],
        count: 1,
        error: null,
      })
      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: vi.fn().mockReturnValue(instChain),
      } as any)

      const resInst = await listTransactions({ isInstallment: true })
      expect(instChain.gt).toHaveBeenCalledWith('installment_total', 1)
      expect(resInst.transactions[0].installment_total).toBe(6)
    })

    it('updates transaction recurrence and installment fields', async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })
      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'tx-1',
              is_recurring: true,
              recurrence_frequency: 'monthly',
              recurrence_next_date: '2026-10-15',
              recurrence_status: 'active',
              installment_current: 1,
              installment_total: 10,
              installment_amount: 150,
            },
            error: null,
          }),
        }),
      })
      const fromMock = vi.fn().mockImplementation((table: string) => {
        if (table === 'transactions') return { update: updateMock, select: selectMock }
        return { delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }), insert: vi.fn().mockResolvedValue({ error: null }) }
      })
      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({ from: fromMock } as any)

      const { updateTransaction } = await import('./queries')
      const res = await updateTransaction('tx-1', {
        is_recurring: true,
        recurrence_frequency: 'monthly',
        recurrence_next_date: '2026-10-15',
        recurrence_status: 'active',
        installment_current: 1,
        installment_total: 10,
        installment_amount: 150,
      })

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          is_recurring: true,
          recurrence_frequency: 'monthly',
          recurrence_next_date: '2026-10-15',
          recurrence_status: 'active',
          installment_current: 1,
          installment_total: 10,
          installment_amount: 150,
        })
      )
      expect(res.is_recurring).toBe(true)
      expect(res.installment_total).toBe(10)
    })

    it('calculates 30-day forecast for recurring expenses and upcoming installments in getDashboardSummary', async () => {
      const txMockData = [
        {
          id: 'tx-rec-1',
          type: 'expense',
          total: 120,
          date: '2026-09-10',
          created_at: '2026-09-10T10:00:00Z',
          vendor: 'Netflix',
          category: 'Streaming',
          is_recurring: true,
          recurrence_frequency: 'monthly',
          recurrence_status: 'active',
          recurrence_next_date: '2026-10-10',
          accounts: { id: 'acc-1', name: 'Nubank', type: 'credit_card' },
        },
        {
          id: 'tx-rec-ended',
          type: 'expense',
          total: 80,
          date: '2026-09-01',
          created_at: '2026-09-01T10:00:00Z',
          vendor: 'Gym Antiga',
          category: 'Saúde',
          is_recurring: true,
          recurrence_frequency: 'monthly',
          recurrence_status: 'ended',
        },
        {
          id: 'tx-inst-1',
          type: 'expense',
          total: 200,
          date: '2026-10-15',
          created_at: '2026-09-15T10:00:00Z',
          vendor: 'Notebook Dell',
          category: 'Tecnologia',
          installment_group_id: 'grp-dell',
          installment_current: 4,
          installment_total: 10,
          installment_amount: 200,
          accounts: { id: 'acc-1', name: 'Nubank', type: 'credit_card' },
        },
      ]

      const txChain = createQueryChainMock({
        data: txMockData,
        error: null,
      })

      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: vi.fn().mockReturnValue(txChain),
      } as any)

      const { getDashboardSummary } = await import('./queries')
      const summary = await getDashboardSummary({ periodType: 'month', referenceDate: new Date('2026-09-22T12:00:00Z') })

      expect(summary.recurringTotal30Days).toBe(120)
      expect(summary.installmentsTotal30Days).toBe(200)
      expect(summary.forecastTotal30Days).toBe(320)
      expect(summary.upcomingRecurring).toHaveLength(1)
      expect(summary.upcomingRecurring[0].vendor).toBe('Netflix')
      expect(summary.upcomingInstallments).toHaveLength(1)
      expect(summary.upcomingInstallments[0].vendor).toBe('Notebook Dell')
      expect(summary.upcomingInstallments[0].installmentInfo?.current).toBe(4)
      expect(summary.upcomingInstallments[0].installmentInfo?.total).toBe(10)
    })
  })

  describe('Canonical Products Identity & Normalization', () => {
    it('normalizes different aliases of the same product into the same canonical identity', async () => {
      const { parseProductDescription } = await import('./canonical')

      const variant1 = parseProductDescription('MAC ESPAG BARILLA 500G')
      const variant2 = parseProductDescription('Barilla Espaguete 500g')
      const variant3 = parseProductDescription('MACARRAO ESPAGUETE BARILLA 500 G')

      // All should identify Barilla, 500g, and Espaguete
      expect(variant1.brand).toBe('Barilla')
      expect(variant1.unitSize).toBe('500g')
      expect(variant1.normalizedKey).toBe(variant2.normalizedKey)
      expect(variant2.normalizedKey).toBe(variant3.normalizedKey)
      expect(variant1.normalizedKey).toBe('espaguete:barilla:500g')
    })

    it('does NOT merge products that have different brands, sizes, or types', async () => {
      const { parseProductDescription } = await import('./canonical')

      const barilla500g = parseProductDescription('Barilla Espaguete 500g')
      const barilla1kg = parseProductDescription('Barilla Espaguete 1kg')
      const adria500g = parseProductDescription('Adria Espaguete 500g')
      const barillaPenne = parseProductDescription('Barilla Penne 500g')

      // Different sizes must not match
      expect(barilla500g.normalizedKey).not.toBe(barilla1kg.normalizedKey)
      expect(barilla500g.unitSize).toBe('500g')
      expect(barilla1kg.unitSize).toBe('1kg')

      // Different brands must not match
      expect(barilla500g.normalizedKey).not.toBe(adria500g.normalizedKey)
      expect(barilla500g.brand).toBe('Barilla')
      expect(adria500g.brand).toBe('Adria')

      // Different pasta types must not match
      expect(barilla500g.normalizedKey).not.toBe(barillaPenne.normalizedKey)
    })

    it('extracts brands and standardizes units (e.g. 1000g -> 1kg, 1000ml -> 1l, lit -> l)', async () => {
      const { parseProductDescription } = await import('./canonical')

      const leite1 = parseProductDescription('LEIT INT PIRACANJUBA 1000ML')
      const leite2 = parseProductDescription('Leite Integral Piracanjuba 1L')
      const arroz1 = parseProductDescription('ARR TIO JOAO 1000G')
      const arroz2 = parseProductDescription('Arroz Tio João 1kg')

      expect(leite1.normalizedKey).toBe(leite2.normalizedKey)
      expect(leite1.brand).toBe('Piracanjuba')
      expect(leite1.unitSize).toBe('1l')

      expect(arroz1.normalizedKey).toBe(arroz2.normalizedKey)
      expect(arroz1.brand).toBe('Tio João')
      expect(arroz1.unitSize).toBe('1kg')
    })
  })

  describe('Transactions Pagination & Global Search Suite', () => {
    it('calculates has_more correctly for pagination with offset and limit', async () => {
      const mockRows = Array.from({ length: 50 }, (_, i) => ({
        id: `tx-${i}`,
        vendor: `Store ${i}`,
        total: 10,
        type: 'expense',
      }))

      const selectMock = vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          range: vi.fn().mockResolvedValue({
            data: mockRows,
            count: 123,
            error: null,
          }),
        }),
      })

      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'transactions') return { select: selectMock }
          if (table === 'categories') return { select: vi.fn().mockResolvedValue({ data: [], error: null }) }
          return { select: vi.fn().mockResolvedValue({ data: [], error: null }) }
        },
      } as any)

      // Page 1: offset=0, limit=50 of 123 -> has_more=true
      const page1 = await listTransactions({ offset: 0, limit: 50 })
      expect(page1.transactions).toHaveLength(50)
      expect(page1.total_count).toBe(123)
      expect(page1.has_more).toBe(true)

      // Page 3: offset=100, limit=50 with 23 rows returned -> has_more=false
      selectMock.mockReturnValue({
        order: vi.fn().mockReturnValue({
          range: vi.fn().mockResolvedValue({
            data: mockRows.slice(0, 23),
            count: 123,
            error: null,
          }),
        }),
      })

      const page3 = await listTransactions({ offset: 100, limit: 50 })
      expect(page3.transactions).toHaveLength(23)
      expect(page3.total_count).toBe(123)
      expect(page3.has_more).toBe(false)
    })

    it('executes global search across vendor, category, notes, canonical vendor and items', async () => {
      const orMock = vi.fn().mockResolvedValue({
        data: [
          { id: 'tx-match-1', vendor: 'Supermercado Dia', total: 55, category: 'Mercado', type: 'expense' },
        ],
        count: 1,
        error: null,
      })

      const queryChain = {
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        or: orMock,
      }

      vi.spyOn(persistModule, 'getSupabaseClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'transactions') return { select: vi.fn().mockReturnValue(queryChain) }
          if (table === 'canonical_products') return { select: vi.fn().mockReturnValue({ or: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
          if (table === 'transaction_items') return { select: vi.fn().mockReturnValue({ or: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
          if (table === 'canonical_vendors') return { select: vi.fn().mockReturnValue({ or: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
          if (table === 'categories') return { select: vi.fn().mockResolvedValue({ data: [], error: null }) }
          return { select: vi.fn().mockResolvedValue({ data: [], error: null }) }
        },
      } as any)

      const searchRes = await listTransactions({ search: 'Supermercado' })
      expect(searchRes.transactions).toHaveLength(1)
      expect(searchRes.transactions[0].vendor).toBe('Supermercado Dia')
      expect(orMock).toHaveBeenCalled()
      const searchConditionArg = orMock.mock.calls[0][0]
      expect(searchConditionArg).toContain('vendor.ilike.%Supermercado%')
      expect(searchConditionArg).toContain('category.ilike.%Supermercado%')
      expect(searchConditionArg).toContain('notes.ilike.%Supermercado%')
    })
  })
})

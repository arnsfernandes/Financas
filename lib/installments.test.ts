import { describe, it, expect, vi, beforeEach } from 'vitest'
import { save, setSupabaseClientForTesting, DuplicateTransactionError } from './persist'
import { listTransactions, updateTransaction, deleteTransaction, getDashboardSummary } from './queries'
import { detectDuplicateTransaction } from './duplicate'
import { addMonthsToDate } from './dateUtils'
import type { Receipt } from './schema'
import {
  parseInstallmentFromText,
  resolveInstallmentPlan,
  generateInstallmentDates,
  buildFutureInstallmentRows,
} from './installments'

describe('Real Installments in Database', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setSupabaseClientForTesting(null)
  })

  describe('addMonthsToDate utility', () => {
    it('increments monthly dates correctly', () => {
      expect(addMonthsToDate('2026-09-23', 1)).toBe('2026-10-23')
      expect(addMonthsToDate('2026-09-23', 2)).toBe('2026-11-23')
      expect(addMonthsToDate('2026-09-23', 3)).toBe('2026-12-23')
    })

    it('crosses year boundaries accurately', () => {
      expect(addMonthsToDate('2026-10-15', 3)).toBe('2027-01-15')
      expect(addMonthsToDate('2026-11-20', 2)).toBe('2027-01-20')
      expect(addMonthsToDate('2026-11-20', 14)).toBe('2028-01-20')
    })

    it('clamps end-of-month days properly for shorter months (e.g., Jan 31 -> Feb 28/29)', () => {
      expect(addMonthsToDate('2026-01-31', 1)).toBe('2026-02-28')
      expect(addMonthsToDate('2026-03-31', 1)).toBe('2026-04-30')
      expect(addMonthsToDate('2026-05-31', 1)).toBe('2026-06-30')
    })
  })

  describe('3x Installment creation', () => {
    it('creates 3 individual transactions sharing installment_group_id with sequential monthly dates and split amounts', async () => {
      const insertedRows: any[] = []
      const insertedItems: any[] = []

      const mockSupabase: any = {
        from: (table: string) => {
          if (table === 'transactions') {
            return {
              select: () => ({
                eq: () => ({
                  limit: () => ({ data: [], error: null }),
                }),
                gte: () => ({
                  lte: () => ({
                    or: () => ({ data: [], error: null }),
                  }),
                }),
              }),
              insert: vi.fn().mockImplementation((rows: any) => {
                if (Array.isArray(rows)) {
                  insertedRows.push(...rows)
                } else {
                  insertedRows.push(rows)
                }
                return { error: null }
              }),
            }
          }
          if (table === 'canonical_vendors') {
            return {
              select: () => ({
                eq: () => ({ single: () => ({ data: null, error: null }) }),
                or: () => ({ data: [], error: null }),
              }),
              insert: () => ({ select: () => ({ single: () => ({ data: { id: 'v-fast' }, error: null }) }) }),
            }
          }
          if (table === 'transaction_items') {
            return {
              insert: vi.fn().mockImplementation((items: any[]) => {
                insertedItems.push(...items)
                return { error: null }
              }),
            }
          }
          if (table === 'canonical_products') {
            return {
              select: () => ({
                or: () => ({ data: [], error: null }),
              }),
              insert: () => ({ select: () => ({ single: () => ({ data: { id: 'p-1' }, error: null }) }) }),
            }
          }
          return {}
        },
      }

      setSupabaseClientForTesting(mockSupabase)

      const receipt: Receipt = {
        type: 'expense',
        vendor: 'Fast Shop',
        vendor_address: null,
        date: '2026-09-23',
        time: '14:00',
        currency: 'BRL',
        category: 'Eletrônicos',
        subtotal: 300,
        tax: 0,
        tip: 0,
        total: 300,
        payment_method: 'Cartão de Crédito',
        notes: null,
        installment_total: 3,
        items: [
          { description: 'Fone Bluetooth', quantity: 1, unit_price: 300, total: 300, category: 'Eletrônicos' },
        ],
      }

      const stored = await save({
        receipt,
        imageKey: 'r2/fastshop.jpg',
        imageSha256: 'sha-fast-300',
        allowDuplicate: true,
      })

      expect(insertedRows).toHaveLength(3)

      // Check single group id
      const groupId = insertedRows[0].installment_group_id
      expect(groupId).toBeDefined()
      expect(stored.installment_group_id).toBe(groupId)

      expect(insertedRows[0].installment_group_id).toBe(groupId)
      expect(insertedRows[1].installment_group_id).toBe(groupId)
      expect(insertedRows[2].installment_group_id).toBe(groupId)

      // Check current numbers and totals
      expect(insertedRows[0].installment_current).toBe(1)
      expect(insertedRows[0].installment_total).toBe(3)
      expect(insertedRows[0].total).toBe(100)
      expect(insertedRows[0].date).toBe('2026-09-23')
      expect(insertedRows[0].image_key).toBe('r2/fastshop.jpg')
      expect(insertedRows[0].image_sha256).toBe('sha-fast-300')

      expect(insertedRows[1].installment_current).toBe(2)
      expect(insertedRows[1].installment_total).toBe(3)
      expect(insertedRows[1].total).toBe(100)
      expect(insertedRows[1].date).toBe('2026-10-23')
      expect(insertedRows[1].image_key).toBeNull()
      expect(insertedRows[1].image_sha256).toBeNull()

      expect(insertedRows[2].installment_current).toBe(3)
      expect(insertedRows[2].installment_total).toBe(3)
      expect(insertedRows[2].total).toBe(100)
      expect(insertedRows[2].date).toBe('2026-11-23')
      expect(insertedRows[2].image_key).toBeNull()
      // Items are attached only to installment 1 (the purchase event) to prevent inflating occurrences, average price, and item reports
      expect(insertedItems).toHaveLength(1)
      expect(insertedItems[0].transaction_id).toBe(insertedRows[0].id)
      expect(insertedItems[0].description).toBe('Fone Bluetooth')
      expect(insertedItems[0].total).toBe(300)
    })
  })

  describe('12x Installment creation across year boundary', () => {
    it('creates 12 sequential monthly transactions spanning into next year', async () => {
      const insertedRows: any[] = []

      const mockSupabase: any = {
        from: (table: string) => {
          if (table === 'transactions') {
            return {
              select: () => ({
                eq: () => ({ limit: () => ({ data: [], error: null }) }),
                gte: () => ({ lte: () => ({ or: () => ({ data: [], error: null }) }) }),
              }),
              insert: vi.fn().mockImplementation((rows: any) => {
                if (Array.isArray(rows)) {
                  insertedRows.push(...rows)
                } else {
                  insertedRows.push(rows)
                }
                return { error: null }
              }),
            }
          }
          if (table === 'canonical_vendors') {
            return {
              select: () => ({ eq: () => ({ single: () => ({ data: null, error: null }) }), or: () => ({ data: [], error: null }) }),
              insert: () => ({ select: () => ({ single: () => ({ data: { id: 'v-apple' }, error: null }) }) }),
            }
          }
          if (table === 'transaction_items') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            }
          }
          return {}
        },
      }

      setSupabaseClientForTesting(mockSupabase)

      const receipt: Receipt = {
        type: 'expense',
        vendor: 'Apple Store',
        vendor_address: null,
        date: '2026-11-15',
        time: null,
        currency: 'BRL',
        category: 'Eletrônicos',
        subtotal: 12000,
        tax: 0,
        tip: 0,
        total: 12000,
        payment_method: 'Cartão de Crédito',
        notes: null,
        installment_total: 12,
        installment_amount: 1000,
        items: [],
      }

      await save({
        receipt,
        imageKey: null,
        imageSha256: null,
        allowDuplicate: true,
      })

      expect(insertedRows).toHaveLength(12)

      const groupId = insertedRows[0].installment_group_id
      expect(groupId).toBeDefined()

      const expectedDates = [
        '2026-11-15',
        '2026-12-15',
        '2027-01-15',
        '2027-02-15',
        '2027-03-15',
        '2027-04-15',
        '2027-05-15',
        '2027-06-15',
        '2027-07-15',
        '2027-08-15',
        '2027-09-15',
        '2027-10-15',
      ]

      for (let i = 0; i < 12; i++) {
        expect(insertedRows[i].installment_group_id).toBe(groupId)
        expect(insertedRows[i].installment_current).toBe(i + 1)
        expect(insertedRows[i].installment_total).toBe(12)
        expect(insertedRows[i].total).toBe(1000)
        expect(insertedRows[i].date).toBe(expectedDates[i])
      }
    })

    it('performs atomic cleanup and throws if batch insertion fails', async () => {
      const deletedGroupIds: string[] = []
      const mockSupabase: any = {
        from: (table: string) => {
          if (table === 'transactions') {
            return {
              select: () => ({
                eq: () => ({ limit: () => ({ data: [], error: null }) }),
                gte: () => ({ lte: () => ({ or: () => ({ data: [], error: null }) }) }),
              }),
              insert: vi.fn().mockResolvedValue({
                error: { message: 'Database connection lost during batch insert' },
              }),
              delete: () => ({
                eq: (col: string, val: any) => {
                  if (col === 'installment_group_id') {
                    deletedGroupIds.push(val)
                  }
                  return Promise.resolve({ error: null })
                },
              }),
            }
          }
          if (table === 'canonical_vendors') {
            return {
              select: () => ({ eq: () => ({ single: () => ({ data: null, error: null }) }), or: () => ({ data: [], error: null }) }),
              insert: () => ({ select: () => ({ single: () => ({ data: { id: 'v-1' }, error: null }) }) }),
            }
          }
          return {}
        },
      }

      setSupabaseClientForTesting(mockSupabase)

      const receipt: Receipt = {
        type: 'expense',
        vendor: 'Loja Teste',
        vendor_address: null,
        date: '2026-09-23',
        time: null,
        currency: 'BRL',
        category: null,
        subtotal: null,
        tax: null,
        tip: null,
        total: 600,
        payment_method: null,
        notes: null,
        installment_total: 3,
        items: [],
      }

      await expect(
        save({
          receipt,
          imageKey: null,
          imageSha256: null,
          allowDuplicate: true,
        })
      ).rejects.toThrow('Database connection lost during batch insert')

      expect(deletedGroupIds).toHaveLength(1)
    })
  })

  describe('Duplicate Detection & Idempotency', () => {
    it('prevents generating duplicate installments if image_sha256 matches', async () => {
      const mockSupabase: any = {
        from: (table: string) => {
          if (table === 'transactions') {
            return {
              select: () => ({
                eq: (col: string, val: any) => {
                  if (col === 'image_sha256' && val === 'sha256-already-scanned') {
                    return {
                      limit: () => ({
                        data: [{ id: 'tx-old-1', date: '2026-09-23', vendor: 'Casas Bahia', total: 100 }],
                        error: null,
                      }),
                    }
                  }
                  return { limit: () => ({ data: [], error: null }) }
                },
              }),
            }
          }
          return {}
        },
      }

      setSupabaseClientForTesting(mockSupabase)

      const receipt: Receipt = {
        type: 'expense',
        vendor: 'Casas Bahia',
        vendor_address: null,
        date: '2026-09-23',
        time: null,
        currency: 'BRL',
        category: null,
        subtotal: null,
        tax: null,
        tip: null,
        total: 1000,
        payment_method: null,
        notes: null,
        installment_total: 10,
        items: [],
      }

      await expect(
        save({
          receipt,
          imageKey: 'img.jpg',
          imageSha256: 'sha256-already-scanned',
          allowDuplicate: false,
        })
      ).rejects.toThrow(DuplicateTransactionError)
    })

    it('prevents generating duplicate installments if installment_group_id already exists', async () => {
      const existingGroupId = 'existing-group-uuid-123'
      const mockSupabase: any = {
        from: (table: string) => {
          if (table === 'transactions') {
            return {
              select: () => ({
                eq: (col: string, val: any) => {
                  if (col === 'installment_group_id' && val === existingGroupId) {
                    return {
                      limit: () => ({
                        data: [{ id: 'tx-inst-1', date: '2026-09-23', vendor: 'Casas Bahia', total: 100 }],
                        error: null,
                      }),
                    }
                  }
                  return { limit: () => ({ data: [], error: null }) }
                },
              }),
            }
          }
          return {}
        },
      }

      const dup = await detectDuplicateTransaction(
        {
          receipt: {
            type: 'expense',
            vendor: 'Casas Bahia',
            vendor_address: null,
            date: '2026-09-23',
            time: null,
            currency: 'BRL',
            category: null,
            subtotal: null,
            tax: null,
            tip: null,
            total: 100,
            payment_method: null,
            notes: null,
            installment_group_id: existingGroupId,
            installment_total: 10,
            items: [],
          },
        },
        mockSupabase
      )

      expect(dup.isDuplicate).toBe(true)
      expect(dup.type).toBe('exact')
      expect(dup.reason).toContain('Este grupo de parcelamento já foi cadastrado anteriormente')
    })
  })

  describe('Editing and Deleting individual installments', () => {
    it('deleting an installment deletes only that single transaction ID', async () => {
      const deleteEqMock = vi.fn().mockResolvedValue({ error: null })
      const deleteMock = vi.fn().mockReturnValue({ eq: deleteEqMock })
      const fromMock = vi.fn().mockReturnValue({ delete: deleteMock })

      setSupabaseClientForTesting({ from: fromMock } as any)

      const res = await deleteTransaction('tx-installment-3')
      expect(res).toBe(true)
      expect(fromMock).toHaveBeenCalledWith('transactions')
      expect(deleteMock).toHaveBeenCalledOnce()
      expect(deleteEqMock).toHaveBeenCalledWith('id', 'tx-installment-3')
    })

    it('editing an installment updates only that single transaction row', async () => {
      const updateEqMock = vi.fn().mockResolvedValue({ error: null })
      const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock })
      const singleMock = vi.fn().mockResolvedValue({
        data: {
          id: 'tx-installment-2',
          vendor: 'Magazine Luiza (Ajustado)',
          total: 120,
          installment_group_id: 'grp-xyz',
          installment_current: 2,
          installment_total: 5,
        },
        error: null,
      })
      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ single: singleMock }),
      })

      const fromMock = vi.fn().mockImplementation((table: string) => {
        if (table === 'transactions') {
          return { update: updateMock, select: selectMock }
        }
        return {}
      })

      setSupabaseClientForTesting({ from: fromMock } as any)

      const res = await updateTransaction('tx-installment-2', {
        vendor: 'Magazine Luiza (Ajustado)',
        total: 120,
      })

      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
        vendor: 'Magazine Luiza (Ajustado)',
        total: 120,
      }))
      expect(updateEqMock).toHaveBeenCalledWith('id', 'tx-installment-2')
      expect(res.id).toBe('tx-installment-2')
      expect(res.total).toBe(120)
    })
  })

  describe('Dashboard and Queries with real installments', () => {
    it('filters transactions by installmentGroupId', async () => {
      const eqMock = vi.fn().mockReturnValue({
        order: () => ({
          range: () => Promise.resolve({ data: [{ id: 'tx-1' }, { id: 'tx-2' }], count: 2, error: null }),
        }),
      })

      const selectMock = vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          eq: eqMock,
        }),
      })

      const fromMock = vi.fn().mockReturnValue({ select: selectMock })
      setSupabaseClientForTesting({ from: fromMock } as any)

      await listTransactions({ installmentGroupId: 'grp-123' })
      expect(eqMock).toHaveBeenCalledWith('installment_group_id', 'grp-123')
    })

    it('includes real future installments in dashboard upcoming commitments', async () => {
      const mockSupabase: any = {
        from: (table: string) => {
          if (table === 'accounts') {
            return {
              select: () => ({
                order: () => Promise.resolve({
                  data: [{ id: 'acc-1', name: 'Nubank', type: 'credit_card', institution: 'Nubank', active: true }],
                  error: null,
                }),
              }),
            }
          }
          if (table === 'transactions') {
            return {
              select: () => ({
                or: () => ({
                  order: () => Promise.resolve({
                    data: [
                      // Installment 1 (today)
                      {
                        id: 'tx-inst-1',
                        type: 'expense',
                        account_id: 'acc-1',
                        vendor: 'Mercado Livre',
                        date: '2026-09-23',
                        total: 100,
                        installment_group_id: 'grp-ml',
                        installment_current: 1,
                        installment_total: 3,
                        installment_amount: 100,
                        created_at: '2026-09-23T10:00:00Z',
                      },
                      // Installment 2 (in 20 days: 2026-10-13)
                      {
                        id: 'tx-inst-2',
                        type: 'expense',
                        account_id: 'acc-1',
                        vendor: 'Mercado Livre',
                        date: '2026-10-13',
                        total: 100,
                        installment_group_id: 'grp-ml',
                        installment_current: 2,
                        installment_total: 3,
                        installment_amount: 100,
                        created_at: '2026-09-23T10:00:00Z',
                      },
                      // Installment 3 (in 50 days: 2026-11-13 - outside 30-day forecast)
                      {
                        id: 'tx-inst-3',
                        type: 'expense',
                        account_id: 'acc-1',
                        vendor: 'Mercado Livre',
                        date: '2026-11-13',
                        total: 100,
                        installment_group_id: 'grp-ml',
                        installment_current: 3,
                        installment_total: 3,
                        installment_amount: 100,
                        created_at: '2026-09-23T10:00:00Z',
                      },
                    ],
                    error: null,
                  }),
                }),
                order: () => Promise.resolve({
                  data: [
                    // Installment 1 (today)
                    {
                      id: 'tx-inst-1',
                      type: 'expense',
                      account_id: 'acc-1',
                      vendor: 'Mercado Livre',
                      date: '2026-09-23',
                      total: 100,
                      installment_group_id: 'grp-ml',
                      installment_current: 1,
                      installment_total: 3,
                      installment_amount: 100,
                      created_at: '2026-09-23T10:00:00Z',
                    },
                    // Installment 2 (in 20 days: 2026-10-13)
                    {
                      id: 'tx-inst-2',
                      type: 'expense',
                      account_id: 'acc-1',
                      vendor: 'Mercado Livre',
                      date: '2026-10-13',
                      total: 100,
                      installment_group_id: 'grp-ml',
                      installment_current: 2,
                      installment_total: 3,
                      installment_amount: 100,
                      created_at: '2026-09-23T10:00:00Z',
                    },
                    // Installment 3 (in 50 days: 2026-11-13 - outside 30-day forecast)
                    {
                      id: 'tx-inst-3',
                      type: 'expense',
                      account_id: 'acc-1',
                      vendor: 'Mercado Livre',
                      date: '2026-11-13',
                      total: 100,
                      installment_group_id: 'grp-ml',
                      installment_current: 3,
                      installment_total: 3,
                      installment_amount: 100,
                      created_at: '2026-09-23T10:00:00Z',
                    },
                  ],
                  error: null,
                }),
              }),
            }
          }
          return {}
        },
      }

      setSupabaseClientForTesting(mockSupabase)

      const summary = await getDashboardSummary({
        periodType: 'month',
        referenceDate: '2026-09-23',
      })

      expect(summary.upcomingCommitments.upcomingInstallments).toHaveLength(1)
      expect(summary.upcomingCommitments.upcomingInstallments[0].installmentInfo?.current).toBe(2)
      expect(summary.upcomingCommitments.installmentsTotal30Days).toBe(100)
    })
  })

  describe('Installment Domain Module (lib/installments)', () => {
    describe('parseInstallmentFromText', () => {
      it('parses "parcelado em 3x" and "4x sem juros"', () => {
        expect(parseInstallmentFromText('Compra no cartão parcelado em 3x')).toEqual({ total: 3, current: 1, anchor: 'purchase_date' })
        expect(parseInstallmentFromText('Loja ABC 4x sem juros')).toEqual({ total: 4, current: 1, anchor: 'purchase_date' })
        expect(parseInstallmentFromText('Pagamento à vista')).toBeNull()
      })
    })

    describe('resolveInstallmentPlan - single rule of truth', () => {
      it('resolves 300 em 3x into 3 installments of 100 with total purchase of 300', () => {
        const plan = resolveInstallmentPlan({
          total: 300,
          installmentTotal: 3,
        })
        expect(plan.isMultiInstallment).toBe(true)
        expect(plan.installmentTotal).toBe(3)
        expect(plan.installmentAmount).toBe(100)
        expect(plan.totalPurchaseAmount).toBe(300)
        expect(plan.installmentGroupId).toBeDefined()
      })

      it('resolves 480 em 4x into 4 installments of 120 with total purchase of 480', () => {
        const plan = resolveInstallmentPlan({
          total: 480,
          installmentTotal: 4,
        })
        expect(plan.isMultiInstallment).toBe(true)
        expect(plan.installmentTotal).toBe(4)
        expect(plan.installmentAmount).toBe(120)
        expect(plan.totalPurchaseAmount).toBe(480)
      })

      it('does NOT divide again when total already represents individual installment (conference screen / 120 for 4x)', () => {
        // Case 1: explicit installmentAmount is provided as 120
        const planWithAmount = resolveInstallmentPlan({
          total: 120,
          installmentAmount: 120,
          installmentTotal: 4,
        })
        expect(planWithAmount.installmentAmount).toBe(120)
        expect(planWithAmount.totalPurchaseAmount).toBe(480)

        // Case 2: subtotal 480 is provided and total matches 480 / 4
        const planWithSubtotal = resolveInstallmentPlan({
          total: 120,
          subtotal: 480,
          installmentTotal: 4,
        })
        expect(planWithSubtotal.installmentAmount).toBe(120)
        expect(planWithSubtotal.totalPurchaseAmount).toBe(480)
      })

      it('falls back to notes/vendor when installmentTotal is not explicitly set', () => {
        const plan = resolveInstallmentPlan({
          total: 600,
          notes: 'parcelado em 3x',
        })
        expect(plan.isMultiInstallment).toBe(true)
        expect(plan.installmentTotal).toBe(3)
        expect(plan.installmentAmount).toBe(200)
        expect(plan.totalPurchaseAmount).toBe(600)
      })
    })

    describe('generateInstallmentDates - explicit date anchors', () => {
      it('generates chronological dates for each installment', () => {
        const dates = generateInstallmentDates('2026-09-23', 3, 1)
        expect(dates).toEqual([
          { installmentCurrent: 1, date: '2026-09-23' },
          { installmentCurrent: 2, date: '2026-10-23' },
          { installmentCurrent: 3, date: '2026-11-23' },
        ])
      })

      it('case 1: primeira parcela 26/06/2026, current=4, total=6, anchor=purchase_date -> 1/6 Junho, 2/6 Julho, 3/6 Agosto, 4/6 Setembro, 5/6 Outubro, 6/6 Novembro', () => {
        const dates = generateInstallmentDates('2026-06-26', 6, 4, 'purchase_date')
        expect(dates).toHaveLength(6)
        expect(dates).toEqual([
          { installmentCurrent: 1, date: '2026-06-26' },
          { installmentCurrent: 2, date: '2026-07-26' },
          { installmentCurrent: 3, date: '2026-08-26' },
          { installmentCurrent: 4, date: '2026-09-26' },
          { installmentCurrent: 5, date: '2026-10-26' },
          { installmentCurrent: 6, date: '2026-11-26' },
        ])
      })

      it('case 2: data da parcela atual 26/09/2026, current=4, total=6, anchor=current_installment -> produces EXACTLY the same sequence', () => {
        const dates = generateInstallmentDates('2026-09-26', 6, 4, 'current_installment')
        expect(dates).toHaveLength(6)
        expect(dates).toEqual([
          { installmentCurrent: 1, date: '2026-06-26' },
          { installmentCurrent: 2, date: '2026-07-26' },
          { installmentCurrent: 3, date: '2026-08-26' },
          { installmentCurrent: 4, date: '2026-09-26' },
          { installmentCurrent: 5, date: '2026-10-26' },
          { installmentCurrent: 6, date: '2026-11-26' },
        ])
      })

      it('case 3: compra 28/11/2025, 12x -> 1/12 in 28/11/2025 and 12/12 in 28/10/2026', () => {
        const dates = generateInstallmentDates('2025-11-28', 12, 1, 'purchase_date')
        expect(dates).toHaveLength(12)
        expect(dates[0]).toEqual({ installmentCurrent: 1, date: '2025-11-28' })
        expect(dates[1]).toEqual({ installmentCurrent: 2, date: '2025-12-28' })
        expect(dates[2]).toEqual({ installmentCurrent: 3, date: '2026-01-28' })
        expect(dates[10]).toEqual({ installmentCurrent: 11, date: '2026-09-28' })
        expect(dates[11]).toEqual({ installmentCurrent: 12, date: '2026-10-28' })
      })

      it('case 4: current=1 continues functioning normally with both anchors', () => {
        const d1 = generateInstallmentDates('2026-05-10', 4, 1, 'purchase_date')
        const d2 = generateInstallmentDates('2026-05-10', 4, 1, 'current_installment')
        expect(d1).toEqual(d2)
        expect(d1).toEqual([
          { installmentCurrent: 1, date: '2026-05-10' },
          { installmentCurrent: 2, date: '2026-06-10' },
          { installmentCurrent: 3, date: '2026-07-10' },
          { installmentCurrent: 4, date: '2026-08-10' },
        ])
      })

      it('case 5: preserves year transitions and month-end clamping (e.g. 2026-01-31 in 4x)', () => {
        const dates = generateInstallmentDates('2026-01-31', 4, 1, 'purchase_date')
        expect(dates).toEqual([
          { installmentCurrent: 1, date: '2026-01-31' },
          { installmentCurrent: 2, date: '2026-02-28' },
          { installmentCurrent: 3, date: '2026-03-31' },
          { installmentCurrent: 4, date: '2026-04-30' },
        ])
      })
    })

    describe('parseInstallmentFromText with fractions and anchor keywords', () => {
      it('parses fraction "parcela 4/6" as current=4, total=6, anchor=current_installment', () => {
        const res = parseInstallmentFromText('Shopee compra parcela 4/6 no cartão')
        expect(res).toEqual({
          total: 6,
          current: 4,
          anchor: 'current_installment',
        })
      })

      it('parses "primeira parcela 26/06/2026 4/6" with anchor=purchase_date', () => {
        const res = parseInstallmentFromText('primeira parcela 26/06/2026 parcela 4 de 6')
        expect(res).toEqual({
          total: 6,
          current: 4,
          anchor: 'purchase_date',
        })
      })

      it('parses "comprado em 28/11/2025 em 12x" as current=1, total=12, anchor=purchase_date', () => {
        const res = parseInstallmentFromText('comprado em 28/11/2025 em 12x')
        expect(res).toEqual({
          total: 12,
          current: 1,
          anchor: 'purchase_date',
        })
      })
    })

    describe('buildFutureInstallmentRows', () => {
      it('constructs rows for installments 2..N with consistent group_id, dates, amounts, and subtotal', () => {
        const plan = resolveInstallmentPlan({
          total: 300,
          installmentTotal: 3,
        })
        const rows = buildFutureInstallmentRows(
          {
            account_id: 'acc-1',
            category: 'Alimentação',
            vendor: 'Restaurante XYZ',
            type: 'expense',
          },
          plan,
          '2026-09-23'
        )

        expect(rows).toHaveLength(2)
        expect(rows[0].installment_current).toBe(2)
        expect(rows[0].date).toBe('2026-10-23')
        expect(rows[0].total).toBe(100)
        expect(rows[0].subtotal).toBe(300)
        expect(rows[0].installment_group_id).toBe(plan.installmentGroupId)

        expect(rows[1].installment_current).toBe(3)
        expect(rows[1].date).toBe('2026-11-23')
        expect(rows[1].total).toBe(100)
        expect(rows[1].subtotal).toBe(300)
        expect(rows[1].installment_group_id).toBe(plan.installmentGroupId)
      })

      it('builds 11 future rows for 2025-11-28 12x purchase, ending in 2026-10-28', () => {
        const plan = resolveInstallmentPlan({
          total: 1200,
          installmentTotal: 12,
        })
        const rows = buildFutureInstallmentRows(
          {
            account_id: 'acc-1',
            category: 'Compras',
            vendor: 'Loja Exemplo',
            type: 'expense',
          },
          plan,
          '2025-11-28'
        )

        expect(rows).toHaveLength(11)
        expect(rows[0].installment_current).toBe(2)
        expect(rows[0].date).toBe('2025-12-28')
        expect(rows[9].installment_current).toBe(11)
        expect(rows[9].date).toBe('2026-09-28')
        expect(rows[10].installment_current).toBe(12)
        expect(rows[10].date).toBe('2026-10-28')
      })

      it('builds sibling rows when starting from intermediate installment (current=4 of 6, anchor=purchase_date)', () => {
        const plan = resolveInstallmentPlan({
          total: 387.06,
          installmentTotal: 6,
          installmentCurrent: 4,
          installmentDateAnchor: 'purchase_date',
        })
        const rows = buildFutureInstallmentRows(
          {
            account_id: 'acc-1',
            category: 'Compras',
            vendor: 'Shopee',
            type: 'expense',
          },
          plan,
          '2026-06-26'
        )

        // Sibling rows: 1, 2, 3, 5, 6 (skips 4)
        expect(rows).toHaveLength(5)
        expect(rows.map((r) => ({ current: r.installment_current, date: r.date }))).toEqual([
          { current: 1, date: '2026-06-26' },
          { current: 2, date: '2026-07-26' },
          { current: 3, date: '2026-08-26' },
          { current: 5, date: '2026-10-26' },
          { current: 6, date: '2026-11-26' },
        ])
      })
    })

    describe('save persistence with anchor semantics', () => {
      it('calculates the complete timeline first and assigns correct date to primary row (current=4, anchor=purchase_date)', async () => {
        const insertedRows: any[] = []
        const mockSupabase: any = {
          from: (table: string) => {
            if (table === 'transactions') {
              return {
                insert: vi.fn().mockImplementation((rows: any) => {
                  if (Array.isArray(rows)) insertedRows.push(...rows)
                  else insertedRows.push(rows)
                  return { error: null }
                }),
              }
            }
            return {
              select: () => ({ or: () => ({ data: [], error: null }) }),
              insert: () => ({ select: () => ({ single: () => ({ data: { id: 'dummy' }, error: null }) }) }),
            }
          },
        }
        setSupabaseClientForTesting(mockSupabase)

        const receipt: Receipt = {
          type: 'expense',
          vendor: 'Shopee',
          vendor_address: null,
          date: '2026-06-26', // Primeira parcela em junho
          time: '10:00',
          currency: 'BRL',
          category: 'Compras',
          subtotal: 387.06,
          tax: 0,
          tip: 0,
          total: 387.06,
          payment_method: 'Cartão de Crédito',
          notes: 'primeira parcela em 26/06/2026',
          installment_total: 6,
          installment_current: 4,
          installment_date_anchor: 'purchase_date',
        }

        const saved = await save({
          receipt,
          imageKey: null,
          imageSha256: null,
          allowDuplicate: true,
        })

        // Primary row returned and inserted should have date = 2026-09-26 (installment 4)
        expect(saved.date).toBe('2026-09-26')
        expect(saved.installment_current).toBe(4)
        expect(saved.installment_total).toBe(6)

        expect(insertedRows).toHaveLength(6)
        const sorted = [...insertedRows].sort((a, b) => a.installment_current - b.installment_current)
        expect(sorted.map((r) => ({ current: r.installment_current, date: r.date }))).toEqual([
          { current: 1, date: '2026-06-26' },
          { current: 2, date: '2026-07-26' },
          { current: 3, date: '2026-08-26' },
          { current: 4, date: '2026-09-26' },
          { current: 5, date: '2026-10-26' },
          { current: 6, date: '2026-11-26' },
        ])
      })
    })
  })
})



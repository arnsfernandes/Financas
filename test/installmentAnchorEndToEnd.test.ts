import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { parseInstallmentFromText, resolveInstallmentPlan, generateInstallmentDates, buildFutureInstallmentRows } from '../lib/installments'
import { parseSingleTransactionLocally } from '../lib/textRouter'
import { save, setSupabaseClientForTesting } from '../lib/persist'
import { POST as txPOST } from '../app/api/transactions/route'
import type { Account, Category, Receipt } from '../lib/schema'

const mockAccounts: Account[] = [
  {
    id: 'acc-inter-cc',
    name: 'Cartão Inter',
    type: 'credit_card',
    institution: 'Inter',
    active: true,
  },
  {
    id: 'acc-inter-checking',
    name: 'Inter Conta',
    type: 'bank_account',
    institution: 'Inter',
    active: true,
  },
]

const mockCategories: Category[] = [
  {
    id: 'cat-viagem',
    name: 'Viagem',
    normalized_name: 'viagem',
    type: 'expense',
    icon: 'Plane',
    color: '#2F68FE',
    is_system: true,
    active: true,
    sort_order: 1,
  },
  {
    id: 'cat-compras',
    name: 'Compras',
    normalized_name: 'compras',
    type: 'expense',
    icon: 'ShoppingBag',
    color: '#2F68FE',
    is_system: true,
    active: true,
    sort_order: 2,
  },
]

describe('Installment Date Anchor End-to-End Integration', () => {
  let insertedTransactions: any[] = []

  beforeEach(() => {
    insertedTransactions = []

    const mockQuery = (data: any) => {
      const q: any = {
        data,
        error: null,
        select: vi.fn(() => q),
        order: vi.fn(() => q),
        eq: vi.fn(() => q),
        ilike: vi.fn(() => q),
        single: vi.fn(() => ({ data: Array.isArray(data) ? data[0] : data, error: null })),
        then: (resolve: any) => resolve({ data, error: null }),
      }
      return q
    }

    const mockSupabase: any = {
      from: (table: string) => {
        if (table === 'transactions') {
          return {
            insert: vi.fn().mockImplementation((rows: any) => {
              if (Array.isArray(rows)) insertedTransactions.push(...rows)
              else insertedTransactions.push(rows)
              return { error: null }
            }),
            delete: () => ({ eq: () => ({ error: null }) }),
            select: () => mockQuery([]),
          }
        }
        if (table === 'transaction_items') {
          return {
            insert: vi.fn().mockReturnValue({ error: null }),
            delete: () => ({ eq: () => ({ error: null }) }),
            select: () => mockQuery([]),
          }
        }
        if (table === 'accounts') {
          return mockQuery(mockAccounts)
        }
        if (table === 'categories') {
          return mockQuery(mockCategories)
        }
        return mockQuery([])
      },
    }
    setSupabaseClientForTesting(mockSupabase)
  })

  afterEach(() => {
    setSupabaseClientForTesting(null)
  })

  describe('1. Parsing & Detection across textual variations', () => {
    it('Azul Case A: extracts purchase_date anchor when purchase/1st installment date is specified', () => {
      const parsed = parseInstallmentFromText('Azul total 446,76 em 4x de 111,69 primeira parcela/compra: 21/06/2026 parcela atual 4/4')
      expect(parsed).toEqual({
        total: 4,
        current: 4,
        anchor: 'purchase_date',
      })
    })

    it('Azul Case B: extracts current_installment anchor when current installment date is specified without purchase anchor', () => {
      const parsed = parseInstallmentFromText('Azul 446,76 4x 111,69 parcela atual 4/4 em 21/09/2026')
      expect(parsed).toEqual({
        total: 4,
        current: 4,
        anchor: 'current_installment',
      })
    })

    it('Shopee Case: "Shopee 64,51 parcela 4/6 data 26/09/2026" parses as current_installment', () => {
      const parsed = parseInstallmentFromText('Shopee 64,51 parcela 4/6 data 26/09/2026')
      expect(parsed).toEqual({
        total: 6,
        current: 4,
        anchor: 'current_installment',
      })
    })

    it('Shopee Case: "Shopee 64,51 4/6 primeira parcela 26/06/2026" parses as purchase_date', () => {
      const parsed = parseInstallmentFromText('Shopee 64,51 4/6 primeira parcela 26/06/2026')
      expect(parsed).toEqual({
        total: 6,
        current: 4,
        anchor: 'purchase_date',
      })
    })

    it('Livelo Case: "Livelo 1200 10x compra em 15/01/2026 parcela 3/10" parses as purchase_date', () => {
      const parsed = parseInstallmentFromText('Livelo 1200 10x compra em 15/01/2026 parcela 3/10')
      expect(parsed).toEqual({
        total: 10,
        current: 3,
        anchor: 'purchase_date',
      })
    })
  })

  describe('2. Timeline generation equivalence', () => {
    it('Azul Case: purchase date 21/06/2026 (current 4/4) and current date 21/09/2026 (current 4/4) produce the EXACT same dates', () => {
      const timelineFromPurchase = generateInstallmentDates('2026-06-21', 4, 4, 'purchase_date')
      const timelineFromCurrent = generateInstallmentDates('2026-09-21', 4, 4, 'current_installment')

      expect(timelineFromPurchase).toEqual([
        { installmentCurrent: 1, date: '2026-06-21' },
        { installmentCurrent: 2, date: '2026-07-21' },
        { installmentCurrent: 3, date: '2026-08-21' },
        { installmentCurrent: 4, date: '2026-09-21' },
      ])

      expect(timelineFromCurrent).toEqual(timelineFromPurchase)
    })

    it('Shopee Case: purchase date 26/06/2026 (current 4/6) and current date 26/09/2026 (current 4/6) produce the EXACT same dates', () => {
      const timelineFromPurchase = generateInstallmentDates('2026-06-26', 6, 4, 'purchase_date')
      const timelineFromCurrent = generateInstallmentDates('2026-09-26', 6, 4, 'current_installment')

      expect(timelineFromPurchase).toEqual([
        { installmentCurrent: 1, date: '2026-06-26' },
        { installmentCurrent: 2, date: '2026-07-26' },
        { installmentCurrent: 3, date: '2026-08-26' },
        { installmentCurrent: 4, date: '2026-09-26' },
        { installmentCurrent: 5, date: '2026-10-26' },
        { installmentCurrent: 6, date: '2026-11-26' },
      ])

      expect(timelineFromCurrent).toEqual(timelineFromPurchase)
    })
  })

  describe('3. Web Flow Integration (API Preview -> UI Draft -> Confirmation Save)', () => {
    it('Azul Real Flow: saves purchase date 21/06/2026 with current=4/4 and produces June -> September 2026 in DB', async () => {
      // Step 1: User enters text or fills web form
      const initialPayload = {
        sourceType: 'manual',
        allowDuplicate: true,
        receipt: {
          type: 'expense',
          vendor: 'Azul',
          account_id: 'acc-inter-cc',
          category: 'Viagem',
          payment_method: 'Cartão de Crédito',
          date: '2026-06-21', // Purchase date
          total: 111.69,
          subtotal: 446.76,
          installment_total: 4,
          installment_current: 4,
          installment_amount: 111.69,
          installment_date_anchor: 'purchase_date',
          notes: 'primeira parcela/compra: 21/06/2026',
        },
      }

      const req = new NextRequest('http://localhost:3000/api/transactions', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(initialPayload),
      })

      const res = await txPOST(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.ok).toBe(true)

      // Verify all 4 transactions inserted into DB
      expect(insertedTransactions).toHaveLength(4)
      const sorted = [...insertedTransactions].sort((a, b) => a.installment_current - b.installment_current)

      expect(sorted[0]).toMatchObject({
        vendor: 'Azul',
        installment_current: 1,
        installment_total: 4,
        date: '2026-06-21',
        total: 111.69,
        subtotal: 446.76,
      })

      expect(sorted[1]).toMatchObject({
        vendor: 'Azul',
        installment_current: 2,
        installment_total: 4,
        date: '2026-07-21',
        total: 111.69,
        subtotal: 446.76,
      })

      expect(sorted[2]).toMatchObject({
        vendor: 'Azul',
        installment_current: 3,
        installment_total: 4,
        date: '2026-08-21',
        total: 111.69,
        subtotal: 446.76,
      })

      expect(sorted[3]).toMatchObject({
        vendor: 'Azul',
        installment_current: 4,
        installment_total: 4,
        date: '2026-09-21',
        total: 111.69,
        subtotal: 446.76,
      })
    })

    it('Azul Real Flow: saves current date 21/09/2026 with anchor current_installment and produces June -> September 2026 in DB', async () => {
      const initialPayload = {
        sourceType: 'manual',
        allowDuplicate: true,
        receipt: {
          type: 'expense',
          vendor: 'Azul',
          account_id: 'acc-inter-cc',
          category: 'Viagem',
          payment_method: 'Cartão de Crédito',
          date: '2026-09-21', // Current installment date
          total: 111.69,
          subtotal: 446.76,
          installment_total: 4,
          installment_current: 4,
          installment_amount: 111.69,
          installment_date_anchor: 'current_installment',
          notes: 'parcela atual 4/4',
        },
      }

      const req = new NextRequest('http://localhost:3000/api/transactions', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(initialPayload),
      })

      const res = await txPOST(req)
      expect(res.status).toBe(200)

      expect(insertedTransactions).toHaveLength(4)
      const sorted = [...insertedTransactions].sort((a, b) => a.installment_current - b.installment_current)

      expect(sorted.map((r) => ({ current: r.installment_current, date: r.date }))).toEqual([
        { current: 1, date: '2026-06-21' },
        { current: 2, date: '2026-07-21' },
        { current: 3, date: '2026-08-21' },
        { current: 4, date: '2026-09-21' },
      ])
    })
  })

  describe('4. Telegram & Local Parse Flow Integration', () => {
    it('parses local transaction with purchase date anchor and saves correct sequence', async () => {
      const localResult = parseSingleTransactionLocally(
        'Azul 446.76 em 4x no Cartão Inter',
        mockAccounts,
        mockCategories
      )

      expect(localResult.success).toBe(true)
      expect(localResult.receipt).toBeDefined()
      expect(localResult.receipt?.installment_total).toBe(4)
      expect(localResult.receipt?.installment_current).toBe(1)
      expect(localResult.receipt?.installment_date_anchor).toBe('purchase_date')

      const saved = await save({
        receipt: {
          ...localResult.receipt!,
          date: '2026-06-21',
        },
        imageKey: null,
        imageSha256: null,
        allowDuplicate: true,
      })

      expect(saved.installment_total).toBe(4)
      expect(insertedTransactions).toHaveLength(4)
      const sorted = [...insertedTransactions].sort((a, b) => a.installment_current - b.installment_current)
      expect(sorted.map((r) => ({ current: r.installment_current, date: r.date }))).toEqual([
        { current: 1, date: '2026-06-21' },
        { current: 2, date: '2026-07-21' },
        { current: 3, date: '2026-08-21' },
        { current: 4, date: '2026-09-21' },
      ])
    })
  })
})

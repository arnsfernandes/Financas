import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { parseInstallmentFromText, resolveInstallmentPlan, generateInstallmentDates, buildFutureInstallmentRows } from '../lib/installments'
import { parseSingleTransactionLocally } from '../lib/textRouter'
import { save, setSupabaseClientForTesting } from '../lib/persist'
import { POST as txPOST } from '../app/api/transactions/route'
import type { Account, Category, Receipt } from '../lib/schema'

// Exercise the actual component's controls and save handler without a browser or
// network. Only React's hook storage is simulated; payload assembly is production code.
const formHarness = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, fetch: vi.fn() }))
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useState: (initial: any) => {
      const index = formHarness.cursor++
      if (!(index in formHarness.slots)) {
        formHarness.slots[index] = typeof initial === 'function' ? initial() : initial
      }
      return [formHarness.slots[index], (value: any) => {
        formHarness.slots[index] = typeof value === 'function' ? value(formHarness.slots[index]) : value
      }]
    },
    useRef: (initial: any) => {
      const index = formHarness.cursor++
      return formHarness.slots[index] ??= { current: initial }
    },
  }
})
vi.mock('../lib/useTelegramWebApp', () => ({
  useTelegramWebApp: () => ({ fetchWithAuth: formHarness.fetch }),
}))
import { NewLaunchTab } from '../components/launch/NewLaunchTab'
import { AccountSelect } from '../components/accounts/AccountSelect'
import { receiptSchema, normaliseReceipt } from '../lib/schema'

function nodes(node: any): any[] {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  return [node, ...nodes(node.props?.children)]
}
function textContent(node: any): string {
  if (Array.isArray(node)) return node.map(textContent).join('')
  if (node && typeof node === 'object') return textContent(node.props?.children)
  return typeof node === 'string' || typeof node === 'number' ? String(node) : ''
}
function renderManualForm() {
  formHarness.cursor = 0
  return nodes(NewLaunchTab({ accounts: mockAccounts, initialMode: 'manual' }))
}
function control(predicate: (node: any) => boolean) {
  const found = renderManualForm().find(predicate)
  expect(found, 'form control must exist').toBeDefined()
  return found.props
}
function button(label: string) {
  return control(n => n.type === 'button' && textContent(n).includes(label))
}

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
    it('Azul Real Reproducing Case: "4x, primeira parcela 21/06/2026, atual 4/4" parses as purchase_date anchor', () => {
      const parsed = parseInstallmentFromText('Azul 446,76 em 4x de 111,69 primeira parcela 21/06/2026 atual 4/4')
      expect(parsed).toEqual({
        total: 4,
        current: 4,
        anchor: 'purchase_date',
      })
    })

    it('Default without anchor keywords: "Azul 446,76 4x 4/4 data 21/06/2026" parses as purchase_date anchor', () => {
      const parsed = parseInstallmentFromText('Azul 446,76 4x 4/4 data 21/06/2026')
      expect(parsed).toEqual({
        total: 4,
        current: 4,
        anchor: 'purchase_date',
      })
    })

    it('Shopee Case: "Shopee 64,51 parcela 4/6 data 26/09/2026" parses as purchase_date by default', () => {
      const parsed = parseInstallmentFromText('Shopee 64,51 parcela 4/6 data 26/09/2026')
      expect(parsed).toEqual({
        total: 6,
        current: 4,
        anchor: 'purchase_date',
      })
    })

    it('Explicit current installment date anchor: "Shopee 64,51 parcela 4/6 data da parcela atual 26/09/2026" parses as current_installment', () => {
      const parsed = parseInstallmentFromText('Shopee 64,51 parcela 4/6 data da parcela atual 26/09/2026')
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

  describe('Real NewLaunchTab manual save handler', () => {
    beforeEach(() => {
      formHarness.slots = []
      formHarness.fetch.mockReset()
      vi.useFakeTimers()
    })
    afterEach(() => vi.useRealTimers())

    it('saves actual manual form payload with canonical purchase date anchor (never moving backward)', async () => {
      const change = (predicate: (node: any) => boolean, value: string) =>
        control(predicate).onChange({ target: { value } })
      change(n => n.props?.placeholder === '0,00', '111,69')
      change(n => n.props?.placeholder === 'Ex: Carrefour, Padaria, Uber...', 'Azul')
      change(n => n.type === 'input' && n.props.type === 'date', '2026-06-21')
      control(n => n.type === AccountSelect).onChange('acc-inter-cc')
      change(n => n.type === 'select', 'Cartão de Crédito')
      button('Compra Parcelada').onClick()
      change(n => n.type === 'input' && n.props.type === 'number' && n.props.min === '1', '4')
      change(n => n.type === 'input' && n.props.type === 'number' && n.props.min === '2', '4')
      expect(insertedTransactions).toHaveLength(0)
      expect(formHarness.fetch).not.toHaveBeenCalled()

      let sent: any
      let apiResponse: any
      formHarness.fetch.mockImplementation(async (url, request) => {
        expect(url).toBe('/api/transactions')
        sent = JSON.parse(request.body)
        const response = await txPOST(new NextRequest('http://localhost:3000' + url, { ...request, headers: { ...request.headers, host: 'localhost:3000' } }))
        apiResponse = await response.clone().json()
        return response
      })
      await button('Salvar Lançamento').onClick()
      expect(formHarness.fetch).toHaveBeenCalledTimes(1)
      expect(apiResponse, JSON.stringify(apiResponse)).toMatchObject({ ok: true })
      expect(sent.receipt.installment_date_anchor).toBe('purchase_date')
      expect(sent.receipt).toMatchObject({ date: '2026-06-21', installment_current: 4, installment_total: 4 })
      const schemaInput = { vendor_address: null, currency: 'BRL', tax: null, tip: null, ...sent.receipt }
      expect(receiptSchema.parse(schemaInput).installment_date_anchor).toBe('purchase_date')
      expect(normaliseReceipt(schemaInput).installment_date_anchor).toBe('purchase_date')
      const sorted = [...insertedTransactions].sort((a, b) => a.installment_current - b.installment_current)
      expect(sorted.map(r => [r.installment_current, r.date])).toEqual([
        [1, '2026-06-21'],
        [2, '2026-07-21'],
        [3, '2026-08-21'],
        [4, '2026-09-21']
      ])
    })
  })

  describe('3. Web Flow Integration (API Preview -> UI Draft -> Confirmation Save)', () => {
    it('Direct Manual Form: user fills date 21/06/2026, 4x, parcela atual 4/4 with pure form fields, generates June -> September', async () => {
      // Direct manual form fill in NewLaunchTab (no text/AI, no notes)
      const manualPayload = {
        sourceType: 'manual',
        rawText: null,
        originalExtractedData: null,
        allowDuplicate: true,
        receipt: {
          type: 'expense',
          vendor: 'Azul',
          account_id: 'acc-inter-cc',
          category: 'Viagem',
          payment_method: 'Cartão de Crédito',
          date: '2026-06-21',
          total: 111.69,
          installment_amount: 111.69,
          subtotal: 446.76,
          installment_total: 4,
          installment_current: 4,
          installment_date_anchor: 'purchase_date',
          notes: null,
        },
      }

      const req = new NextRequest('http://localhost:3000/api/transactions', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(manualPayload),
      })

      const res = await txPOST(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.ok).toBe(true)

      expect(insertedTransactions).toHaveLength(4)
      const sorted = [...insertedTransactions].sort((a, b) => a.installment_current - b.installment_current)

      expect(sorted[0]).toMatchObject({ installment_current: 1, date: '2026-06-21' })
      expect(sorted[1]).toMatchObject({ installment_current: 2, date: '2026-07-21' })
      expect(sorted[2]).toMatchObject({ installment_current: 3, date: '2026-08-21' })
      expect(sorted[3]).toMatchObject({ installment_current: 4, date: '2026-09-21' })
    })

    it('Direct Manual Form without explicit installment_date_anchor defaults to purchase_date', async () => {
      const manualPayload = {
        sourceType: 'manual',
        rawText: null,
        originalExtractedData: null,
        allowDuplicate: true,
        receipt: {
          type: 'expense',
          vendor: 'Azul',
          account_id: 'acc-inter-cc',
          category: 'Viagem',
          payment_method: 'Cartão de Crédito',
          date: '2026-06-21',
          total: 111.69,
          installment_amount: 111.69,
          subtotal: 446.76,
          installment_total: 4,
          installment_current: 4,
          // installment_date_anchor omitted
          notes: null,
        },
      }

      const req = new NextRequest('http://localhost:3000/api/transactions', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(manualPayload),
      })

      const res = await txPOST(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.ok).toBe(true)

      expect(insertedTransactions).toHaveLength(4)
      const sorted = [...insertedTransactions].sort((a, b) => a.installment_current - b.installment_current)

      expect(sorted[0]).toMatchObject({ installment_current: 1, date: '2026-06-21' })
      expect(sorted[1]).toMatchObject({ installment_current: 2, date: '2026-07-21' })
      expect(sorted[2]).toMatchObject({ installment_current: 3, date: '2026-08-21' })
      expect(sorted[3]).toMatchObject({ installment_current: 4, date: '2026-09-21' })
    })

    it('Azul Real Flow: saves current date 21/09/2026 with explicit anchor current_installment and produces June -> September 2026 in DB', async () => {
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
          notes: 'data da parcela atual: 21/09/2026 parcela atual 4/4',
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
    it('parses real reproducing case "Azul 446.76 em 4x primeira parcela 21/06/2026 atual 4/4" and saves June -> September 2026', async () => {
      const localResult = parseSingleTransactionLocally(
        'Azul 446.76 em 4x primeira parcela 21/06/2026 atual 4/4 no Cartão Inter',
        mockAccounts,
        mockCategories
      )

      expect(localResult.success).toBe(true)
      expect(localResult.receipt).toBeDefined()
      expect(localResult.receipt?.installment_total).toBe(4)
      expect(localResult.receipt?.installment_current).toBe(4)
      expect(localResult.receipt?.date).toBe('2026-06-21')
      expect(localResult.receipt?.installment_date_anchor).toBe('purchase_date')

      const saved = await save({
        receipt: localResult.receipt!,
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

    it('parses local transaction without explicit anchor keywords and defaults to purchase_date', async () => {
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

    it('validates direct save() canonical rows generation: date=2026-06-21, current=4, total=4, anchor=purchase_date -> produces exactly June to September rows in allTxRowsToInsert', async () => {
      const saved = await save({
        receipt: {
          vendor: 'Azul',
          account_id: 'acc-inter-cc',
          category: 'Viagem',
          payment_method: 'Cartão de Crédito',
          date: '2026-06-21',
          total: 111.69,
          subtotal: 446.76,
          installment_total: 4,
          installment_current: 4,
          installment_amount: 111.69,
          installment_date_anchor: 'purchase_date',
        },
        imageKey: null,
        imageSha256: null,
        allowDuplicate: true,
      })

      expect(saved.installment_total).toBe(4)
      expect(saved.date).toBe('2026-09-21') // Saved primary row (current 4) has date 2026-09-21
      expect(insertedTransactions).toHaveLength(4)

      // Verify each row in inserted batch
      const row1 = insertedTransactions.find((r) => r.installment_current === 1)
      const row2 = insertedTransactions.find((r) => r.installment_current === 2)
      const row3 = insertedTransactions.find((r) => r.installment_current === 3)
      const row4 = insertedTransactions.find((r) => r.installment_current === 4)

      expect(row1).toBeDefined()
      expect(row2).toBeDefined()
      expect(row3).toBeDefined()
      expect(row4).toBeDefined()

      expect(row1.date).toBe('2026-06-21')
      expect(row2.date).toBe('2026-07-21')
      expect(row3.date).toBe('2026-08-21')
      expect(row4.date).toBe('2026-09-21')

      // Check that all rows share the same group ID
      expect(row1.installment_group_id).toBe(row4.installment_group_id)
      expect(row2.installment_group_id).toBe(row4.installment_group_id)
      expect(row3.installment_group_id).toBe(row4.installment_group_id)

      // Check that row4 has the primary transaction id
      expect(row4.id).toBe(saved.id)
    })
  })
})

